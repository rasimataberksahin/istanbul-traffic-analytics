using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Npgsql;
using Testcontainers.PostgreSql;

namespace IstanbulTraffic.IntegrationTests;

[CollectionDefinition(Name)]
public sealed class ApiCollection : ICollectionFixture<ApiFixture>
{
    public const string Name = "api";
}

/// <summary>Runs the API against a disposable PostgreSQL server with known data.</summary>
public sealed class ApiFixture : IAsyncLifetime
{
    public const string AdminApiKey = "integration-test-admin-key";

    private const string SeedSql = """
        SELECT traffic.ensure_month('2023-10-01');
        SELECT traffic.ensure_month('2024-10-01');

        INSERT INTO traffic.dim_location (geohash, latitude, longitude) VALUES
            ('sxk96p', 41.0421752929688, 28.9215087890625),
            ('sxk3z1', 41.0971069335938, 28.7896728515625),
            ('sxk1v2', 41.0916137695313, 28.3612060546875),
            ('sxk3pq', 40.9927368164063, 28.8006591796875);

        UPDATE traffic.dim_location SET neighborhood = 'Merkezefendi', district = 'Zeytinburnu' WHERE geohash = 'sxk96p';

        INSERT INTO traffic.fact_traffic_hourly (
            observed_at, location_id, min_speed_kmh, max_speed_kmh, avg_speed_kmh, vehicle_count,
            is_weekend, is_public_holiday, is_low_sample, is_speed_outlier, is_max_speed_suspect,
            is_partial_hour, is_analysis_eligible)
        SELECT
            hour, cell.location_id, 5, 120,
            cell.speed - CASE WHEN EXTRACT(HOUR FROM hour) = 18 THEN 10 ELSE 0 END,
            cell.vehicles,
            EXTRACT(ISODOW FROM hour) >= 6, hour::date = DATE '2024-10-29',
            false, false, false, false, true
        FROM generate_series(TIMESTAMP '2024-10-01 00:00', TIMESTAMP '2024-10-31 23:00', INTERVAL '1 hour') AS hour
        CROSS JOIN (VALUES (1, 30, 10), (2, 50, 20), (3, 70, 30)) AS cell (location_id, speed, vehicles);

        INSERT INTO traffic.fact_traffic_hourly (
            observed_at, location_id, min_speed_kmh, max_speed_kmh, avg_speed_kmh, vehicle_count,
            is_weekend, is_public_holiday, is_low_sample, is_speed_outlier, is_max_speed_suspect,
            is_partial_hour, is_analysis_eligible)
        VALUES ('2024-10-01 00:00', 4, 100, 200, 170, 2, false, false, true, true, false, false, false);

        -- October 2023: the same cells, 15 km/h faster for the first cell and 5 km/h for the others.
        INSERT INTO traffic.fact_traffic_hourly (
            observed_at, location_id, min_speed_kmh, max_speed_kmh, avg_speed_kmh, vehicle_count,
            is_weekend, is_public_holiday, is_low_sample, is_speed_outlier, is_max_speed_suspect,
            is_partial_hour, is_analysis_eligible)
        SELECT
            hour, cell.location_id, 5, 120,
            cell.speed - CASE WHEN EXTRACT(HOUR FROM hour) = 18 THEN 10 ELSE 0 END,
            cell.vehicles,
            EXTRACT(ISODOW FROM hour) >= 6, hour::date = DATE '2023-10-29',
            false, false, false, false, true
        FROM generate_series(TIMESTAMP '2023-10-01 00:00', TIMESTAMP '2023-10-31 23:00', INTERVAL '1 hour') AS hour
        CROSS JOIN (VALUES (1, 45, 10), (2, 55, 20), (3, 75, 30)) AS cell (location_id, speed, vehicles);

        INSERT INTO traffic.load_audit (month, source_file, source_sha256, row_count, vehicle_total, location_count) VALUES
            ('2023-10-01', 'traffic_clean_202310.parquet', repeat('b', 64), 2232, 44640, 3),
            ('2024-10-01', 'traffic_clean_202410.parquet', repeat('a', 64), 2233, 44642, 4);

        SELECT traffic.refresh_month_aggregates('2023-10-01');
        SELECT traffic.refresh_month_aggregates('2024-10-01');

        -- Dry October 2024 except 2 mm of rain in each hour of the evening of Wednesday 2 October.
        INSERT INTO traffic.weather_hourly (observed_at, temperature_c, precipitation_mm, snowfall_cm, weather_code)
        SELECT
            hour, 18,
            CASE WHEN hour::date = DATE '2024-10-02' AND EXTRACT(HOUR FROM hour) BETWEEN 17 AND 19 THEN 2 ELSE 0 END,
            0, 0
        FROM generate_series(TIMESTAMP '2024-10-01 00:00', TIMESTAMP '2024-10-31 23:00', INTERVAL '1 hour') AS hour;
        """;

    private readonly PostgreSqlContainer _database = new PostgreSqlBuilder("postgres:18.6").Build();

    public WebApplicationFactory<Program> Factory { get; private set; } = null!;

    public HttpClient CreateClient() => Factory.CreateClient();

    public WebApplicationFactory<Program> CreateFactory(params (string Key, string Value)[] settings) =>
        Factory.WithWebHostBuilder(builder =>
        {
            foreach (var (key, value) in settings)
            {
                builder.UseSetting(key, value);
            }
        });

    public async Task<object?> ScalarAsync(string sql)
    {
        await using var connection = new NpgsqlConnection(_database.GetConnectionString());
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        return await command.ExecuteScalarAsync();
    }

    public async ValueTask InitializeAsync()
    {
        await _database.StartAsync();

        await using (var connection = new NpgsqlConnection(_database.GetConnectionString()))
        {
            await connection.OpenAsync();
            foreach (var file in Directory.GetFiles(FindSchemaDirectory(), "*.sql").Order(StringComparer.Ordinal))
            {
                await using var schema = new NpgsqlCommand(await File.ReadAllTextAsync(file), connection);
                await schema.ExecuteNonQueryAsync();
            }

            await using var seed = new NpgsqlCommand(SeedSql, connection);
            await seed.ExecuteNonQueryAsync();
        }

        var connectionString = _database.GetConnectionString();
        Factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Testing");
            builder.UseSetting("ConnectionStrings:Traffic", connectionString);
            builder.UseSetting("Admin:ApiKey", AdminApiKey);
            builder.UseSetting("Database:ApplyMigrationsOnStartup", "true");
            builder.UseSetting("RateLimiting:PermitLimit", "100000");
        });
        _ = Factory.Server;
    }

    public async ValueTask DisposeAsync()
    {
        await Factory.DisposeAsync();
        await _database.DisposeAsync();
    }

    private static string FindSchemaDirectory()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
        {
            var path = Path.Combine(directory.FullName, "database", "schema");
            if (File.Exists(Path.Combine(path, "001_traffic.sql")))
            {
                return path;
            }
        }

        throw new DirectoryNotFoundException("database/schema was not found.");
    }
}
