using MoneyMentor.Application.Assistant;
using MoneyMentor.Domain.Enums;
using Xunit;

namespace MoneyMentor.Application.Tests.Assistant;

public sealed class AssistantConfirmationStoreTests
{
    [Fact]
    public void SeparatePreviewsForOneScopeRemainIndependentlyAvailable()
    {
        var store = new AssistantConfirmationStore();
        var first = new AssistantMessageCommand("first image", "local", "test-user", null,
            InputMode.Image, null, "INR", "en-IN", null, null);
        var second = first with { Text = "second image" };

        var firstToken = store.Add(first, null, null);
        var secondToken = store.Add(second, null, null);

        Assert.NotNull(store.Take(firstToken, first));
        Assert.NotNull(store.Take(secondToken, second));
        Assert.Null(store.Take(firstToken, first));
        Assert.Null(store.Take(secondToken, second));
    }
}
