using IstanbulTraffic.Application.Abstractions;
using IstanbulTraffic.Application.Contracts;
using IstanbulTraffic.Application.Services;
using IstanbulTraffic.Application.Validation;
using IstanbulTraffic.Domain.Administration;
using IstanbulTraffic.Domain.Traffic;

namespace IstanbulTraffic.UnitTests;

public sealed class TrafficRequestValidatorTests
{
    private static readonly DateOnly October1 = new(2024, 10, 1);

    [Fact]
    public void Open_ended_filter_is_valid()
    {
        TrafficRequestValidator.Validate(new TrafficFilter());
    }

    [Fact]
    public void Reversed_date_range_is_rejected()
    {
        var exception = Assert.Throws<RequestValidationException>(() =>
            TrafficRequestValidator.Validate(new TrafficFilter(October1, October1.AddDays(-1))));

        Assert.Contains("to", exception.Errors.Keys);
    }

    [Theory]
    [InlineData(365, true)]
    [InlineData(366, false)]
    public void Date_range_limit_is_enforced(int extraDays, bool isValid)
    {
        var filter = new TrafficFilter(October1, October1.AddDays(extraDays));

        var exception = Record.Exception(() => TrafficRequestValidator.Validate(filter));

        Assert.Equal(isValid, exception is null);
    }

    [Theory]
    [InlineData(-1, 19, 15, "startHour")]
    [InlineData(17, 24, 15, "endHour")]
    [InlineData(19, 17, 15, "endHour")]
    [InlineData(17, 19, 0, "limit")]
    [InlineData(17, 19, 101, "limit")]
    public void Invalid_location_request_is_rejected(int startHour, int endHour, int limit, string field)
    {
        var request = new SlowestLocationsRequest(new TrafficFilter(), startHour, endHour, limit);

        var exception = Assert.Throws<RequestValidationException>(() => TrafficRequestValidator.Validate(request));

        Assert.Contains(field, exception.Errors.Keys);
    }

    [Theory]
    [InlineData("sxk96p", "sxk96p")]
    [InlineData(" SXK96P ", "sxk96p")]
    public void Geohash_is_normalized(string input, string expected)
    {
        Assert.Equal(expected, TrafficRequestValidator.NormalizeGeohash(input));
    }

    [Theory]
    [InlineData("sxk96")]
    [InlineData("sxk96a")]
    [InlineData("sxk96p'; DROP TABLE x;--")]
    public void Invalid_geohash_is_rejected(string input)
    {
        Assert.Throws<RequestValidationException>(() => TrafficRequestValidator.NormalizeGeohash(input));
    }
}

public sealed class TrafficAnalyticsServiceTests
{
    [Fact]
    public async Task Summary_reports_slowest_and_fastest_hours()
    {
        var service = new TrafficAnalyticsService(new FakeTrafficRepository(
            new HourlyProfilePoint { HourOfDay = 4, WeightedAverageSpeedKmh = 71.72m },
            new HourlyProfilePoint { HourOfDay = 18, WeightedAverageSpeedKmh = 45.47m },
            new HourlyProfilePoint { HourOfDay = 12, WeightedAverageSpeedKmh = 53.46m }));

        var summary = await service.GetSummaryAsync(new TrafficFilter(), CancellationToken.None);

        Assert.Equal(18, summary.SlowestHour?.HourOfDay);
        Assert.Equal(4, summary.FastestHour?.HourOfDay);
    }

    [Fact]
    public async Task Summary_without_data_has_no_extreme_hours()
    {
        var service = new TrafficAnalyticsService(new FakeTrafficRepository());

        var summary = await service.GetSummaryAsync(new TrafficFilter(), CancellationToken.None);

        Assert.Null(summary.SlowestHour);
        Assert.Null(summary.FastestHour);
    }

    private sealed class FakeTrafficRepository(params HourlyProfilePoint[] hourly) : ITrafficAnalyticsRepository
    {
        public Task<TrafficTotals> GetTotalsAsync(TrafficFilter filter, CancellationToken cancellationToken) =>
            Task.FromResult(new TrafficTotals());

        public Task<IReadOnlyList<HourlyProfilePoint>> GetHourlyProfileAsync(TrafficFilter filter, CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<HourlyProfilePoint>>(hourly);

        public Task<IReadOnlyList<DailyTrendPoint>> GetDailyTrendAsync(TrafficFilter filter, CancellationToken cancellationToken) =>
            throw new NotSupportedException();

        public Task<IReadOnlyList<SpeedHeatmapCell>> GetHeatmapAsync(TrafficFilter filter, CancellationToken cancellationToken) =>
            throw new NotSupportedException();

        public Task<IReadOnlyList<DayTypeComparisonPoint>> GetDayTypeComparisonAsync(TrafficFilter filter, CancellationToken cancellationToken) =>
            throw new NotSupportedException();

        public Task<IReadOnlyList<SpeedBandShare>> GetSpeedBandsAsync(TrafficFilter filter, CancellationToken cancellationToken) =>
            throw new NotSupportedException();

        public Task<DatasetMetadata> GetMetadataAsync(CancellationToken cancellationToken) =>
            throw new NotSupportedException();
    }
}

public sealed class LocationAnalyticsServiceTests
{
    [Fact]
    public async Task Unknown_location_raises_not_found()
    {
        var service = new LocationAnalyticsService(new EmptyLocationRepository());

        await Assert.ThrowsAsync<ResourceNotFoundException>(() =>
            service.GetProfileAsync("sxk000", new TrafficFilter(), CancellationToken.None));
    }

    private sealed class EmptyLocationRepository : ILocationAnalyticsRepository
    {
        public Task<IReadOnlyList<SlowestLocation>> GetSlowestAsync(SlowestLocationsRequest request, CancellationToken cancellationToken) =>
            throw new NotSupportedException();

