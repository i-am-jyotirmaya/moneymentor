using MoneyMentor.Domain.Enums;
namespace MoneyMentor.Domain.Entities;

public sealed class FinancialAccount
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid HouseholdId { get; set; }
    public Guid? OwnerUserProfileId { get; set; }
    public string Name { get; set; } = string.Empty;
    public FinancialAccountType AccountType { get; set; }
    public string? Institution { get; set; }
    public string? Last4 { get; set; }
    public string CurrencyCode { get; set; } = "INR";
    public bool IsActive { get; set; } = true;
    public string? MetadataJson { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class FinancialAccountAlias
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid FinancialAccountId { get; set; }
    public string Alias { get; set; } = string.Empty;
}
