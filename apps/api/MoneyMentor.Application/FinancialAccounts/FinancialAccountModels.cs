using MoneyMentor.Application.AppUsers;
using MoneyMentor.Domain.Enums;
namespace MoneyMentor.Application.FinancialAccounts;

public sealed record FinancialAccountModel(Guid Id, Guid HouseholdId, Guid? OwnerUserProfileId, string Name,
    FinancialAccountType AccountType, string? Institution, string? Last4, string CurrencyCode, bool IsActive,
    IReadOnlyCollection<string> Aliases);
public sealed record SaveFinancialAccountCommand(Guid? HouseholdId, string Name, FinancialAccountType AccountType,
    string? Institution, string? Last4, IReadOnlyCollection<string> Aliases, bool Shared = false, bool IsActive = true);
public interface IFinancialAccountService
{
    Task<IReadOnlyCollection<FinancialAccountModel>> ListAsync(AppUserContext user, Guid? householdId, CancellationToken ct);
    Task<FinancialAccountModel> SaveAsync(AppUserContext user, Guid? id, SaveFinancialAccountCommand command, CancellationToken ct);
}
