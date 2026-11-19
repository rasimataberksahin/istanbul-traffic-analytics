using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace IstanbulTraffic.IntegrationTests;

[Collection(ApiCollection.Name)]
public sealed class TrafficEndpointTests(ApiFixture fixture)
{
    private readonly HttpClient _client = fixture.CreateClient();

    [Fact]
    public async Task Summary_uses_vehicle_weighting_and_skips_ineligible_rows()
    {
        var summary = await GetAsync("/api/v1/traffic/summary?from=2024-10-01&to=2024-10-31");
        var totals = summary.GetProperty("totals");

        Assert.Equal(2232, totals.GetProperty("observationCount").GetInt64());
        Assert.Equal(3, totals.GetProperty("locationCount").GetInt32());
        Assert.Equal(56.25m, totals.GetProperty("weightedAverageSpeedKmh").GetDecimal());
        Assert.Equal(49.58m, totals.GetProperty("simpleAverageSpeedKmh").GetDecimal());
        Assert.Equal(18, summary.GetProperty("slowestHour").GetProperty("hourOfDay").GetInt32());
    }

    [Theory]
    [InlineData("from=2024-10-01&to=2024-10-31&dayType=weekend", 576)]
    [InlineData("from=2024-10-01&to=2024-10-31&dayType=holiday", 72)]
    [InlineData("dayType=holiday", 144)]
    [InlineData("", 4464)]
    [InlineData("from=2024-10-01&to=2024-10-01", 72)]
    [InlineData("from=2025-01-01&to=2025-01-31", 0)]
    public async Task Summary_applies_filters(string query, long expectedObservations)
    {
        var summary = await GetAsync($"/api/v1/traffic/summary?{query}");

        Assert.Equal(expectedObservations, summary.GetProperty("totals").GetProperty("observationCount").GetInt64());
    }

    [Fact]
    public async Task Hourly_profile_has_one_point_per_hour()
    {
        var profile = await GetAsync("/api/v1/traffic/hourly-profile?from=2024-10-01&to=2024-10-31&dayType=weekday");

        Assert.Equal(24, profile.GetArrayLength());
        Assert.Equal(46.67m, profile[18].GetProperty("weightedAverageSpeedKmh").GetDecimal());
    }

    [Fact]
    public async Task Daily_trend_marks_holidays()
    {
        var trend = await GetAsync("/api/v1/traffic/daily-trend?from=2024-10-01&to=2024-10-31");

        Assert.Equal(31, trend.GetArrayLength());
        Assert.True(trend[28].GetProperty("hasPublicHoliday").GetBoolean());
        Assert.Equal("Salı", trend[28].GetProperty("dayName").GetString());
    }

    [Fact]
    public async Task Heatmap_returns_date_and_hour_cells()
    {
        var heatmap = await GetAsync("/api/v1/traffic/heatmap?from=2024-10-01&to=2024-10-02");

        Assert.Equal(48, heatmap.GetArrayLength());
        Assert.Equal("2024-10-01", heatmap[0].GetProperty("date").GetString());
    }

    [Fact]
    public async Task Day_type_comparison_returns_each_hour()
    {
        var comparison = await GetAsync("/api/v1/traffic/day-type-comparison");

        Assert.Equal(24, comparison.GetArrayLength());
        Assert.Equal(0m, comparison[8].GetProperty("weekendAdvantageKmh").GetDecimal());
    }

    [Fact]
    public async Task Speed_bands_sum_to_one_hundred_percent()
    {
        var bands = await GetAsync("/api/v1/traffic/speed-bands");

        Assert.Equal(3, bands.GetArrayLength());
        Assert.Equal(100m, bands.EnumerateArray().Sum(band => band.GetProperty("vehicleSharePct").GetDecimal()), 1);
    }

