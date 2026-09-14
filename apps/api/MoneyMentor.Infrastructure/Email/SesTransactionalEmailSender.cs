using Amazon.Runtime;
using Amazon.SimpleEmailV2;
using Amazon.SimpleEmailV2.Model;
using Microsoft.Extensions.Options;
using MoneyMentor.Application.Households;
using MoneyMentor.Infrastructure.Aws;

namespace MoneyMentor.Infrastructure.Email;

internal sealed class SesTransactionalEmailSender(
    Func<IAmazonSimpleEmailServiceV2> clientFactory,
    IOptions<SesOptions> options,
    IOptions<AwsIntegrationOptions> awsOptions) : ITransactionalEmailSender
{
    public async Task<EmailSendResult> SendAsync(
        TransactionalEmailMessage message,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var settings = options.Value;
        if (!awsOptions.Value.Enabled || string.IsNullOrWhiteSpace(awsOptions.Value.Region)
            || string.IsNullOrWhiteSpace(settings.FromAddress))
        {
            return EmailSendResult.Failure("SES email delivery requires AWS:Enabled, AWS:Region, and SES:FromAddress.");
        }

        var request = new SendEmailRequest
        {
            FromEmailAddress = settings.FromAddress,
            Destination = new Destination { ToAddresses = [message.To] },
            ReplyToAddresses = string.IsNullOrWhiteSpace(settings.ReplyTo) ? null : [settings.ReplyTo],
            ConfigurationSetName = string.IsNullOrWhiteSpace(settings.ConfigurationSetName)
                ? null : settings.ConfigurationSetName,
            Content = new EmailContent
            {
                Simple = new Message
                {
                    Subject = new Content { Data = message.Subject, Charset = "UTF-8" },
                    Body = new Body
                    {
                        Text = new Content { Data = message.TextBody, Charset = "UTF-8" },
                        Html = new Content { Data = message.HtmlBody, Charset = "UTF-8" }
                    }
                }
            },
            // Correlates SES events with a delivery; SES does not deduplicate by tag.
            EmailTags = [new MessageTag { Name = "delivery-id", Value = message.DeliveryId.ToString("N") }]
        };

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(15));
        try
        {
            var response = await clientFactory().SendEmailAsync(request, timeout.Token);
            return string.IsNullOrWhiteSpace(response.MessageId)
                ? EmailSendResult.Failure("SES returned no message ID.")
                : EmailSendResult.Success(response.MessageId);
        }
        catch (AmazonServiceException exception)
        {
            // Provider exception text can contain recipient addresses or message data.
            return EmailSendResult.Failure($"SES rejected the message with HTTP {(int)exception.StatusCode}.");
        }
        catch (AmazonClientException)
        {
            return EmailSendResult.Failure("SES could not authenticate or complete the request. Check AWS credentials and configuration.");
        }
        catch (HttpRequestException)
        {
            return EmailSendResult.Failure("SES could not be reached.");
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return EmailSendResult.Failure("SES timed out; delivery may have occurred.");
        }
    }
}