        public Task<IReadOnlyList<CongestionPoint>> GetCongestionMapAsync(TrafficFilter filter, CancellationToken cancellationToken) =>
            throw new NotSupportedException();

        public Task<LocationProfile?> GetProfileAsync(string geohash, TrafficFilter filter, CancellationToken cancellationToken) =>
            Task.FromResult<LocationProfile?>(null);
    }
}

public sealed class ImportRunTests
{
    private static readonly DateTimeOffset SyncedAt = new(2026, 11, 18, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Same_snapshot_is_not_applied_twice()
    {
        var snapshot = TestData.Snapshot();
        var run = ImportRun.Create(1, snapshot, SyncedAt);

        var changed = run.Apply(snapshot, SyncedAt.AddHours(1));

        Assert.False(changed);
        Assert.Equal(SyncedAt, run.SyncedAt);
    }

    [Fact]
    public void Newer_snapshot_updates_values_and_quality_results()
    {
        var run = ImportRun.Create(1, TestData.Snapshot(), SyncedAt);
        var newer = TestData.Snapshot(sha: new string('b', 64), rows: 200, metric: "partial_hour");

        var changed = run.Apply(newer, SyncedAt.AddHours(1));

        Assert.True(changed);
        Assert.Equal(200, run.RowCount);
        Assert.Equal("partial_hour", Assert.Single(run.QualityResults).Metric);
    }

    [Fact]
    public void Snapshot_of_another_month_is_rejected()
    {
        var run = ImportRun.Create(1, TestData.Snapshot(), SyncedAt);
        var other = TestData.Snapshot() with { Month = new DateOnly(2024, 11, 1) };

        Assert.Throws<ArgumentException>(() => run.Apply(other, SyncedAt));
    }

    [Fact]
    public void Invalid_checksum_is_rejected()
    {
        Assert.Throws<ArgumentException>(() => ImportRun.Create(1, TestData.Snapshot(sha: "short"), SyncedAt));
    }
}

public sealed class PipelineServiceTests
{
    [Fact]
    public async Task Sync_creates_new_months()
    {
        var admin = new FakeAdminRepository();
        var service = CreateService(admin, TestData.Snapshot());

        var result = await service.SyncAsync(CancellationToken.None);

        Assert.Equal(new PipelineSyncResult(1, 0, 0), result);
        Assert.Single(admin.Runs);
        Assert.Equal(1, admin.SaveCount);
    }

    [Fact]
    public async Task Sync_is_idempotent()
    {
        var admin = new FakeAdminRepository();
        var service = CreateService(admin, TestData.Snapshot());
        await service.SyncAsync(CancellationToken.None);

        var result = await service.SyncAsync(CancellationToken.None);

        Assert.Equal(new PipelineSyncResult(0, 0, 1), result);
    }

    [Fact]
    public async Task Sync_updates_a_reloaded_month()
    {
        var admin = new FakeAdminRepository();
        await CreateService(admin, TestData.Snapshot()).SyncAsync(CancellationToken.None);

        var result = await CreateService(admin, TestData.Snapshot(sha: new string('c', 64)))
            .SyncAsync(CancellationToken.None);

        Assert.Equal(new PipelineSyncResult(0, 1, 0), result);
    }

    [Fact]
    public async Task Sync_fails_when_the_data_source_is_missing()
    {
        var service = CreateService(new FakeAdminRepository(hasDataSource: false));

        await Assert.ThrowsAsync<InvalidOperationException>(() => service.SyncAsync(CancellationToken.None));
    }

    private static PipelineService CreateService(FakeAdminRepository admin, params ImportSnapshot[] snapshots) =>
        new(admin, new FakeSnapshotReader(snapshots), TimeProvider.System);

    private sealed class FakeSnapshotReader(IReadOnlyList<ImportSnapshot> snapshots) : IPipelineSnapshotReader
    {
        public Task<IReadOnlyList<ImportSnapshot>> ReadAsync(CancellationToken cancellationToken) => Task.FromResult(snapshots);
    }

    private sealed class FakeAdminRepository(bool hasDataSource = true) : IAdminRepository
    {
        public List<ImportRun> Runs { get; } = [];

        public int SaveCount { get; private set; }

        public Task<DataSource?> FindDataSourceAsync(string code, CancellationToken cancellationToken) =>
            Task.FromResult(hasDataSource ? (DataSource?)Activator.CreateInstance(typeof(DataSource), nonPublic: true) : null);

        public Task<IReadOnlyList<DataSourceResponse>> ListDataSourcesAsync(CancellationToken cancellationToken) =>
            throw new NotSupportedException();

        public Task<IReadOnlyList<ImportRun>> GetImportRunsAsync(int dataSourceId, CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<ImportRun>>(Runs.ToList());

        public Task<IReadOnlyList<ImportRunResponse>> ListImportRunsAsync(CancellationToken cancellationToken) =>
            throw new NotSupportedException();

        public void Add(ImportRun importRun) => Runs.Add(importRun);

        public Task SaveChangesAsync(CancellationToken cancellationToken)
        {
            SaveCount++;
            return Task.CompletedTask;
        }
    }
}

internal static class TestData
{
    public static ImportSnapshot Snapshot(string? sha = null, long rows = 100, string metric = "low_sample") => new(
        new DateOnly(2024, 10, 1),
        "traffic_clean_202410.parquet",
        sha ?? new string('a', 64),
        rows,
        1_000,
        10,
        new DateTimeOffset(2026, 11, 18, 10, 0, 0, TimeSpan.Zero),
        [new QualityMeasurement(metric, 5, 5m)]);
}
