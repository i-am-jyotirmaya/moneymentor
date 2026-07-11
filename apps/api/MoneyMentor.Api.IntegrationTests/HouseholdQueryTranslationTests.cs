using Microsoft.EntityFrameworkCore;
using MoneyMentor.Infrastructure.Households;
using MoneyMentor.Infrastructure.Persistence;
using Xunit;

namespace MoneyMentor.Api.IntegrationTests;

public sealed class HouseholdQueryTranslationTests
{
    [Fact]
    public void Sent_invitation_history_query_is_translatable_by_npgsql()
    {
        var options = new DbContextOptionsBuilder<MoneyMentorDbContext>()
            .UseNpgsql("Host=localhost;Database=translation_only;Username=unused;Password=unused")
            .Options;
        using var dbContext = new MoneyMentorDbContext(options);

        var sql = PostgresHouseholdService
            .BuildSentInvitationsQuery(dbContext, Guid.NewGuid())
            .ToQueryString();

        Assert.Contains("ORDER BY", sql, StringComparison.Ordinal);
        Assert.Contains("\"CreatedAt\" DESC", sql, StringComparison.Ordinal);
    }
}
