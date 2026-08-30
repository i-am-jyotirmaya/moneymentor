namespace MoneyMentor.Application.JudgementReports;

public sealed record JudgementNarrationRequest(
    Guid SummaryId,
    string CalculationVersion,
    string RuleVersion,
    SpendingSummaryComparison Comparison,
    JudgementEvaluationResult Evaluation,
    JudgementNarration DeterministicFallback);

public interface IJudgementNarrationClient
{
    Task<JudgementNarration?> NarrateAsync(
        JudgementNarrationRequest request,
        CancellationToken cancellationToken);
}

public sealed class JudgementNarrationTransientException(string message, Exception? innerException = null)
    : Exception(message, innerException);

public sealed class JudgementNarrationPermanentException(string message, Exception? innerException = null)
    : Exception(message, innerException);
