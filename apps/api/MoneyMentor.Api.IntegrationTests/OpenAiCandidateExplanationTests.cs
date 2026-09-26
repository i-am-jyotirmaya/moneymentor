using System.Net;
using System.Net.Http.Json;
using Microsoft.Extensions.Options;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Goals;
using MoneyMentor.Infrastructure.JudgementReports;
using Xunit;

namespace MoneyMentor.Api.IntegrationTests;

public sealed class OpenAiCandidateExplanationTests
{
    [Fact]
    public async Task Rejects_generated_numbers_and_keeps_financial_values_in_the_facts()
    {
        var client = new HttpClient(new StubHandler(() => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = JsonContent.Create(new { output_text = "{\"message\":\"You spent 100 more.\"}" })
        })) { BaseAddress = new Uri("https://api.openai.com/v1/") };
        var explainer = new OpenAiCandidateExplanationClient(client,
            Options.Create(new OpenAiGoalPlanningOptions { ApiKey = "test" }));
        var decision = new JudgmentDecision(JudgmentDecisionAction.Nudge, 3m, 0.9m,
            true, false, "typesafe", "jev-latest", "decision-v1");

        var output = await explainer.ExplainAsync(new JudgmentCandidate(), decision,
            "{\"candidate\":{\"type\":\"spike\"}}", CancellationToken.None);

        Assert.Null(output);
    }

    private sealed class StubHandler(Func<HttpResponseMessage> respond) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(respond());
    }
}
