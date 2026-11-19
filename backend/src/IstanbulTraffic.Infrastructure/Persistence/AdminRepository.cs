using IstanbulTraffic.Application.Abstractions;
using IstanbulTraffic.Application.Contracts;
using IstanbulTraffic.Domain.Administration;
using Microsoft.EntityFrameworkCore;

namespace IstanbulTraffic.Infrastructure.Persistence;

internal sealed class AdminRepository(AdminDbContext dbContext) : IAdminRepository
{
    public Task<DataSource?> FindDataSourceAsync(string code, CancellationToken cancellationToken) =>
        dbContext.DataSources.SingleOrDefaultAsync(source => source.Code == code, cancellationToken);

    public async Task<IReadOnlyList<DataSourceResponse>> ListDataSourcesAsync(CancellationToken cancellationToken) =>
        await dbContext.DataSources
            .AsNoTracking()
            .OrderBy(source => source.Code)
            .Select(source => new DataSourceResponse(source.Code, source.Name, source.Url, source.License, source.IsActive))
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<ImportRun>> GetImportRunsAsync(int dataSourceId, CancellationToken cancellationToken) =>
        await dbContext.ImportRuns
            .Include(run => run.QualityResults)
            .Where(run => run.DataSourceId == dataSourceId)
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<ImportRunResponse>> ListImportRunsAsync(CancellationToken cancellationToken) =>
        await dbContext.ImportRuns
            .AsNoTracking()
            .OrderByDescending(run => run.Month)
            .Join(
                dbContext.DataSources,
                run => run.DataSourceId,
                source => source.Id,
                (run, source) => new ImportRunResponse(
                    source.Code,
                    run.Month,
                    run.SourceFile,
                    run.SourceSha256,
                    run.RowCount,
                    run.VehicleTotal,
                    run.LocationCount,
                    run.LoadedAt,
                    run.SyncedAt,
                    run.QualityResults
                        .OrderBy(result => result.Metric)
                        .Select(result => new QualityResultResponse(result.Metric, result.RowCount, result.SharePct))
                        .ToList()))
            .ToListAsync(cancellationToken);

    public void Add(ImportRun importRun) => dbContext.ImportRuns.Add(importRun);

    public Task SaveChangesAsync(CancellationToken cancellationToken) => dbContext.SaveChangesAsync(cancellationToken);
}
