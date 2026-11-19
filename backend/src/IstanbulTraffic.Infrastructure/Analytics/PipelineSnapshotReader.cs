using System.Data;
using Dapper;
using IstanbulTraffic.Application.Abstractions;
using IstanbulTraffic.Domain.Administration;
using Npgsql;

namespace IstanbulTraffic.Infrastructure.Analytics;

internal sealed class PipelineSnapshotReader(NpgsqlDataSource dataSource) : IPipelineSnapshotReader
{
    private const string AuditSql = """
        SELECT month, source_file, source_sha256, row_count, vehicle_total, location_count, loaded_at
        FROM traffic.load_audit
        ORDER BY month
        """;

    private const string QualitySql = """
        SELECT
            COUNT(*)                                     AS total_rows,
            COUNT(*) FILTER (WHERE is_analysis_eligible) AS analysis_eligible,
            COUNT(*) FILTER (WHERE is_low_sample)        AS low_sample,
            COUNT(*) FILTER (WHERE is_public_holiday)    AS public_holiday,
            COUNT(*) FILTER (WHERE is_partial_hour)      AS partial_hour,
            COUNT(*) FILTER (WHERE is_max_speed_suspect) AS max_speed_suspect,
            COUNT(*) FILTER (WHERE is_speed_outlier)     AS speed_outlier
        FROM traffic.fact_traffic_hourly
        WHERE observed_at >= @From AND observed_at < @To
        """;

    public async Task<IReadOnlyList<ImportSnapshot>> ReadAsync(CancellationToken cancellationToken)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        var audits = (await connection.QueryAsync<AuditRow>(new CommandDefinition(AuditSql, cancellationToken: cancellationToken))).AsList();

        var snapshots = new List<ImportSnapshot>(audits.Count);
        foreach (var audit in audits)
        {
            var parameters = new DynamicParameters();
            parameters.Add("From", audit.Month.ToDateTime(TimeOnly.MinValue), DbType.DateTime2);
            parameters.Add("To", audit.Month.AddMonths(1).ToDateTime(TimeOnly.MinValue), DbType.DateTime2);
            var quality = await connection.QuerySingleAsync<QualityRow>(
                new CommandDefinition(QualitySql, parameters, cancellationToken: cancellationToken));

            snapshots.Add(new ImportSnapshot(
                audit.Month,
                audit.SourceFile,
                audit.SourceSha256,
                audit.RowCount,
                audit.VehicleTotal,
                audit.LocationCount,
                new DateTimeOffset(DateTime.SpecifyKind(audit.LoadedAt, DateTimeKind.Utc)),
                quality.ToMeasurements()));
        }

        return snapshots;
    }

    private sealed record AuditRow
    {
        public DateOnly Month { get; init; }

        public string SourceFile { get; init; } = string.Empty;

        public string SourceSha256 { get; init; } = string.Empty;

        public long RowCount { get; init; }

        public long VehicleTotal { get; init; }

        public int LocationCount { get; init; }

        public DateTime LoadedAt { get; init; }
    }

    private sealed record QualityRow
    {
        public long TotalRows { get; init; }

        public long AnalysisEligible { get; init; }

        public long LowSample { get; init; }

        public long PublicHoliday { get; init; }

        public long PartialHour { get; init; }

        public long MaxSpeedSuspect { get; init; }

        public long SpeedOutlier { get; init; }

        public IReadOnlyList<QualityMeasurement> ToMeasurements() =>
        [
            Measure("analysis_eligible", AnalysisEligible),
            Measure("low_sample", LowSample),
            Measure("public_holiday", PublicHoliday),
            Measure("partial_hour", PartialHour),
            Measure("max_speed_suspect", MaxSpeedSuspect),
            Measure("speed_outlier", SpeedOutlier),
        ];

        private QualityMeasurement Measure(string metric, long rows) =>
            new(metric, rows, TotalRows == 0 ? 0 : Math.Round(100m * rows / TotalRows, 3));
    }
}
