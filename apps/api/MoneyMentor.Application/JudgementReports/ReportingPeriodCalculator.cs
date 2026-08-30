using System.Globalization;
using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Application.JudgementReports;

public static class ReportingPeriodCalculator
{
    public static ReportingPeriod GetPeriodContaining(
        JudgementReportCadence cadence,
        DateOnly localDate,
        string timeZone)
    {
        var start = cadence switch
        {
            JudgementReportCadence.Weekly => StartOfIsoWeek(localDate),
            JudgementReportCadence.Monthly => new DateOnly(localDate.Year, localDate.Month, 1),
            JudgementReportCadence.Quarterly => StartOfQuarter(localDate),
            _ => throw new ArgumentOutOfRangeException(nameof(cadence), cadence, null)
        };

        return Create(cadence, start, timeZone);
    }

    public static ReportingPeriod GetLastCompletedPeriod(
        JudgementReportCadence cadence,
        DateTimeOffset asOf,
        string timeZone)
    {
        var zone = ResolveTimeZone(timeZone);
        var localDate = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(asOf, zone).DateTime);
        var current = GetPeriodContaining(cadence, localDate, timeZone);
        return Previous(current);
    }

    public static ReportingPeriod Create(
        JudgementReportCadence cadence,
        DateOnly start,
        string timeZone)
    {
        ValidateStart(cadence, start);
        var end = cadence switch
        {
            JudgementReportCadence.Weekly => start.AddDays(7),
            JudgementReportCadence.Monthly => start.AddMonths(1),
            JudgementReportCadence.Quarterly => start.AddMonths(3),
            _ => throw new ArgumentOutOfRangeException(nameof(cadence), cadence, null)
        };
        var zone = ResolveTimeZone(timeZone);
        return new ReportingPeriod(
            cadence,
            ToPeriodKey(cadence, start),
            start,
            end,
            ToInstant(start, zone),
            ToInstant(end, zone),
            zone.Id);
    }

    public static ReportingPeriod Previous(ReportingPeriod period)
    {
        var start = period.Cadence switch
        {
            JudgementReportCadence.Weekly => period.StartDate.AddDays(-7),
            JudgementReportCadence.Monthly => period.StartDate.AddMonths(-1),
            JudgementReportCadence.Quarterly => period.StartDate.AddMonths(-3),
            _ => throw new ArgumentOutOfRangeException(nameof(period), period.Cadence, null)
        };
        return Create(period.Cadence, start, period.TimeZone);
    }

    public static int BaselineWindow(JudgementReportCadence cadence) => cadence switch
    {
        JudgementReportCadence.Weekly => 8,
        JudgementReportCadence.Monthly => 6,
        JudgementReportCadence.Quarterly => 4,
        _ => throw new ArgumentOutOfRangeException(nameof(cadence), cadence, null)
    };

    public static int RequiredBaselinePeriods(JudgementReportCadence cadence) => cadence switch
    {
        JudgementReportCadence.Weekly => 4,
        JudgementReportCadence.Monthly => 3,
        JudgementReportCadence.Quarterly => 2,
        _ => throw new ArgumentOutOfRangeException(nameof(cadence), cadence, null)
    };

    private static DateOnly StartOfIsoWeek(DateOnly date)
    {
        var daysSinceMonday = ((int)date.DayOfWeek + 6) % 7;
        return date.AddDays(-daysSinceMonday);
    }

    private static DateOnly StartOfQuarter(DateOnly date) =>
        new(date.Year, (((date.Month - 1) / 3) * 3) + 1, 1);

    private static string ToPeriodKey(JudgementReportCadence cadence, DateOnly start) => cadence switch
    {
        JudgementReportCadence.Weekly =>
            $"{ISOWeek.GetYear(start.ToDateTime(TimeOnly.MinValue)):0000}-W{ISOWeek.GetWeekOfYear(start.ToDateTime(TimeOnly.MinValue)):00}",
        JudgementReportCadence.Monthly => $"{start.Year:0000}-{start.Month:00}",
        JudgementReportCadence.Quarterly => $"{start.Year:0000}-Q{((start.Month - 1) / 3) + 1}",
        _ => throw new ArgumentOutOfRangeException(nameof(cadence), cadence, null)
    };

    private static void ValidateStart(JudgementReportCadence cadence, DateOnly start)
    {
        var valid = cadence switch
        {
            JudgementReportCadence.Weekly => start.DayOfWeek == DayOfWeek.Monday,
            JudgementReportCadence.Monthly => start.Day == 1,
            JudgementReportCadence.Quarterly => start.Day == 1 && start.Month is 1 or 4 or 7 or 10,
            _ => false
        };
        if (!valid)
        {
            throw new ArgumentException($"{start:yyyy-MM-dd} is not a valid {cadence} period start.", nameof(start));
        }
    }

    private static TimeZoneInfo ResolveTimeZone(string timeZone)
    {
        if (string.IsNullOrWhiteSpace(timeZone))
        {
            throw new ArgumentException("A time zone is required.", nameof(timeZone));
        }
        return TimeZoneInfo.FindSystemTimeZoneById(timeZone);
    }

    private static DateTimeOffset ToInstant(DateOnly date, TimeZoneInfo zone)
    {
        var local = DateTime.SpecifyKind(date.ToDateTime(TimeOnly.MinValue), DateTimeKind.Unspecified);
        if (zone.IsInvalidTime(local))
        {
            local = local.AddHours(1);
        }
        return new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(local, zone), TimeSpan.Zero);
    }
}
