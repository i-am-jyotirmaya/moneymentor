using System.Text.Json;
using MoneyMentor.Application.Jev;
using MoneyMentor.Application.Transactions;
using Xunit;

namespace MoneyMentor.Application.Tests.Transactions;

public sealed class TransactionEnrichmentContractTests
{
    [Fact]
    public void Schema_has_one_category_choice_and_four_independent_semantic_questions()
    {
        var categories = new Dictionary<string, string>
        {
            ["Restaurants / Dining"] = "Dining out",
            ["Miscellaneous / Uncategorized"] = "Fallback"
        };

        var questions = TransactionEnrichmentSchema.Questions(categories, "Miscellaneous / Uncategorized");

        Assert.Equal(5, questions.Count);
        Assert.Equal("choice", questions["category"].Type);
        Assert.Equal("score", questions["essentiality"].Type);
        var levels = Assert.IsAssignableFrom<IReadOnlyList<string>>(questions["essentiality"].Criteria);
        Assert.Equal(5, levels.Count);
        foreach (var name in new[] { "planned", "impulse", "committed" })
        {
            Assert.Equal("noul", questions[name].Type);
            var criteria = Assert.IsAssignableFrom<IReadOnlyDictionary<string, string>>(questions[name].Criteria);
            Assert.Equal(2, criteria.Count);
            Assert.False(string.IsNullOrWhiteSpace(criteria["true"]));
            Assert.False(string.IsNullOrWhiteSpace(criteria["false"]));
        }

        using var json = JsonDocument.Parse(JsonSerializer.Serialize(questions));
        Assert.Equal("Explicit spontaneous or unplanned purchase intent.",
            json.RootElement.GetProperty("impulse").GetProperty("criteria").GetProperty("true").GetString());
    }

    [Fact]
    public void Invalid_probabilities_are_not_exposed_as_diagnostics()
    {
        using var json = JsonDocument.Parse("""
            {"category":{"type":"choice","choice":"Dining","confidence":0.9,
                "probabilities":{"Dining":1.2}},
             "essentiality":{"type":"score","score":2.1,"confidence":0.8,
                "legend":{"0":"optional","1":"useful"},"probabilities":{"0":0.1,"1":0.9}},
             "planned":{"type":"noul","noul":0.5}}
            """);
        var result = new JevDecision(json.RootElement);

        Assert.False(result.TryGetChoiceProbabilities("category", out _));
        Assert.True(result.TryGetScoreDistribution("essentiality", out var legend, out var values));
        Assert.Equal("optional", legend.GetProperty("0").GetString());
        Assert.Equal(0.9, values["1"]);
        Assert.True(result.TryGetNoul("planned", out var probability));
        Assert.Equal(0.5, probability);
    }
}