    [Fact]
    public async Task Metadata_describes_the_loaded_data()
    {
        var metadata = await GetAsync("/api/v1/metadata");

        Assert.Equal("2023-10-01", metadata.GetProperty("firstDate").GetString());
        Assert.Equal("2024-10-31", metadata.GetProperty("lastDate").GetString());
        Assert.Equal(["2023-10-01", "2024-10-01"], metadata.GetProperty("loadedMonths").EnumerateArray().Select(month => month.GetString()));
        Assert.Equal("weekday", metadata.GetProperty("dayTypes")[1].GetString());
    }

    [Theory]
    [InlineData("from=2024-10-31&to=2024-10-01", "to")]
    [InlineData("from=not-a-date", "From")]
    [InlineData("dayType=someday", "DayType")]
    public async Task Invalid_filters_return_validation_problems(string query, string field)
    {
        var response = await _client.GetAsync($"/api/v1/traffic/summary?{query}");
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.True(problem.GetProperty("errors").TryGetProperty(field, out _));
    }

    private async Task<JsonElement> GetAsync(string path)
    {
        var response = await _client.GetAsync(path);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }
}

[Collection(ApiCollection.Name)]
public sealed class LocationEndpointTests(ApiFixture fixture)
{
    private readonly HttpClient _client = fixture.CreateClient();

    [Fact]
    public async Task Slowest_locations_are_ranked()
    {
        var locations = await _client.GetFromJsonAsync<JsonElement>("/api/v1/locations/slowest?from=2024-10-01&to=2024-10-31&dayType=weekday&limit=2");

        Assert.Equal(2, locations.GetArrayLength());
        Assert.Equal("sxk96p", locations[0].GetProperty("geohash").GetString());
        Assert.Equal(1, locations[0].GetProperty("rank").GetInt32());
        Assert.Equal(26.67m, locations[0].GetProperty("weightedAverageSpeedKmh").GetDecimal());
    }

    [Fact]
    public async Task Congestion_map_compares_evening_with_night()
    {
        var points = await _client.GetFromJsonAsync<JsonElement>("/api/v1/locations/congestion-map?from=2024-10-01&to=2024-10-31");
        var point = points.EnumerateArray().Single(item => item.GetProperty("geohash").GetString() == "sxk96p");

        Assert.Equal(3, points.GetArrayLength());
        Assert.Equal(30m, point.GetProperty("freeFlowSpeedKmh").GetDecimal());
        Assert.Equal(0.111m, point.GetProperty("congestionIndex").GetDecimal());
    }

    [Fact]
    public async Task Location_profile_returns_hourly_values()
    {
        var profile = await _client.GetFromJsonAsync<JsonElement>("/api/v1/locations/SXK96P/profile?from=2024-10-01&to=2024-10-31");

        Assert.Equal("sxk96p", profile.GetProperty("location").GetProperty("geohash").GetString());
        Assert.Equal(744, profile.GetProperty("location").GetProperty("observationCount").GetInt64());
        Assert.Equal(24, profile.GetProperty("hourlyProfile").GetArrayLength());
    }

