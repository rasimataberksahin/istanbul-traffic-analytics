using IstanbulTraffic.Application.Services;
using Microsoft.Extensions.DependencyInjection;

namespace IstanbulTraffic.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddSingleton(TimeProvider.System);
        services.AddScoped<TrafficAnalyticsService>();
        services.AddScoped<LocationAnalyticsService>();
        services.AddScoped<InsightsService>();
        services.AddScoped<IncidentsService>();
        services.AddScoped<PipelineService>();
        return services;
    }
}
