using MoneyMentor.Application.JudgementReports;
using MoneyMentor.Domain.Enums;
using Xunit;

namespace MoneyMentor.Application.Tests.JudgementReports;

public sealed class ReportingPeriodCalculatorTests
{
    [Fact]
    public void PeriodCalculator_UsesIsoWeeksAndLocalMonthBoundaries()
    {
        var week = ReportingPeriodCalculator.GetPeriodContaining(
            JudgementReportCadence.Weekly,
            new DateOnly(2026, 8, 26),
            "Asia/Kolkata");
        var month = ReportingPeriodCalculator.Create(
            JudgementReportCadence.Monthly,
            new DateOnly(2026, 8, 1),
            "Asia/Kolkata");

        Assert.Equal("2026-W35", week.Key);
        Assert.Equal(new DateOnly(2026, 8, 24), week.StartDate);
        Assert.Equal(new DateOnly(2026, 8, 31), week.EndDateExclusive);
        Assert.Equal(new DateTimeOffset(2026, 7, 31, 18, 30, 0, TimeSpan.Zero), month.StartInstant);
        Assert.Equal(new DateOnly(2026, 9, 1), month.EndDateExclusive);
    }

    [Fact]
    public void PeriodCalculator_PreservesDstAwareCalendarBoundaries()
    {
        var march = ReportingPeriodCalculator.Create(
            JudgementReportCadence.Monthly,
            new DateOnly(2026, 3, 1),
            "America/New_York");

        Assert.Equal(TimeSpan.FromHours(743), march.EndInstant - march.StartInstant);
        Assert.Equal(new DateOnly(2026, 4, 1), march.EndDateExclusive);
    }
}
