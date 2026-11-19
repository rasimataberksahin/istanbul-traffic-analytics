using IstanbulTraffic.Api.Infrastructure;
using IstanbulTraffic.Application.Contracts;
using IstanbulTraffic.Application.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;

namespace IstanbulTraffic.Api.Controllers;

[ApiController]
[Route("api/v1/pipeline")]
public sealed class PipelineController(PipelineService service, IOutputCacheStore cacheStore) : ControllerBase
{
    [HttpGet("data-sources")]
    public Task<IReadOnlyList<DataSourceResponse>> GetDataSources(CancellationToken cancellationToken) =>
        service.ListDataSourcesAsync(cancellationToken);

    [HttpGet("import-runs")]
    public Task<IReadOnlyList<ImportRunResponse>> GetImportRuns(CancellationToken cancellationToken) =>
        service.ListImportRunsAsync(cancellationToken);

    /// <summary>Copies the ETL load history to the administration tables and clears cached analytics.</summary>
    [HttpPost("sync")]
    [RequireAdminApiKey]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    public async Task<PipelineSyncResult> Sync(CancellationToken cancellationToken)
    {
        var result = await service.SyncAsync(cancellationToken);
        await cacheStore.EvictByTagAsync(ApiPolicies.AnalyticsCacheTag, cancellationToken);
        return result;
    }
}
