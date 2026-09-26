using System.Net;
using System.Net.Http.Json;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.JudgementReports;
using MoneyMentor.Infrastructure.Transactions;
using Xunit;

namespace MoneyMentor.Api.IntegrationTests;

public sealed class JevJudgmentGateTests
{
    [Fact]
    public async Task High_confidence_ignore_requires_no_llm()
    {
        var client = new HttpClient(new StubHandler(() => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = JsonContent.Create(new
            {
                model = "jev-latest",
                answers = new
                {
                    action = new { type = "choice", choice = "IGNORE", confidence = 0.95m },
                    importance = new { type = "score", score = 0.4m, confidence = 0.9m },
                    needsIntent = new { type = "noul", noul = 0.1m },
                    worthLlm = new { type = "noul", noul = 0.05m }
                }
            })
        })) { BaseAddress = new Uri("https://api.typesafe.ai/") };
        var gate = new JevJudgmentGate(client, Options.Create(new JevOptions { ApiKey = "test" }),
            NullLogger<JevJudgmentGate>.Instance);

        var outcome = await gate.DecideAsync(new JudgmentCandidate { InterestingnessScore = 0.8m },
            "{\"candidate\":{\"type\":\"spike\"}}", CancellationToken.None);

        Assert.Equal(JudgmentDecisionAction.Ignore, outcome.Action);
        Assert.False(outcome.NeedsLlm);
        Assert.Equal("typesafe", outcome.Provider);
    }

    private sealed class StubHandler(Func<HttpResponseMessage> respond) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(respond());
    }
}
