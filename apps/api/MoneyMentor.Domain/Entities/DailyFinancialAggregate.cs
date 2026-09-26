using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Domain.Entities;

// The grain is a transaction owner, date, visibility and category. Household reports
// include only Household rows; personal reports include both visibility values.
public sealed class DailyFinancialAggregate
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid HouseholdId { get; set; }
    public Guid? UserProfileId { get; set; }
    public DateOnly Date { get; set; }
    public TransactionVisibility Visibility { get; set; }
    public Guid? CategoryId { get; set; }
    public decimal Income { get; set; }
    public decimal Expense { get; set; }
    public decimal EssentialSpend { get; set; }
    public decimal DiscretionarySpend { get; set; }
    public decimal DebtSpend { get; set; }
    public decimal InvestmentAmount { get; set; }
    public int TransactionCount { get; set; }
    public int ExpenseTransactionCount { get; set; }
    public int IncomeTransactionCount { get; set; }
    public decimal AverageTransactionAmount { get; set; }
    public decimal MaximumTransactionAmount { get; set; }
    public string CalculationVersion { get; set; } = "v1";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
