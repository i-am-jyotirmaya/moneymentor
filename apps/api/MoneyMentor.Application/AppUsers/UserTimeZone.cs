namespace MoneyMentor.Application.AppUsers;

public static class UserTimeZone
{
    public const string DefaultId = "Asia/Kolkata";

    public static bool TryNormalize(string? value, out string normalized)
    {
        normalized = string.Empty;
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        var candidate = value.Trim();
        if (string.Equals(candidate, "Asia/Calcutta", StringComparison.OrdinalIgnoreCase))
        {
            candidate = DefaultId;
        }

        if (!candidate.Contains("/", StringComparison.Ordinal)
            || candidate.Any(char.IsWhiteSpace))
        {
            return false;
        }

        try
        {
            normalized = TimeZoneInfo.FindSystemTimeZoneById(candidate).Id;
            return true;
        }
        catch (TimeZoneNotFoundException)
        {
            return false;
        }
        catch (InvalidTimeZoneException)
        {
            return false;
        }
    }

    public static DateOnly GetCurrentDate(string timeZone, TimeProvider timeProvider)
    {
        if (!TryNormalize(timeZone, out var normalized))
        {
            normalized = DefaultId;
        }

        var local = TimeZoneInfo.ConvertTime(
            timeProvider.GetUtcNow(),
            TimeZoneInfo.FindSystemTimeZoneById(normalized));
        return DateOnly.FromDateTime(local.DateTime);
    }
}
