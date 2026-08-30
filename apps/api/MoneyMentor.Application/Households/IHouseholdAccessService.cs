using MoneyMentor.Application.AppUsers;
using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Application.Households;

public interface IHouseholdAccessService
{
    Task<HouseholdAccessContext> ResolveAsync(
        AppUserContext userContext,
        Guid? requestedHouseholdId,
        bool requireWrite,
        CancellationToken cancellationToken);
}

public sealed record HouseholdAccessContext(
    Guid HouseholdId,
    HouseholdKind Kind,
    HouseholdRole Role,
    bool CanWrite,
    string CurrencyCode,
    string TimeZone);

public sealed class HouseholdNotFoundException : InvalidOperationException
{
    public HouseholdNotFoundException()
        : base("The selected household is not available.")
    {
    }
}

public sealed class HouseholdWriteForbiddenException : InvalidOperationException
{
    public HouseholdWriteForbiddenException()
        : base("You do not have permission to modify this household.")
    {
    }
}
