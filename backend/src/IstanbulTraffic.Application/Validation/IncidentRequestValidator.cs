using IstanbulTraffic.Application.Contracts;
using IstanbulTraffic.Domain.Incidents;

namespace IstanbulTraffic.Application.Validation;

public static class IncidentRequestValidator
{
    public static void Validate(IncidentFilter filter)
    {
        var errors = new Dictionary<string, string[]>();
        if (filter.From is { } from && filter.To is { } to)
        {
            if (to < from)
            {
                errors["to"] = ["to must not be earlier than from."];
            }
            else if (to.DayNumber - from.DayNumber >= IncidentRules.MaximumRangeDays)
            {
                errors["to"] = [$"The date range must not exceed {IncidentRules.MaximumRangeDays} days."];
            }
        }

        if (filter.Category is { } category && !IncidentRules.AllCategories.Contains(category))
        {
            errors["category"] = [$"category must be one of: {string.Join(", ", IncidentRules.AllCategories.Order())}."];
        }

        if (errors.Count > 0)
        {
            throw new RequestValidationException(errors);
        }
    }

    public static void ValidateLimit(int limit)
    {
        if (limit is < 1 or > 100)
        {
            throw new RequestValidationException(new Dictionary<string, string[]>
            {
                ["limit"] = ["limit must be between 1 and 100."],
            });
        }
    }
}
