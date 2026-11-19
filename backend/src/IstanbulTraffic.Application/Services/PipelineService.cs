using IstanbulTraffic.Application.Abstractions;
using IstanbulTraffic.Application.Contracts;
using IstanbulTraffic.Domain.Administration;

namespace IstanbulTraffic.Application.Services;

/// <summary>Publishes the ETL load history to the administration tables.</summary>
public sealed class PipelineService(
    IAdminRepository adminRepository,
    IPipelineSnapshotReader snapshotReader,
    TimeProvider timeProvider)
{
    public const string TrafficDataSourceCode = "ibb-hourly-traffic";

    public Task<IReadOnlyList<DataSourceResponse>> ListDataSourcesAsync(CancellationToken cancellationToken) =>
        adminRepository.ListDataSourcesAsync(cancellationToken);

    public Task<IReadOnlyList<ImportRunResponse>> ListImportRunsAsync(CancellationToken cancellationToken) =>
        adminRepository.ListImportRunsAsync(cancellationToken);

    public async Task<PipelineSyncResult> SyncAsync(CancellationToken cancellationToken)
    {
        var dataSource = await adminRepository.FindDataSourceAsync(TrafficDataSourceCode, cancellationToken)
            ?? throw new InvalidOperationException($"Data source '{TrafficDataSourceCode}' is missing.");

        var snapshots = await snapshotReader.ReadAsync(cancellationToken);
        var existingRuns = (await adminRepository.GetImportRunsAsync(dataSource.Id, cancellationToken))
            .ToDictionary(run => run.Month);
        var syncedAt = timeProvider.GetUtcNow();

        int created = 0, updated = 0, unchanged = 0;
        foreach (var snapshot in snapshots)
        {
            if (!existingRuns.TryGetValue(snapshot.Month, out var run))
            {
                adminRepository.Add(ImportRun.Create(dataSource.Id, snapshot, syncedAt));
                created++;
            }
            else if (run.Apply(snapshot, syncedAt))
            {
                updated++;
            }
            else
            {
                unchanged++;
            }
        }

        await adminRepository.SaveChangesAsync(cancellationToken);
        return new PipelineSyncResult(created, updated, unchanged);
    }
}
