using MoneyMentor.Application.AppUsers;

namespace MoneyMentor.Application.Judgements;

public sealed record JudgmentExplanationRequest(string Text, bool ShareWithHousehold = false,
    DateTimeOffset? ValidUntil = null);

public interface IJudgmentFeedbackService
{
    Task<Guid?> RecordAsync(AppUserContext userContext, Guid judgementId,
        JudgmentExplanationRequest request, CancellationToken cancellationToken);
}
