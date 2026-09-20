using Microsoft.Extensions.Logging;
using MoneyMentor.Application.Households;

namespace MoneyMentor.Operations;

public static class EmailSmokeTest
{
    public const string Recipient = "jyotirmayasahu38@gmail.com";

    public static async Task<int> RunAsync(ITransactionalEmailSender sender, ILogger logger,
        Guid deliveryId, CancellationToken cancellationToken)
    {
        var message = new TransactionalEmailMessage(deliveryId, Recipient,
            "Spndrr Resend integration test",
            $"This is a Spndrr deployment/integration smoke test. Test ID: {deliveryId:N}.",
            $"<p>This is a Spndrr deployment/integration smoke test.</p><p>Test ID: {deliveryId:N}.</p>");
        var result = await sender.SendAsync(message, cancellationToken);
        if (!result.Succeeded || string.IsNullOrWhiteSpace(result.ProviderMessageId))
        {
            logger.LogError("Resend smoke test {DeliveryId} failed: {Error}", deliveryId, result.Error);
            return 1;
        }

        logger.LogInformation("Resend accepted smoke test {DeliveryId}. Provider message ID: {ProviderMessageId}",
            deliveryId, result.ProviderMessageId);
        return 0;
    }
}
