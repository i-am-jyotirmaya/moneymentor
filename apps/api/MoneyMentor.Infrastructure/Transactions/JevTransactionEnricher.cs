using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MoneyMentor.Application.InputParsing;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.Transactions;

internal sealed class JevOptions
{
    public const string SectionName = "Jev";
    public string ApiKey { get; set; } = string.Empty;
    public string Model { get; set; } = "jev-latest";
    public decimal CategoryConfidenceThreshold { get; set; } = 0.85m;
}

internal sealed record TransactionEnrichment(Guid? SuggestedCategoryId, string? MetadataJson);

internal sealed class JevTransactionEnricher(
    HttpClient client, IOptions<JevOptions> options, ILogger<JevTransactionEnricher> logger)
{
    private const string SchemaVersion = "transaction-v1";

    public bool IsEnabled => !string.IsNullOrWhiteSpace(options.Value.ApiKey);

    public async Task<TransactionEnrichment> EnrichAsync(
        ExpenseDraft draft, IReadOnlyCollection<Category> choices, CancellationToken cancellationToken)
    {
        var config = options.Value;
        if (string.IsNullOrWhiteSpace(config.ApiKey) || choices.Count == 0)
            return new TransactionEnrichment(null, null);

        var optionsByLabel = choices.Take(200).ToDictionary(x => "cat_" + x.Id.ToString("N"), x => x);
        var criteria = optionsByLabel.ToDictionary(x => x.Key, x => (string?)x.Value.Name);
        var request = new
        {
            model = config.Model,
            state = new
            {
                text = draft.SourceText.Length <= 500 ? draft.SourceText : draft.SourceText[..500],
                merchant = draft.MerchantName,
                categoryGuess = draft.CategoryGuess,
                description = draft.Description
            },
            questions = new
            {
                category = new { type = "choice", instructions = "Select the best existing expense category. Do not infer amounts.", criteria },
                classification = new { type = "choice", instructions = "Classify this purchase in context.",
                    criteria = new Dictionary<string, string?> { ["essential"] = null, ["discretionary"] = null,
                        ["obligation"] = null, ["unknown"] = null } },
                optionality = new { type = "score", instructions = "How optional is this expense?",
                    criteria = new[] { "Necessary obligation", "Mostly necessary", "Mixed", "Mostly optional", "Fully optional" } },
                recurring = new { type = "noul", instructions = "Is this likely recurring?" },
                reimbursement = new { type = "noul", instructions = "Is this likely to be reimbursed?" }
            }
        };
        try
        {
            using var message = new HttpRequestMessage(HttpMethod.Post, "v1/systemone")
            {
                Content = JsonContent.Create(request)
            };
            message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", config.ApiKey);
            using var response = await client.SendAsync(message, cancellationToken);
            response.EnsureSuccessStatusCode();
            using var document = await JsonDocument.ParseAsync(
                await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
            var root = document.RootElement;
            var answers = root.GetProperty("answers");
            var category = answers.GetProperty("category");
            var label = category.GetProperty("choice").GetString();
            var confidence = category.GetProperty("confidence").GetDecimal();
            Guid? suggested = label is not null && optionsByLabel.TryGetValue(label, out var match)
                && confidence >= config.CategoryConfidenceThreshold && confidence <= 1m
                ? match.Id : null;
            var metadata = JsonSerializer.Serialize(new
            {
                provider = "typesafe", model = root.GetProperty("model").GetString(), schemaVersion = SchemaVersion,
                categoryConfidence = confidence,
                categoryId = suggested,
                classification = answers.GetProperty("classification").GetProperty("choice").GetString(),
                optionality = answers.GetProperty("optionality").GetProperty("score").GetDecimal(),
                recurringProbability = answers.GetProperty("recurring").GetProperty("noul").GetDecimal(),
                reimbursementProbability = answers.GetProperty("reimbursement").GetProperty("noul").GetDecimal()
            });
            return new TransactionEnrichment(suggested, metadata);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch (Exception exception)
        {
            logger.LogWarning("Jev enrichment unavailable ({FailureType}); using deterministic category fallback.",
                exception.GetType().Name);
            return new TransactionEnrichment(null, null);
        }
    }
}
