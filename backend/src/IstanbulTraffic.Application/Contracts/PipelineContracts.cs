namespace IstanbulTraffic.Application.Contracts;

public sealed record DataSourceResponse(
    string Code,
    string Name,
    string Url,
    string License,
    bool IsActive);

public sealed record QualityResultResponse(string Metric, long RowCount, decimal SharePct);

public sealed record ImportRunResponse(
    string DataSourceCode,
    DateOnly Month,
    string SourceFile,
    string SourceSha256,
    long RowCount,
    long VehicleTotal,
    int LocationCount,
    DateTimeOffset LoadedAt,
    DateTimeOffset SyncedAt,
    IReadOnlyList<QualityResultResponse> QualityResults);

public sealed record PipelineSyncResult(int Created, int Updated, int Unchanged);
