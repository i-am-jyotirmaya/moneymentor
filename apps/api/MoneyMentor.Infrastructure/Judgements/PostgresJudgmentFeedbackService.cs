using Microsoft.EntityFrameworkCore;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Judgements;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.JudgementReports;
using MoneyMentor.Infrastructure.Persistence;

namespace MoneyMentor.Infrastructure.Judgements;

internal sealed class PostgresJudgmentFeedbackService(
    MoneyMentorDbContext dbContext, MemoryAdmissionWakeup wakeup,
    TimeProvider clock) : IJudgmentFeedbackService
{
    public async Task<Guid?> RecordAsync(AppUserContext userContext, Guid judgementId,
        JudgmentExplanationRequest request, CancellationToken cancellationToken)
    {
        var judgement = await dbContext.Judgements.AsNoTracking().SingleOrDefaultAsync(x =>
            x.Id == judgementId, cancellationToken);
        if (judgement is null) return null;
        if (judgement.Scope == JudgementReportScope.Personal)
        {
            if (judgement.UserProfileId != userContext.UserProfileId || request.ShareWithHousehold) return null;
        }
        else if (!await dbContext.HouseholdMembers.AsNoTracking().AnyAsync(x =>
                     x.HouseholdId == judgement.HouseholdId
                     && x.UserProfileId == userContext.UserProfileId
                     && x.Status == HouseholdMemberStatus.Active, cancellationToken))
            return null;

        var now = clock.GetUtcNow();
        var feedback = new JudgmentFeedback
        {
            HouseholdId = judgement.HouseholdId,
            UserProfileId = userContext.UserProfileId,
            JudgementId = judgementId,
            Text = request.Text.Trim(),
            Visibility = request.ShareWithHousehold
                ? TransactionVisibility.Household : TransactionVisibility.Private,
            ValidUntil = request.ValidUntil,
            AvailableAt = now,
            CreatedAt = now
        };
        dbContext.JudgmentFeedback.Add(feedback);
        await dbContext.SaveChangesAsync(cancellationToken);
        wakeup.Signal();
        return feedback.Id;
    }
}
