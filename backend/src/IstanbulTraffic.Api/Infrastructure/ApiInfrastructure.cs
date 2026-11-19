using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using IstanbulTraffic.Application.Validation;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace IstanbulTraffic.Api.Infrastructure;

/// <summary>Reads local development settings from the repository's .env file.</summary>
public static class DotEnvFile
{
    public static IReadOnlyDictionary<string, string?> Parse(IEnumerable<string> lines)
    {
        var values = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        foreach (var rawLine in lines)
        {
            var line = rawLine.Trim();
            var separator = line.IndexOf('=', StringComparison.Ordinal);
            if (line.StartsWith('#') || separator <= 0)
            {
                continue;
            }

            var key = line[..separator].Trim();
            if (key.Contains("__", StringComparison.Ordinal))
            {
                values[key.Replace("__", ":", StringComparison.Ordinal)] = line[(separator + 1)..].Trim().Trim('"');
            }
        }

        return values;
    }

    public static IReadOnlyDictionary<string, string?> LoadNearest(string startDirectory)
    {
        for (var directory = new DirectoryInfo(startDirectory); directory is not null; directory = directory.Parent)
        {
            var path = Path.Combine(directory.FullName, ".env");
            if (File.Exists(path))
            {
                return Parse(File.ReadLines(path));
            }
        }

        return new Dictionary<string, string?>();
    }
}

/// <summary>Adds a validated correlation id to the response and every log entry.</summary>
public sealed partial class CorrelationIdMiddleware(RequestDelegate next, ILogger<CorrelationIdMiddleware> logger)
{
    public const string HeaderName = "X-Correlation-Id";
    public const string ItemKey = "CorrelationId";

    public async Task InvokeAsync(HttpContext context)
    {
        var supplied = context.Request.Headers[HeaderName].ToString();
        var correlationId = SafeId().IsMatch(supplied) ? supplied : Guid.NewGuid().ToString("N");

        context.Items[ItemKey] = correlationId;

        // The exception handler clears headers, so they are added when the response starts.
        context.Response.OnStarting(() =>
        {
            context.Response.Headers[HeaderName] = correlationId;
            return Task.CompletedTask;
        });

        using (logger.BeginScope(new Dictionary<string, object> { [ItemKey] = correlationId }))
        {
            await next(context);
        }
    }

    [GeneratedRegex("^[A-Za-z0-9_-]{8,64}$", RegexOptions.CultureInvariant)]
    private static partial Regex SafeId();
}

public sealed class SecurityHeadersMiddleware(RequestDelegate next)
{
    public Task InvokeAsync(HttpContext context)
    {
        context.Response.OnStarting(() =>
        {
            var headers = context.Response.Headers;
            headers.XContentTypeOptions = "nosniff";
            headers.XFrameOptions = "DENY";
            headers["Referrer-Policy"] = "no-referrer";
            return Task.CompletedTask;
        });

        return next(context);
    }
}

/// <summary>Maps exceptions to RFC 9457 problem responses without leaking internals.</summary>
public sealed partial class GlobalExceptionHandler(
    IProblemDetailsService problemDetailsService,
    ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    private const int ClientClosedRequest = 499;

    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        if (exception is OperationCanceledException && httpContext.RequestAborted.IsCancellationRequested)
        {
            httpContext.Response.StatusCode = ClientClosedRequest;
            return true;
        }

        ProblemDetails problem = exception switch
        {
            RequestValidationException validation => new ValidationProblemDetails(
                validation.Errors.ToDictionary(item => item.Key, item => item.Value))
            {
                Status = StatusCodes.Status400BadRequest,
                Title = "The request is not valid.",
            },
            ResourceNotFoundException notFound => new ProblemDetails
            {
                Status = StatusCodes.Status404NotFound,
                Title = "The resource was not found.",
                Detail = notFound.Message,
            },
            _ => new ProblemDetails
            {
                Status = StatusCodes.Status500InternalServerError,
                Title = "An unexpected error occurred.",
            },
        };

        if (problem.Status == StatusCodes.Status500InternalServerError)
        {
            LogUnhandled(logger, exception, httpContext.Request.Path);
        }

        httpContext.Response.StatusCode = problem.Status!.Value;
        return await problemDetailsService.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = problem,
            Exception = exception,
        });
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Unhandled exception for {Path}")]
    private static partial void LogUnhandled(ILogger logger, Exception exception, string path);
}

/// <summary>Protects administrative endpoints with a shared API key.</summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class RequireAdminApiKeyAttribute : Attribute, IAuthorizationFilter
{
    public const string HeaderName = "X-Api-Key";

    public void OnAuthorization(AuthorizationFilterContext context)
    {
        var configuration = context.HttpContext.RequestServices.GetRequiredService<IConfiguration>();
        var expected = configuration["Admin:ApiKey"];
        var supplied = context.HttpContext.Request.Headers[HeaderName].ToString();

        if (!IsValid(expected, supplied))
        {
            context.Result = new UnauthorizedObjectResult(new ProblemDetails
            {
                Status = StatusCodes.Status401Unauthorized,
                Title = "A valid API key is required.",
            });
        }
    }

    public static bool IsValid(string? expected, string? supplied)
    {
        if (string.IsNullOrEmpty(expected) || string.IsNullOrEmpty(supplied))
        {
            return false;
        }

        return CryptographicOperations.FixedTimeEquals(
            SHA256.HashData(Encoding.UTF8.GetBytes(expected)),
            SHA256.HashData(Encoding.UTF8.GetBytes(supplied)));
    }
}
