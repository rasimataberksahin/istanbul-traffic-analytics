using Dapper;
using IstanbulTraffic.Application.Abstractions;
using IstanbulTraffic.Infrastructure.Analytics;
using IstanbulTraffic.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Npgsql;

namespace IstanbulTraffic.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Traffic");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException("ConnectionStrings:Traffic is required.");
        }

        DefaultTypeMap.MatchNamesWithUnderscores = true;
        SqlMapper.AddTypeHandler(new DateOnlyTypeHandler());

        services.AddSingleton(_ => NpgsqlDataSource.Create(connectionString));
        services.AddDbContext<AdminDbContext>((provider, options) => options.UseNpgsql(
            provider.GetRequiredService<NpgsqlDataSource>(),
            npgsql => npgsql.MigrationsHistoryTable(AdminDbContext.MigrationsTable, AdminDbContext.Schema)));

        services.AddScoped<ITrafficAnalyticsRepository, TrafficAnalyticsRepository>();
        services.AddScoped<ILocationAnalyticsRepository, LocationAnalyticsRepository>();
        services.AddScoped<IInsightsRepository, InsightsRepository>();
        services.AddScoped<IPipelineSnapshotReader, PipelineSnapshotReader>();
        services.AddScoped<IAdminRepository, AdminRepository>();
        return services;
    }

    public static async Task ApplyAdminMigrationsAsync(this IServiceProvider services, CancellationToken cancellationToken = default)
    {
        await using var scope = services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AdminDbContext>();
        await dbContext.Database.MigrateAsync(cancellationToken);
    }
}

public sealed class DatabaseHealthCheck(NpgsqlDataSource dataSource) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        try
        {
            await using var command = dataSource.CreateCommand("SELECT 1");
            await command.ExecuteScalarAsync(cancellationToken);
            return HealthCheckResult.Healthy();
        }
        catch (NpgsqlException exception)
        {
            return HealthCheckResult.Unhealthy("The database is not reachable.", exception);
        }
    }
}
