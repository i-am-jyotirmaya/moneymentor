using MoneyMentor.Application.AppUsers;
using Xunit;

namespace MoneyMentor.Application.Tests.AppUsers;

public sealed class UserTimeZoneTests
{
    [Fact]
    public void TryNormalize_CanonicalizesLegacyKolkataAlias()
    {
        Assert.True(UserTimeZone.TryNormalize("Asia/Calcutta", out var normalized));
        Assert.Equal("Asia/Kolkata", normalized);
    }

    [Fact]
    public void TryNormalize_RejectsWindowsAndUnknownIdentifiers()
    {
        Assert.False(UserTimeZone.TryNormalize("India Standard Time", out _));
        Assert.False(UserTimeZone.TryNormalize("Not/AZone", out _));
    }

    [Fact]
    public void GetCurrentDate_UsesTheConfiguredZoneAcrossUtcMidnight()
    {
        var timeProvider = new FixedTimeProvider(
            new DateTimeOffset(2026, 7, 1, 18, 45, 0, TimeSpan.Zero));

        Assert.Equal(
            new DateOnly(2026, 7, 2),
            UserTimeZone.GetCurrentDate("Asia/Kolkata", timeProvider));
    }

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
