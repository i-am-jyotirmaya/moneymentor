using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Xunit;

namespace MoneyMentor.Api.IntegrationTests;

[Collection(PostgreSqlApiCollection.Name)]
public sealed class AssistantPreviewTests(MoneyMentorApiFactory factory)
{
    [Fact]
    public async Task Image_preview_does_not_persist_and_confirmation_saves_once()
    {
        using var client = await ClientAsync();
        var preview = await SubmitAsync(client, "Payment successful\n₹649\nPaid to Swiggy\n30 Jun 2026", "Image", "Preview");
        Assert.Null(preview["transaction"]);
        Assert.Equal(649m, preview["parsedDebug"]!["amount"]!.GetValue<decimal>());
        var token = preview["confirmationToken"]!.GetValue<string>();
        Assert.Equal(0, await CountAsync(client));
        var saved = await SubmitAsync(client, "client text must not change the draft", "Image", "Execute", token);
        Assert.Equal(649m, saved["transaction"]!["amount"]!.GetValue<decimal>());
        Assert.Equal(1, await CountAsync(client));
        var replay = await SubmitAsync(client, "repeat", "Image", "Execute", token);
        Assert.Null(replay["transaction"]);
        Assert.Equal(1, await CountAsync(client));
    }
    [Theory]
    [InlineData("Payment failed\n₹850\nReliance")]
    [InlineData("Payment processing\n₹850")]
    [InlineData("Reliance\n₹850\n₹350")]
    public async Task Unsafe_image_text_cannot_execute(string text)
    {
        using var client = await ClientAsync();
        var result = await SubmitAsync(client, text, "Image", "Execute");
        Assert.Null(result["transaction"]); Assert.Null(result["confirmationToken"]);
        Assert.Equal(0, await CountAsync(client));
    }
    [Fact]
    public async Task Text_executes_and_invalid_modes_are_rejected()
    {
        using var client = await ClientAsync();
        var result = await SubmitAsync(client, "spent 500 at Reliance on 2026-06-30", "Text", "Execute");
        Assert.NotNull(result["transaction"]);
        var invalid = await client.PostAsJsonAsync("/api/assistant/messages", new { text = "spent 5", inputMode = "999", processingMode = "Execute" }, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        invalid = await client.PostAsJsonAsync("/api/assistant/messages", new { text = "spent 5", inputMode = "Text", processingMode = "999" }, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
    }
    private async Task<HttpClient> ClientAsync()
    {
        var client = factory.CreateClient();
        var signup = await client.PostAsJsonAsync("/api/auth/users", new {
            email = $"preview-{Guid.NewGuid():N}@moneymentor.test", password = "PreviewPassword1", displayName = "Preview User",
            privacyPolicyVersion = "2026-07-26-ai-planning.1", acceptPrivacyPolicy = true
        }, TestContext.Current.CancellationToken);
        signup.EnsureSuccessStatusCode();
        var session = await signup.Content.ReadFromJsonAsync<JsonObject>(TestContext.Current.CancellationToken);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session!["accessToken"]!.GetValue<string>());
        return client;
    }
    private static async Task<JsonObject> SubmitAsync(HttpClient client, string text, string inputMode, string processingMode, string? confirmationToken = null)
    {
        var response = await client.PostAsJsonAsync("/api/assistant/messages", new { text, inputMode, processingMode, confirmationToken, currencyCode = "INR", locale = "en-IN" }, TestContext.Current.CancellationToken);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<JsonObject>(TestContext.Current.CancellationToken))!;
    }
    private static async Task<int> CountAsync(HttpClient client) =>
        (await client.GetFromJsonAsync<JsonObject>("/api/transactions?month=2026-06", TestContext.Current.CancellationToken))!["totalCount"]!.GetValue<int>();
}
