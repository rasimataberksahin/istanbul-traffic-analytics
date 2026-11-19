using System.Net.Http.Json;
using System.Text.Json;

namespace IstanbulTraffic.IntegrationTests;

/// <summary>
/// The fixture holds October 2023 and October 2024. Every expected value below is
/// derived by hand from the seed: three cells, a 10 km/h drop at 18:00 and a holiday on the 29th.
/// </summary>
[Collection(ApiCollection.Name)]
public sealed class InsightEndpointTests(ApiFixture fixture)
{
    private readonly HttpClient _client = fixture.CreateClient();

    [Fact]
    public async Task Monthly_insights_summarize_each_month()
    {
        var months = await GetAsync("/api/v1/insights/monthly");
        var october2024 = months[1];

        Assert.Equal(2, months.GetArrayLength());
        Assert.Equal("2024-10-01", october2024.GetProperty("month").GetString());
        Assert.Equal(744, october2024.GetProperty("observedHours").GetInt32());
        Assert.Equal(100m, october2024.GetProperty("coveragePct").GetDecimal());
        Assert.Equal(20.0m, october2024.GetProperty("averageVehicleCount").GetDecimal());
        Assert.Equal(56.67m, october2024.GetProperty("nightSpeedKmh").GetDecimal());
        Assert.Equal(53.33m, october2024.GetProperty("eveningPeakSpeedKmh").GetDecimal());
        Assert.Equal(0.059m, october2024.GetProperty("congestionIndex").GetDecimal());
        Assert.Equal(0.053m, months[0].GetProperty("congestionIndex").GetDecimal());
    }

    [Fact]
    public async Task Fixed_weight_speed_uses_the_first_year_shares()
    {
        // October 2023 is the only month of the first loaded year, so its evening vehicles (10:20:30)
        // fix the weights. Cell evening speeds are the mean of 17, 18 and 19 o'clock.
        var months = await GetAsync("/api/v1/insights/monthly");

        Assert.Equal(60.00m, months[0].GetProperty("fixedWeightEveningSpeedKmh").GetDecimal());
        Assert.Equal(51.67m, months[0].GetProperty("medianCellEveningSpeedKmh").GetDecimal());
        Assert.Equal(53.33m, months[1].GetProperty("fixedWeightEveningSpeedKmh").GetDecimal());
        Assert.Equal(46.67m, months[1].GetProperty("medianCellEveningSpeedKmh").GetDecimal());
    }

    [Fact]
    public async Task Weather_report_compares_wet_hours_with_dry_hours_of_the_same_month_and_hour()
    {
        // Speeds in the seed do not depend on the weather, so the three wet hours change nothing.
        var report = await _client.GetFromJsonAsync<JsonElement>("/api/v1/insights/weather");
        var conditions = report.GetProperty("conditions");
        var heavy = conditions.EnumerateArray().Single(item => item.GetProperty("condition").GetString() == "heavy_rain");
        var evening = report.GetProperty("wettestEvenings")[0];

        Assert.Equal(2, conditions.GetArrayLength());
        Assert.Equal(3, heavy.GetProperty("hours").GetInt32());
        Assert.Equal(3, heavy.GetProperty("eveningHours").GetInt32());
        Assert.Equal(0m, heavy.GetProperty("speedChangeKmh").GetDecimal());
        Assert.Equal(24, report.GetProperty("hourly").GetArrayLength());
        Assert.Equal(0, report.GetProperty("districts").GetArrayLength());
        Assert.Equal("2024-10-02", evening.GetProperty("date").GetString());
        Assert.Equal(6m, evening.GetProperty("precipitationMm").GetDecimal());
        Assert.Equal(0m, evening.GetProperty("speedChangeKmh").GetDecimal());
    }

    [Fact]
    public async Task Month_hour_matrix_has_every_weekday_hour()
    {
        var cells = await GetAsync("/api/v1/insights/month-hour");

        Assert.Equal(48, cells.GetArrayLength());
        Assert.Equal(46.67m, cells[24 + 18].GetProperty("weightedAverageSpeedKmh").GetDecimal());
    }

    [Fact]
    public async Task Day_of_week_matrix_has_seven_days()
    {
        var cells = await GetAsync("/api/v1/insights/day-of-week");

        Assert.Equal(7 * 24, cells.GetArrayLength());
        Assert.Equal("Pazartesi", cells[0].GetProperty("dayName").GetString());
    }

    [Fact]
    public async Task Calendar_names_the_periods_of_a_day()
    {
        var days = await GetAsync("/api/v1/insights/calendar");
        var republicDay = days.EnumerateArray().Single(day => day.GetProperty("date").GetString() == "2024-10-29");

        Assert.Equal(62, days.GetArrayLength());
        Assert.True(republicDay.GetProperty("hasPublicHoliday").GetBoolean());
        Assert.Equal("29 Ekim", republicDay.GetProperty("periods").GetString());
    }

    [Fact]
    public async Task Period_profiles_classify_every_weekday()
    {
        var points = await GetAsync("/api/v1/insights/periods");

        Assert.Equal(24, points.GetArrayLength());
        Assert.Equal("school_term", points[0].GetProperty("period").GetString());
        Assert.Equal(44, points[0].GetProperty("days").GetInt32());
    }

    [Fact]
    public async Task Holiday_effects_compare_with_the_same_weekdays()
    {
        var holidays = await GetAsync("/api/v1/insights/holidays");
        var republicDay2024 = holidays[1];

        Assert.Equal(2, holidays.GetArrayLength());
        Assert.Equal("2024-republic", republicDay2024.GetProperty("code").GetString());
        Assert.Equal(56.00m, republicDay2024.GetProperty("holidaySpeedKmh").GetDecimal());
        Assert.Equal(0m, republicDay2024.GetProperty("speedChangeKmh").GetDecimal());
    }

    [Fact]
    public async Task Reliability_reports_percentiles_of_daily_speed()
    {
        var points = await GetAsync("/api/v1/insights/reliability");
        var evening = points[18];

        Assert.Equal(24, points.GetArrayLength());
        Assert.Equal(44, evening.GetProperty("days").GetInt32());
        Assert.Equal(46.67m, evening.GetProperty("p10SpeedKmh").GetDecimal());
        Assert.Equal(50.00m, evening.GetProperty("medianSpeedKmh").GetDecimal());
    }

    [Fact]
    public async Task Location_changes_compare_two_twelve_month_windows()
    {
        var report = await GetAsync("/api/v1/insights/location-changes");
        var locations = report.GetProperty("locations");

        Assert.Equal("2023-11-01", report.GetProperty("currentFrom").GetString());
        Assert.Equal("2023-10-31", report.GetProperty("previousTo").GetString());
        Assert.Equal(3, locations.GetArrayLength());
        Assert.Equal("sxk96p", locations[0].GetProperty("geohash").GetString());
        Assert.Equal(-15m, locations[0].GetProperty("speedChangeKmh").GetDecimal());
        Assert.Equal(0m, locations[0].GetProperty("peakVolumeChangePct").GetDecimal());
    }

    private async Task<JsonElement> GetAsync(string path)
    {
        var response = await _client.GetAsync(path);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }
}
