namespace IstanbulTraffic.Domain.Administration;

/// <summary>The loaded state of one month, as reported by the ETL pipeline.</summary>
public sealed record ImportSnapshot(
    DateOnly Month,
    string SourceFile,
    string SourceSha256,
    long RowCount,
    long VehicleTotal,
    int LocationCount,
    DateTimeOffset LoadedAt,
    IReadOnlyList<QualityMeasurement> QualityMeasurements);

public sealed record QualityMeasurement(string Metric, long RowCount, decimal SharePct);

/// <summary>One month of data imported from a data source.</summary>
public sealed class ImportRun
{
    private const int Sha256HexLength = 64;

    private readonly List<QualityResult> _qualityResults = [];

    private ImportRun()
    {
        SourceFile = string.Empty;
        SourceSha256 = string.Empty;
    }

    public int Id { get; private set; }

    public int DataSourceId { get; private set; }

    public DateOnly Month { get; private set; }

    public string SourceFile { get; private set; }

    public string SourceSha256 { get; private set; }

    public long RowCount { get; private set; }

    public long VehicleTotal { get; private set; }

    public int LocationCount { get; private set; }

    public DateTimeOffset LoadedAt { get; private set; }

    public DateTimeOffset SyncedAt { get; private set; }

    public IReadOnlyCollection<QualityResult> QualityResults => _qualityResults;

    public static ImportRun Create(int dataSourceId, ImportSnapshot snapshot, DateTimeOffset syncedAt)
    {
        var run = new ImportRun { DataSourceId = dataSourceId, Month = snapshot.Month };
        run.Update(snapshot, syncedAt);
        return run;
    }

    /// <summary>Applies a newer snapshot and returns whether anything changed.</summary>
    public bool Apply(ImportSnapshot snapshot, DateTimeOffset syncedAt)
    {
        if (snapshot.Month != Month)
        {
            throw new ArgumentException("The snapshot belongs to another month.", nameof(snapshot));
        }

        if (snapshot.SourceSha256 == SourceSha256 && snapshot.LoadedAt == LoadedAt)
        {
            return false;
        }

        Update(snapshot, syncedAt);
        return true;
    }

    private void Update(ImportSnapshot snapshot, DateTimeOffset syncedAt)
    {
        if (snapshot.SourceSha256.Length != Sha256HexLength)
        {
            throw new ArgumentException("SHA-256 must have 64 hexadecimal characters.", nameof(snapshot));
        }

        SourceFile = snapshot.SourceFile;
        SourceSha256 = snapshot.SourceSha256;
        RowCount = snapshot.RowCount;
        VehicleTotal = snapshot.VehicleTotal;
        LocationCount = snapshot.LocationCount;
        LoadedAt = snapshot.LoadedAt;
        SyncedAt = syncedAt;

        _qualityResults.RemoveAll(result => snapshot.QualityMeasurements.All(item => item.Metric != result.Metric));
        foreach (var measurement in snapshot.QualityMeasurements)
        {
            var existing = _qualityResults.Find(result => result.Metric == measurement.Metric);
            if (existing is null)
            {
                _qualityResults.Add(new QualityResult(measurement));
            }
            else
            {
                existing.Update(measurement);
            }
        }
    }
}

/// <summary>The size of one data quality flag within an import.</summary>
public sealed class QualityResult
{
    private QualityResult()
    {
        Metric = string.Empty;
    }

    internal QualityResult(QualityMeasurement measurement)
    {
        Metric = measurement.Metric;
        Update(measurement);
    }

    public int Id { get; private set; }

    public int ImportRunId { get; private set; }

    public string Metric { get; private set; }

    public long RowCount { get; private set; }

    public decimal SharePct { get; private set; }

    internal void Update(QualityMeasurement measurement)
    {
        RowCount = measurement.RowCount;
        SharePct = measurement.SharePct;
    }
}
