using System.Threading.Channels;

namespace MoneyMentor.Infrastructure.Email;

internal interface IInvitationDispatchSignal
{
    void Signal();

    ValueTask WaitAsync(CancellationToken cancellationToken);
}

internal sealed class InvitationDispatchSignal : IInvitationDispatchSignal
{
    private readonly Channel<bool> channel = Channel.CreateBounded<bool>(
        new BoundedChannelOptions(1)
        {
            AllowSynchronousContinuations = false,
            FullMode = BoundedChannelFullMode.DropWrite,
            SingleReader = true,
            SingleWriter = false
        });

    public void Signal() => channel.Writer.TryWrite(true);

    public async ValueTask WaitAsync(CancellationToken cancellationToken)
    {
        await channel.Reader.ReadAsync(cancellationToken);
        while (channel.Reader.TryRead(out _))
        {
            // Signals are wake-up hints. The database remains the durable queue.
        }
    }
}
