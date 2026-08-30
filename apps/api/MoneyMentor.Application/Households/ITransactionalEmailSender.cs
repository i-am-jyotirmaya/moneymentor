namespace MoneyMentor.Application.Households;

public interface ITransactionalEmailSender
{
    Task<EmailSendResult> SendAsync(
        TransactionalEmailMessage message,
        CancellationToken cancellationToken);
}

public sealed record TransactionalEmailMessage(
    Guid DeliveryId,
    string To,
    string Subject,
    string TextBody,
    string HtmlBody);

public sealed record EmailSendResult(
    bool Succeeded,
    string? ProviderMessageId,
    string? Error)
{
    public static EmailSendResult Success(string providerMessageId) =>
        new(true, providerMessageId, null);

    public static EmailSendResult Failure(string error) =>
        new(false, null, error);
}
