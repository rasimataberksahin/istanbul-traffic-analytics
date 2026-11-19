using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using IstanbulTraffic.Api;
using IstanbulTraffic.Api.Infrastructure;
using IstanbulTraffic.Application;
using IstanbulTraffic.Infrastructure;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.ResponseCompression;

var builder = WebApplication.CreateBuilder(args);

if (builder.Environment.IsDevelopment())
{
    builder.Configuration.AddInMemoryCollection(DotEnvFile.LoadNearest(builder.Environment.ContentRootPath));
    builder.Configuration.AddEnvironmentVariables();
}

builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);

builder.Services
    .AddControllers()
    .AddJsonOptions(options =>
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase)));

builder.Services.AddOpenApi();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails(options => options.CustomizeProblemDetails = context =>
{
    context.ProblemDetails.Instance = context.HttpContext.Request.Path;
    if (context.HttpContext.Items.TryGetValue(CorrelationIdMiddleware.ItemKey, out var correlationId))
    {
        context.ProblemDetails.Extensions["correlationId"] = correlationId;
    }
});

builder.Services.AddHealthChecks().AddCheck<DatabaseHealthCheck>("database", tags: ["ready"]);

builder.Services.AddOutputCache(options => options.AddPolicy(ApiPolicies.AnalyticsCache, policy => policy
    .Expire(TimeSpan.FromMinutes(builder.Configuration.GetValue("Caching:AnalyticsMinutes", 10)))
    .SetVaryByQuery("*")
    .Tag(ApiPolicies.AnalyticsCacheTag)));

builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
    options.Providers.Add<BrotliCompressionProvider>();
    options.Providers.Add<GzipCompressionProvider>();
});

builder.Services.AddCors(options => options.AddPolicy(ApiPolicies.Frontend, policy => policy
    .WithOrigins(builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [])
    .WithMethods(HttpMethods.Get)
    .WithHeaders(CorrelationIdMiddleware.HeaderName)
    .WithExposedHeaders(CorrelationIdMiddleware.HeaderName)));

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = builder.Configuration.GetValue("RateLimiting:PermitLimit", 120),
                Window = TimeSpan.FromSeconds(builder.Configuration.GetValue("RateLimiting:WindowSeconds", 60)),
                QueueLimit = 0,
            }));
    options.OnRejected = async (context, cancellationToken) =>
    {
        var problems = context.HttpContext.RequestServices.GetRequiredService<IProblemDetailsService>();
        await problems.WriteAsync(new ProblemDetailsContext
        {
            HttpContext = context.HttpContext,
            ProblemDetails = new ProblemDetails
            {
                Status = StatusCodes.Status429TooManyRequests,
                Title = "Too many requests.",
            },
        });
    };
});

var app = builder.Build();

if (app.Configuration.GetValue("Database:ApplyMigrationsOnStartup", false))
{
    await app.Services.ApplyAdminMigrationsAsync();
}

app.UseMiddleware<CorrelationIdMiddleware>();
app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseResponseCompression();
app.UseCors(ApiPolicies.Frontend);
app.UseRateLimiter();
app.UseOutputCache();

app.MapOpenApi().DisableRateLimiting();
app.MapControllers();
app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false }).DisableRateLimiting();
app.MapHealthChecks("/health/ready", new HealthCheckOptions { Predicate = check => check.Tags.Contains("ready") }).DisableRateLimiting();

await app.RunAsync();

public partial class Program;
