using System.Net;
using System.Text;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using MoneyMentor.Application.InputParsing;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Transactions;
using Xunit;

namespace MoneyMentor.Api.IntegrationTests;

public sealed class JevTransactionEnricherTests
{
    [Fact]
    public async Task Accepts_only_a_high_confidence_category_from_the_supplied_choices()
    {
        var category = new Category { Name = "Groceries" };
        var client = new HttpClient(new StubHandler(request =>
        {
            Assert.Equal("/v1/systemone", request.RequestUri?.AbsolutePath);
            Assert.Equal("Bearer", request.Headers.Authorization?.Scheme);
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent($$"""
                    {"model":"jev-latest","answers":{
                      "category":{"type":"choice","choice":"cat_{{category.Id:N}}","confidence":0.91},
                      "classification":{"type":"choice","choice":"essential","confidence":0.8},
                      "optionality":{"type":"score","score":1.2,"confidence":0.7},
                      "recurring":{"type":"noul","noul":0.3},
                      "reimbursement":{"type":"noul","noul":0.1}}}
                    """, Encoding.UTF8, "application/json")
            };
        })) { BaseAddress = new Uri("https://api.typesafe.ai/") };
        var enricher = new JevTransactionEnricher(client,
            Options.Create(new JevOptions { ApiKey = "test", CategoryConfidenceThreshold = 0.85m }),
            NullLogger<JevTransactionEnricher>.Instance);
        var draft = new ExpenseDraft(100, null, null, "food", null, "groceries 100",
            InputMode.Text, 1m, []);

        var result = await enricher.EnrichAsync(draft, [category], CancellationToken.None);
        Assert.Equal(category.Id, result.SuggestedCategoryId);
        Assert.Contains("recurringProbability", result.MetadataJson);
    }

    private sealed class StubHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(respond(request));
    }
}
