using IstanbulTraffic.Api.Infrastructure;
using IstanbulTraffic.Application.Contracts;
using IstanbulTraffic.Application.Validation;
using IstanbulTraffic.Domain.Traffic;
using IstanbulTraffic.Infrastructure.Analytics;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;

namespace IstanbulTraffic.UnitTests;

public sealed class TrafficQueryBuilderTests
{
    [Fact]
    public void Default_filter_only_keeps_eligible_rows()
    {
        var (where, parameters) = TrafficQueryBuilder.Build(new TrafficFilter());

        Assert.Equal("f.is_analysis_eligible", where);
        Assert.Empty(parameters.ParameterNames);
    }

    [Fact]
    public void Dates_filter_the_partition_key_with_an_exclusive_end()
    {
        var filter = new TrafficFilter(new DateOnly(2024, 10, 1), new DateOnly(2024, 10, 31));

        var (where, parameters) = TrafficQueryBuilder.Build(filter);

        Assert.Contains("f.observed_at >= @From", where);
        Assert.Contains("f.observed_at < @ToExclusive", where);
        Assert.Equal(new DateTime(2024, 11, 1), parameters.Get<DateTime>("ToExclusive"));
    }

    [Theory]
    [InlineData(DayType.Weekday, "NOT f.is_weekend AND NOT f.is_public_holiday")]
    [InlineData(DayType.Weekend, "f.is_weekend AND NOT f.is_public_holiday")]
    [InlineData(DayType.Holiday, "f.is_public_holiday")]
    public void Day_types_become_fixed_predicates(DayType dayType, string expected)
    {
        var (where, _) = TrafficQueryBuilder.Build(new TrafficFilter(DayType: dayType));

        Assert.EndsWith(expected, where);
    }
}

public sealed class DotEnvFileTests
{
    [Fact]
    public void Only_hierarchical_keys_are_loaded()
    {
        var values = DotEnvFile.Parse(
        [
            "# comment",
            "POSTGRES_PASSWORD=ignored",
            "ConnectionStrings__Traffic=Host=localhost;Password=a=b",
            "Admin__ApiKey=\"secret\"",
            "invalid line",
        ]);

        Assert.Equal(2, values.Count);
        Assert.Equal("Host=localhost;Password=a=b", values["ConnectionStrings:Traffic"]);
        Assert.Equal("secret", values["Admin:ApiKey"]);
    }
}

public sealed class RequireAdminApiKeyTests
{
    [Theory]
    [InlineData("key", "key", true)]
    [InlineData("key", "other", false)]
    [InlineData("key", "", false)]
    [InlineData("", "", false)]
    [InlineData(null, "key", false)]
    public void Api_key_comparison(string? expected, string? supplied, bool isValid)
    {
        Assert.Equal(isValid, RequireAdminApiKeyAttribute.IsValid(expected, supplied));
    }
}

public sealed class CorrelationIdMiddlewareTests
{
    [Fact]
    public async Task Valid_id_is_returned_to_the_client()
    {
        var context = await InvokeAsync("client-request-1");

        Assert.Equal("client-request-1", context.Items[CorrelationIdMiddleware.ItemKey]);
    }

    [Theory]
    [InlineData("")]
    [InlineData("short")]
    [InlineData("bad value\r\ninjected: header")]
    public async Task Unsafe_id_is_replaced(string supplied)
    {
        var context = await InvokeAsync(supplied);

        var generated = Assert.IsType<string>(context.Items[CorrelationIdMiddleware.ItemKey]);
        Assert.NotEqual(supplied, generated);
        Assert.Equal(32, generated.Length);
    }

    private static async Task<DefaultHttpContext> InvokeAsync(string supplied)
    {
        var context = new DefaultHttpContext();
        context.Request.Headers[CorrelationIdMiddleware.HeaderName] = supplied;
        var middleware = new CorrelationIdMiddleware(_ => Task.CompletedTask, NullLogger<CorrelationIdMiddleware>.Instance);
        await middleware.InvokeAsync(context);
        return context;
    }
}

public sealed class GlobalExceptionHandlerTests
{
    [Fact]
    public async Task Validation_errors_become_400()
    {
        var (context, problem) = await HandleAsync(new RequestValidationException(
            new Dictionary<string, string[]> { ["to"] = ["invalid"] }));

        Assert.Equal(StatusCodes.Status400BadRequest, context.Response.StatusCode);
        Assert.Contains("to", Assert.IsType<ValidationProblemDetails>(problem).Errors.Keys);
    }

    [Fact]
    public async Task Missing_resources_become_404()
    {
        var (context, _) = await HandleAsync(new ResourceNotFoundException("missing"));

        Assert.Equal(StatusCodes.Status404NotFound, context.Response.StatusCode);
    }

    [Fact]
    public async Task Unexpected_errors_do_not_expose_details()
    {
        var (context, problem) = await HandleAsync(new InvalidOperationException("connection password leaked"));

        Assert.Equal(StatusCodes.Status500InternalServerError, context.Response.StatusCode);
        Assert.DoesNotContain("password", problem?.Title ?? string.Empty, StringComparison.OrdinalIgnoreCase);
        Assert.Null(problem?.Detail);
    }

    private static async Task<(DefaultHttpContext Context, ProblemDetails? Problem)> HandleAsync(Exception exception)
    {
        var context = new DefaultHttpContext();
        var problems = new CapturingProblemDetailsService();
        var handler = new GlobalExceptionHandler(problems, NullLogger<GlobalExceptionHandler>.Instance);

        Assert.True(await handler.TryHandleAsync(context, exception, CancellationToken.None));
        return (context, problems.Problem);
    }

    private sealed class CapturingProblemDetailsService : IProblemDetailsService
    {
        public ProblemDetails? Problem { get; private set; }

        public ValueTask WriteAsync(ProblemDetailsContext context)
        {
            Problem = context.ProblemDetails;
            return ValueTask.CompletedTask;
        }

        public ValueTask<bool> TryWriteAsync(ProblemDetailsContext context)
        {
            Problem = context.ProblemDetails;
            return ValueTask.FromResult(true);
        }
    }
}
