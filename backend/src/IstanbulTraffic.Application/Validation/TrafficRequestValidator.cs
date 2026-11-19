using System.Text.RegularExpressions;
using IstanbulTraffic.Application.Contracts;
using IstanbulTraffic.Domain.Traffic;

namespace IstanbulTraffic.Application.Validation;

public sealed class RequestValidationException(IReadOnlyDictionary<string, string[]> errors)
    : Exception("The request is not valid.")
{
    public IReadOnlyDictionary<string, string[]> Errors { get; } = errors;
}

public sealed class ResourceNotFoundException(string message) : Exception(message);

public static partial class TrafficRequestValidator
{
    public static void Validate(TrafficFilter filter)
    {
        var errors = new Dictionary<string, string[]>();
        AddFilterErrors(filter, errors);
        ThrowIfInvalid(errors);
    }

    public static void Validate(SlowestLocationsRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        AddFilterErrors(request.Filter, errors);

        if (request.StartHour is < 0 or > 23)
        {
            errors["startHour"] = ["startHour must be between 0 and 23."];
        }

        if (request.EndHour is < 0 or > 23)
        {
            errors["endHour"] = ["endHour must be between 0 and 23."];
        }
        else if (request.EndHour < request.StartHour)
        {
            errors["endHour"] = ["endHour must not be earlier than startHour."];
        }

        if (request.Limit is < 1 or > TrafficRules.MaximumLocationLimit)
        {
            errors["limit"] = [$"limit must be between 1 and {TrafficRules.MaximumLocationLimit}."];
        }

        ThrowIfInvalid(errors);
    }

    public static string NormalizeGeohash(string geohash)
    {
        var normalized = geohash.Trim().ToLowerInvariant();
        if (!GeohashPattern().IsMatch(normalized))
        {
            ThrowIfInvalid(new Dictionary<string, string[]>
            {
                ["geohash"] = [$"geohash must be a valid {TrafficRules.GeohashLength} character geohash."],
            });
        }

        return normalized;
    }

    private static void AddFilterErrors(TrafficFilter filter, Dictionary<string, string[]> errors)
    {
        if (filter.From is not { } from || filter.To is not { } to)
        {
            return;
        }

        if (to < from)
        {
            errors["to"] = ["to must not be earlier than from."];
        }
        else if (to.DayNumber - from.DayNumber >= TrafficRules.MaximumDateRangeDays)
        {
            errors["to"] = [$"The date range must not exceed {TrafficRules.MaximumDateRangeDays} days."];
        }
    }

    private static void ThrowIfInvalid(Dictionary<string, string[]> errors)
    {
        if (errors.Count > 0)
        {
            throw new RequestValidationException(errors);
        }
    }

    [GeneratedRegex("^[0-9bcdefghjkmnpqrstuvwxyz]{6}$", RegexOptions.CultureInvariant)]
    private static partial Regex GeohashPattern();
}
