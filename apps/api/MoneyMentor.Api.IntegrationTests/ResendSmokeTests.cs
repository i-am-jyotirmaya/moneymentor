using Microsoft.Extensions.DependencyInjection;
using MoneyMentor.Application.Households;
using MoneyMentor.Operations;
using Xunit;

namespace MoneyMentor.Api.IntegrationTests;

public sealed class ResendSmokeTests
{
    [Theory]
    [InlineData(true, "provider-id", 0)]
    [InlineData(false, null, 1)]
    [InlineData(true, "", 1)]
    public async Task Command_sends_to_requested_recipient_and_returns_delivery_status(
        bool succeeded, string? providerId, int expectedExitCode)
    {
        var sender = new RecordingSender(new(succeeded, providerId, "Test failure"));
        var deliveryId = Guid.NewGuid();
        var exitCode = await OperationsCommand.RunAsync(
            ["email-smoke-test", "--delivery-id", deliveryId.ToString()], "Host=unused",
            services => services.AddSingleton<ITransactionalEmailSender>(sender));

        Assert.Equal(expectedExitCode, exitCode);
        var message = Assert.IsType<TransactionalEmailMessage>(sender.Message);
        Assert.Equal("jyotirmayasahu38@gmail.com", message.To);
        Assert.Equal(deliveryId, message.DeliveryId);
        Assert.Contains(deliveryId.ToString("N"), message.TextBody);
        Assert.Contains(deliveryId.ToString("N"), message.HtmlBody);
    }

    [Fact]
    public async Task Invalid_delivery_id_fails_before_sending()
    {
        var sender = new RecordingSender(EmailSendResult.Success("id"));
        var exitCode = await OperationsCommand.RunAsync(
            ["email-smoke-test", "--delivery-id", "invalid"], "Host=unused",
            services => services.AddSingleton<ITransactionalEmailSender>(sender));
        Assert.Equal(1, exitCode);
        Assert.Null(sender.Message);
    }

    [LiveResendFact]
    [Trait("Category", "LiveEmail")]
    public async Task Live_resend_accepts_test_email()
    {
        // Uses the production DI registration and Resend__* environment settings.
        // Missing credentials fail the explicitly enabled test, rather than silently passing.
        var deliveryId = Environment.GetEnvironmentVariable("RESEND_TEST_DELIVERY_ID");
        Assert.True(Guid.TryParse(deliveryId, out var parsed) && parsed != Guid.Empty,
            "Set RESEND_TEST_DELIVERY_ID to a GUID and reuse it for retries.");
        var exitCode = await OperationsCommand.RunAsync(
            ["email-smoke-test", "--delivery-id", parsed.ToString()], "Host=unused");
        Assert.Equal(0, exitCode);
    }

    private sealed class RecordingSender(EmailSendResult result) : ITransactionalEmailSender
    {
        public TransactionalEmailMessage? Message { get; private set; }
        public Task<EmailSendResult> SendAsync(TransactionalEmailMessage message, CancellationToken cancellationToken)
        {
            Message = message;
            return Task.FromResult(result);
        }
    }
}

public sealed class LiveResendFactAttribute : FactAttribute
{
    public LiveResendFactAttribute()
    {
        if (Environment.GetEnvironmentVariable("RUN_RESEND_LIVE_TEST") != "true")
            Skip = "Opt in with RUN_RESEND_LIVE_TEST=true to send a real email.";
    }
}