    [Theory]
    [InlineData("sxk000", HttpStatusCode.NotFound)]
    [InlineData("invalid", HttpStatusCode.BadRequest)]
    public async Task Bad_locations_return_problems(string geohash, HttpStatusCode expected)
    {
        var response = await _client.GetAsync($"/api/v1/locations/{geohash}/profile");

        Assert.Equal(expected, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Too_large_limit_is_rejected()
    {
        var response = await _client.GetAsync("/api/v1/locations/slowest?limit=1000");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}

[Collection(ApiCollection.Name)]
public sealed class PipelineEndpointTests(ApiFixture fixture)
{
    private readonly HttpClient _client = fixture.CreateClient();

    [Fact]
    public async Task Migration_creates_the_admin_schema_and_seed_data()
    {
        var sources = await _client.GetFromJsonAsync<JsonElement>("/api/v1/pipeline/data-sources");
        var migrations = await fixture.ScalarAsync("SELECT COUNT(*) FROM admin.__ef_migrations_history");

        Assert.Equal("ibb-hourly-traffic", sources[0].GetProperty("code").GetString());
        Assert.Equal(1L, migrations);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("wrong-key")]
    public async Task Sync_requires_the_api_key(string? apiKey)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/pipeline/sync");
        if (apiKey is not null)
        {
            request.Headers.Add("X-Api-Key", apiKey);
        }

        var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Sync_publishes_the_load_history_once()
    {
        var first = await SyncAsync();
        var second = await SyncAsync();
        var runs = await _client.GetFromJsonAsync<JsonElement>("/api/v1/pipeline/import-runs");
        var quality = runs[0].GetProperty("qualityResults").EnumerateArray()
            .Single(item => item.GetProperty("metric").GetString() == "analysis_eligible");

        Assert.Equal(2, first.GetProperty("created").GetInt32() + first.GetProperty("unchanged").GetInt32());
        Assert.Equal(2, second.GetProperty("unchanged").GetInt32());
        Assert.Equal(2, runs.GetArrayLength());
        Assert.Equal("2024-10-01", runs[0].GetProperty("month").GetString());
        Assert.Equal(6, runs[0].GetProperty("qualityResults").GetArrayLength());
        Assert.Equal(2232, quality.GetProperty("rowCount").GetInt64());
    }

    private async Task<JsonElement> SyncAsync()
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/pipeline/sync");
        request.Headers.Add("X-Api-Key", ApiFixture.AdminApiKey);
        var response = await _client.SendAsync(request);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }
}

[Collection(ApiCollection.Name)]
public sealed class PlatformTests(ApiFixture fixture)
{
    private readonly HttpClient _client = fixture.CreateClient();

    [Fact]
    public async Task Health_endpoints_report_ready()
    {
        Assert.Equal(HttpStatusCode.OK, (await _client.GetAsync("/health/live")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await _client.GetAsync("/health/ready")).StatusCode);
    }

    [Fact]
    public async Task OpenApi_document_lists_the_endpoints()
    {
        var document = await _client.GetStringAsync("/openapi/v1.json");

        Assert.Contains("/api/v1/traffic/summary", document);
        Assert.Contains("/api/v1/locations/congestion-map", document);
        Assert.Contains("/api/v1/insights/location-changes", document);
    }

    [Fact]
    public async Task Correlation_id_appears_in_headers_and_problems()
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/locations/invalid/profile");
        request.Headers.Add("X-Correlation-Id", "integration-test-1");

        var response = await _client.SendAsync(request);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal("integration-test-1", response.Headers.GetValues("X-Correlation-Id").Single());
        Assert.Equal("integration-test-1", problem.GetProperty("correlationId").GetString());
    }

    [Theory]
    [InlineData("/health/live")]
    [InlineData("/api/v1/locations/invalid/profile")]
    public async Task Security_headers_are_present(string path)
    {
        var response = await _client.GetAsync(path);

        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("DENY", response.Headers.GetValues("X-Frame-Options").Single());
    }

    [Fact]
    public async Task Analytics_responses_are_cached()
    {
        const string Path = "/api/v1/traffic/speed-bands?from=2024-10-03&to=2024-10-04";

        await _client.GetAsync(Path);
        var cached = await _client.GetAsync(Path);

        Assert.True(cached.Headers.Age.HasValue);
    }

    [Fact]
    public async Task Rate_limit_returns_a_problem_response()
    {
        await using var factory = fixture.CreateFactory(("RateLimiting:PermitLimit", "2"));
        var client = factory.CreateClient();

        await client.GetAsync("/api/v1/metadata");
        await client.GetAsync("/api/v1/metadata");
        var rejected = await client.GetAsync("/api/v1/metadata");

        Assert.Equal(HttpStatusCode.TooManyRequests, rejected.StatusCode);
        Assert.Equal("application/problem+json", rejected.Content.Headers.ContentType?.MediaType);
    }
}
