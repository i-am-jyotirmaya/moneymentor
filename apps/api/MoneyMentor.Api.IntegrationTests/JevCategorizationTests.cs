using System.Net;
using System.Collections.Concurrent;
using System.Diagnostics.Metrics;
using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using MoneyMentor.Application.Jev;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Jev;
using MoneyMentor.Infrastructure.Transactions;
using Xunit;

namespace MoneyMentor.Api.IntegrationTests;

public sealed class JevCategorizationTests
{
    [Fact]
    public async Task Provider_http_failure_is_counted_once_as_a_failed_attempt()
    {
        var outcomes = new ConcurrentQueue<string>();
        using var listener = new MeterListener();
        listener.InstrumentPublished = (instrument, current) =>
        {
            if (instrument.Name == "moneymentor.jev.requests") current.EnableMeasurementEvents(instrument);
        };
        listener.SetMeasurementEventCallback<long>((_, value, tags, _) =>
        {
            if (value != 1) return;
            foreach (var tag in tags)
                if (tag.Key == "outcome") outcomes.Enqueue(tag.Value?.ToString() ?? "");
        });
        listener.Start();

        var handler = new RecordingHandler { StatusCode = HttpStatusCode.TooManyRequests };
        using var http = new HttpClient(handler) { BaseAddress = new Uri("https://api.typesafe.ai/") };
        var client = new JevClient(http, Options.Create(new JevOptions { ApiKey = "test-key" }));

        await Assert.ThrowsAsync<HttpRequestException>(() => client.DecideAsync(
            new { description = "coffee" },
            new Dictionary<string, JevQuestion> { ["category"] = JevQuestion.Noul("coffee?") },
            CancellationToken.None));

        Assert.Contains("http_429", outcomes);
    }

    [Fact]
    public async Task Client_sends_authenticated_typed_question_and_reads_choice()
    {
        var handler = new RecordingHandler();
        using var http = new HttpClient(handler) { BaseAddress = new Uri("https://api.typesafe.ai/") };
        var client = new JevClient(http, Options.Create(new JevOptions { ApiKey = "test-key" }));
        var decision = await client.DecideAsync(
            new { description = "train pass" },
            new Dictionary<string, JevQuestion>
            {
                ["category"] = JevQuestion.Choice("Select category", new Dictionary<string, string>
                {
                    ["Public Transit"] = "bus, train, metro",
                    ["Groceries"] = "food supplies"
                }),
                ["likely"] = JevQuestion.Noul("Is this transport?"),
                ["priority"] = JevQuestion.Score("Rate urgency", ["low", "high"])
            },
            CancellationToken.None);

        Assert.Equal("/v1/systemone", handler.Path);
        Assert.Equal("Bearer test-key", handler.Authorization);
        using var request = JsonDocument.Parse(handler.Body!);
        Assert.Equal("jev-latest", request.RootElement.GetProperty("model").GetString());
        Assert.Equal("choice", request.RootElement.GetProperty("questions")
            .GetProperty("category").GetProperty("type").GetString());
        Assert.True(decision.TryGetChoice("category", out var category, out var confidence));
        Assert.Equal("Public Transit", category);
        Assert.Equal(0.91, confidence);
        Assert.True(decision.TryGetNoul("likely", out var probability));
        Assert.Equal(0.8, probability);
        Assert.True(decision.TryGetScore("priority", out var score, out _));
        Assert.Equal(1.2, score);
    }

    [Theory]
    [InlineData(CategoryType.Expense, "Snacks", "Cafes / Coffee", 0.93, "Cafes / Coffee")]
    [InlineData(CategoryType.Income, "Other Income", "Salary / Wages", 0.91, "Salary / Wages")]
    [InlineData(CategoryType.Expense, "Snacks", "Cafes / Coffee", 0.40, "Cafes / Coffee")]
    [InlineData(CategoryType.Expense, "Snacks", "Miscellaneous / Uncategorized", 0.40, "Miscellaneous / Uncategorized")]
    [InlineData(CategoryType.Expense, "Snacks", "Salary / Wages", 0.99, "Snacks")]
    public async Task Categorizer_uses_jev_choice_of_validated_type_regardless_of_confidence(
        CategoryType type, string guess, string selected, double confidence, string expected)
    {
        var provider = new FakeJevClient(selected, confidence);
        var categorizer = new JevTransactionCategorizer(provider, NullLogger<JevTransactionCategorizer>.Instance);

        var result = await categorizer.CategorizeAsync(
            type, "coffee", "local cafe", "coffee 80", guess, CancellationToken.None);

        Assert.Equal(expected, result);
        Assert.Equal("choice", provider.Questions!["category"].Type);
        var choices = Assert.IsAssignableFrom<IReadOnlyDictionary<string, string>>(provider.Questions["category"].Criteria);
        Assert.Contains(type == CategoryType.Income ? "Salary / Wages" : "Cafes / Coffee", choices.Keys);
    }

    [Fact]
    public async Task Categorizer_keeps_capture_guess_when_provider_is_unavailable()
    {
        var provider = new FakeJevClient("Groceries", 0.99) { IsConfigured = false };
        var categorizer = new JevTransactionCategorizer(provider, NullLogger<JevTransactionCategorizer>.Instance);

        Assert.Equal("Education", await categorizer.CategorizeAsync(
            CategoryType.Expense, "books", null, "books 500", "Education", CancellationToken.None));
        Assert.Null(provider.Questions);
    }

    private sealed class FakeJevClient(string selected, double confidence) : IJevClient
    {
        public bool IsConfigured { get; set; } = true;
        public IReadOnlyDictionary<string, JevQuestion>? Questions { get; private set; }

        public Task<JevDecision> DecideAsync(object state, IReadOnlyDictionary<string, JevQuestion> questions,
            CancellationToken cancellationToken)
        {
            Questions = questions;
            using var body = JsonDocument.Parse(JsonSerializer.Serialize(new
            {
                category = new { type = "choice", choice = selected, confidence }
            }));
            return Task.FromResult(new JevDecision(body.RootElement.Clone()));
        }
    }

    private sealed class RecordingHandler : HttpMessageHandler
    {
        public HttpStatusCode StatusCode { get; set; } = HttpStatusCode.OK;
        public string? Body { get; private set; }
        public string? Path { get; private set; }
        public string? Authorization { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Path = request.RequestUri?.AbsolutePath;
            Authorization = request.Headers.Authorization?.ToString();
            Body = await request.Content!.ReadAsStringAsync(cancellationToken);
            return new HttpResponseMessage(StatusCode)
            {
                Content = new StringContent("""
                    {"model":"jev-latest","answers":{"category":{"type":"choice","choice":"Public Transit","confidence":0.91,"probabilities":{"Public Transit":0.91,"Groceries":0.09}},"likely":{"type":"noul","noul":0.8},"priority":{"type":"score","score":1.2,"confidence":0.9,"legend":{"0":"low","1":"high"},"probabilities":{"0":0.2,"1":0.8}}},"usage":{"input_tokens":50,"output_tokens":3}}
                    """)
            };
        }
    }
}
