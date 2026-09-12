using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using System.Text.Json;
using Microsoft.Extensions.Options;
using MoneyMentor.Application.Households;

namespace MoneyMentor.Infrastructure.Email;

internal sealed class ResendTransactionalEmailSender(
    HttpClient httpClient,
    IOptions<ResendOptions> options) : ITransactionalEmailSender
{
    public async Task<EmailSendResult> SendAsync(
        TransactionalEmailMessage message,
        CancellationToken cancellationToken)
    {
        var settings = options.Value;
        if (string.IsNullOrWhiteSpace(settings.ApiKey)
            || string.IsNullOrWhiteSpace(settings.FromAddress))
        {
            return EmailSendResult.Failure("Resend email delivery is not configured.");
        }

        using var request = new HttpRequestMessage(HttpMethod.Post, "emails");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", settings.ApiKey);
        request.Headers.TryAddWithoutValidation("Idempotency-Key", $"transactional-email/{message.DeliveryId:N}");
        request.Headers.UserAgent.ParseAdd("MoneyMentor/1.0");
        request.Content = JsonContent.Create(new ResendEmailRequest(
            settings.FromAddress,
            [message.To],
            message.Subject,
            message.HtmlBody,
            message.TextBody,
            string.IsNullOrWhiteSpace(settings.ReplyTo) ? null : [settings.ReplyTo]));

        try
        {
            using var response = await httpClient.SendAsync(request, cancellationToken);
            if (response.IsSuccessStatusCode)
            {
                try
                {
                    var result = await response.Content.ReadFromJsonAsync<ResendEmailResponse>(
                        cancellationToken: cancellationToken);
                    if (!string.IsNullOrWhiteSpace(result?.Id))
                    {
                        return EmailSendResult.Success(result.Id);
                    }
                }
                catch (JsonException)
                {
                    return EmailSendResult.Failure("Resend returned an unreadable success response.");
                }
            }

            return EmailSendResult.Failure($"Resend rejected the message with HTTP {(int)response.StatusCode}.");
        }
        catch (HttpRequestException)
        {
            return EmailSendResult.Failure("Resend could not be reached.");
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return EmailSendResult.Failure("Resend timed out.");
        }
    }

    private sealed record ResendEmailRequest(
        [property: JsonPropertyName("from")] string From,
        [property: JsonPropertyName("to")] string[] To,
        [property: JsonPropertyName("subject")] string Subject,
        [property: JsonPropertyName("html")] string Html,
        [property: JsonPropertyName("text")] string Text,
        [property: JsonPropertyName("reply_to")] string[]? ReplyTo);

    private sealed record ResendEmailResponse(
        [property: JsonPropertyName("id")] string Id);
}
