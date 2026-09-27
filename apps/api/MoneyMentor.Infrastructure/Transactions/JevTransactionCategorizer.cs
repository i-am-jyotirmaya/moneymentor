using System.Net.Http;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using MoneyMentor.Application.Jev;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Categories;

namespace MoneyMentor.Infrastructure.Transactions;

// The capture flow establishes income vs expense from validated input. Jev selects
// a leaf category of that type; it cannot change an amount or transaction direction.
public sealed class JevTransactionCategorizer(
    IJevClient jev,
    ILogger<JevTransactionCategorizer> logger)
{
    private const double MinimumConfidence = 0.65;
    private const string ExpenseFallback = "Miscellaneous / Uncategorized";
    private const string IncomeFallback = "Other Income";

    public async Task<string> CategorizeAsync(
        CategoryType type,
        string? description,
        string? counterparty,
        string sourceText,
        string? existingGuess,
        CancellationToken cancellationToken)
    {
        var definitions = SystemCategoryCatalog.Definitions
            .Where(category => category.Type == type && !category.IsGroup)
            .ToArray();
        var fallback = type == CategoryType.Income ? IncomeFallback : ExpenseFallback;
        // Older capture rules include categories that predate the hierarchical catalog.
        // Keep those exact guesses when Jev is absent or uncertain.
        var knownGuess = string.IsNullOrWhiteSpace(existingGuess) ? null : existingGuess.Trim();

        if (!jev.IsConfigured || string.IsNullOrWhiteSpace(sourceText))
        {
            return knownGuess ?? fallback;
        }

        var criteria = definitions.ToDictionary(
            category => category.Name,
            category => $"{category.ParentName}: {category.Name}. Examples: {string.Join(", ", category.Keywords)}",
            StringComparer.Ordinal);
        var questions = new Dictionary<string, JevQuestion>
        {
            ["category"] = JevQuestion.Choice(
                $"Choose the most specific {type.ToString().ToLowerInvariant()} category for this single transaction. "
                + "Use the purchase or income purpose, not the payment app or merchant alone. "
                + $"If unclear, choose {fallback}.",
                criteria)
        };

        try
        {
            var decision = await jev.DecideAsync(
                new
                {
                    transactionType = type.ToString(),
                    description,
                    counterparty,
                    sourceText = sourceText[..Math.Min(sourceText.Length, 512)]
                },
                questions,
                cancellationToken);
            if (decision.TryGetChoice("category", out var category, out var confidence)
                && confidence >= MinimumConfidence
                && criteria.ContainsKey(category))
            {
                return category;
            }

            logger.LogInformation("Jev category was uncertain or outside the configured catalog; using capture fallback.");
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception) when (exception is HttpRequestException
            or OperationCanceledException or JsonException or InvalidOperationException)
        {
            // No transaction text or provider response is logged.
            logger.LogWarning("Jev category lookup failed ({FailureType}); using capture fallback.",
                exception.GetType().Name);
        }

        return knownGuess ?? fallback;
    }
}
