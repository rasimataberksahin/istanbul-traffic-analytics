using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace IstanbulTraffic.IntegrationTests;

/// <summary>
/// The fixture holds four announcements (see ApiFixture). Traffic speeds in the seed repeat every day,
/// so an incident hour is exactly as fast as the usual hour and every speed change is zero.
/// </summary>
[Collection(ApiCollection.Name)]
public sealed class IncidentTests(ApiFixture fixture)
{
    private readonly HttpClient _client = fixture.CreateClient();

    [Fact]
    public async Task Metadata_reports_the_covered_period()
    {
        var metadata = await GetAsync("/api/v1/incidents/metadata");

        Assert.Equal("2023-10-02", metadata.GetProperty("firstDate").GetString());
        Assert.Equal("2024-10-05", metadata.GetProperty("lastDate").GetString());
        Assert.Equal(4, metadata.GetProperty("incidentCount").GetInt64());
        Assert.Equal("incidents_20241005.parquet", metadata.GetProperty("sourceFile").GetString());
    }

    [Fact]
    public async Task Summary_defaults_to_the_latest_twelve_months_and_leaves_out_news()
    {
        var summary = await GetAsync("/api/v1/incidents/summary");
        var categories = summary.GetProperty("categories");
        var accidents = categories.EnumerateArray().Single(item => item.GetProperty("category").GetString() == "accident");

        Assert.Equal("2023-10-06", summary.GetProperty("filter").GetProperty("from").GetString());
        Assert.Equal("2024-10-05", summary.GetProperty("filter").GetProperty("to").GetString());
        Assert.Equal(2, categories.GetArrayLength());
        Assert.Equal(1, accidents.GetProperty("incidents").GetInt32());
        Assert.Equal(30m, accidents.GetProperty("medianDurationMin").GetDecimal());
        Assert.Equal(1, accidents.GetProperty("previousYearIncidents").GetInt32());
        Assert.Equal("injury", summary.GetProperty("accidentSeverity")[0].GetProperty("severity").GetString());
    }

    [Fact]
    public async Task Cells_are_drawn_at_geohash_centres()
    {
        var cells = await GetAsync("/api/v1/incidents/cells?from=2023-01-01&to=2024-12-31");
        var merter = cells.EnumerateArray().Single(cell => cell.GetProperty("geohash").GetString() == "sxk96p");

        Assert.Equal(2, cells.GetArrayLength());
        Assert.Equal(2, merter.GetProperty("accidents").GetInt32());
        Assert.Equal(1, merter.GetProperty("severeAccidents").GetInt32());
        Assert.Equal("Zeytinburnu", merter.GetProperty("district").GetString());
        Assert.Equal(41.04218, merter.GetProperty("latitude").GetDouble(), 4);
    }

    [Fact]
    public async Task Cell_detail_lists_the_latest_incidents()
    {
        var detail = await GetAsync("/api/v1/incidents/cells/SXK96P?from=2023-01-01&to=2024-12-31&category=accident");

        Assert.Equal(24, detail.GetProperty("hourly").GetArrayLength());
        Assert.Equal(2, detail.GetProperty("hourly")[18].GetInt32());
        Assert.Equal(1, detail.GetProperty("latest")[0].GetProperty("incidentId").GetInt64());
        Assert.Equal("Merter - Zeytinburnu", detail.GetProperty("segments")[0].GetProperty("segment").GetString());
    }

    [Fact]
    public async Task Roads_rank_segments_with_enough_incidents()
    {
        var roads = await GetAsync("/api/v1/incidents/roads?from=2023-01-01&to=2024-12-31");

        Assert.Equal("D100", roads.GetProperty("roads")[0].GetProperty("road").GetString());
        Assert.Equal(2, roads.GetProperty("roads")[0].GetProperty("accidents").GetInt32());
        Assert.Equal(0, roads.GetProperty("segments").GetArrayLength());
    }

    [Fact]
    public async Task Traffic_impact_compares_each_incident_with_its_usual_hour()
    {
        var impact = await GetAsync("/api/v1/incidents/traffic-impact");
        var recovery = impact.GetProperty("recovery").EnumerateArray().ToList();

        Assert.Equal(3, impact.GetProperty("matchedIncidents").GetInt32());
        Assert.Contains(recovery, point => point.GetProperty("group").GetString() == "accident_injury");
        Assert.All(recovery, point => Assert.Equal(0m, point.GetProperty("speedChangeKmh").GetDecimal()));
    }

    [Theory]
    [InlineData("/api/v1/incidents/summary?category=parade", HttpStatusCode.BadRequest)]
    [InlineData("/api/v1/incidents/summary?from=2024-10-05&to=2024-10-01", HttpStatusCode.BadRequest)]
    [InlineData("/api/v1/incidents/roads?limit=0", HttpStatusCode.BadRequest)]
    [InlineData("/api/v1/incidents/cells/sxk000?from=2024-01-01&to=2024-12-31", HttpStatusCode.NotFound)]
    public async Task Bad_requests_return_problems(string path, HttpStatusCode expected)
    {
        var response = await _client.GetAsync(path);

        Assert.Equal(expected, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    private async Task<JsonElement> GetAsync(string path) =>
        await _client.GetFromJsonAsync<JsonElement>(path);
}
