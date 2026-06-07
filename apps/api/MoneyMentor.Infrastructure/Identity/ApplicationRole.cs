using Microsoft.AspNetCore.Identity;

namespace MoneyMentor.Infrastructure.Identity;

public sealed class ApplicationRole : IdentityRole<Guid>
{
    public ApplicationRole()
    {
        Id = Guid.NewGuid();
    }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
