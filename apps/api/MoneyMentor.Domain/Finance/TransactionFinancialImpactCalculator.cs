using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Domain.Finance;

public sealed record TransactionFinancialImpact(decimal Spending, decimal Income, decimal Investment, decimal Rewards)
{
    public static readonly TransactionFinancialImpact Zero = new(0, 0, 0, 0);
}

// Amounts are positive magnitudes. Only these deterministic rules assign a sign.
// Cashback is reported separately from earned income and consumption spending.
public static class TransactionFinancialImpactCalculator
{
    public static TransactionKind ResolveKind(TransactionType type, TransactionKind? kind) => kind ?? type switch
    {
        TransactionType.Expense => TransactionKind.Purchase,
        TransactionType.Income => TransactionKind.Income,
        TransactionType.Investment => TransactionKind.Investment,
        TransactionType.Transfer => TransactionKind.Transfer,
        _ => throw new ArgumentOutOfRangeException(nameof(type))
    };

    public static TransactionType TypeFor(TransactionKind kind) => kind switch
    {
        TransactionKind.Purchase or TransactionKind.Refund or TransactionKind.Fee or TransactionKind.Interest => TransactionType.Expense,
        TransactionKind.Income or TransactionKind.Cashback => TransactionType.Income,
        TransactionKind.Investment => TransactionType.Investment,
        TransactionKind.Transfer or TransactionKind.CreditCardPayment or TransactionKind.CashWithdrawal or TransactionKind.Reversal => TransactionType.Transfer,
        _ => throw new ArgumentOutOfRangeException(nameof(kind))
    };

    public static TransactionFinancialImpact Calculate(Transaction transaction) =>
        Calculate(transaction.Amount, transaction.Type, transaction.Kind, transaction.ReversedKind);

    public static TransactionFinancialImpact Calculate(decimal amount, TransactionType type,
        TransactionKind? kind = null, TransactionKind? reversedKind = null)
    {
        if (amount < 0) throw new ArgumentOutOfRangeException(nameof(amount));
        var effectiveKind = ResolveKind(type, kind);
        if (effectiveKind == TransactionKind.Reversal)
        {
            if (reversedKind is null or TransactionKind.Reversal)
                throw new InvalidOperationException("A reversal requires the original event kind.");
            var original = Calculate(amount, TypeFor(reversedKind.Value), reversedKind);
            return new(-original.Spending, -original.Income, -original.Investment, -original.Rewards);
        }
        return effectiveKind switch
        {
            TransactionKind.Purchase or TransactionKind.Fee or TransactionKind.Interest => new(amount, 0, 0, 0),
            TransactionKind.Refund => new(-amount, 0, 0, 0),
            TransactionKind.Income => new(0, amount, 0, 0),
            TransactionKind.Investment => new(0, 0, amount, 0),
            TransactionKind.Cashback => new(0, 0, 0, amount),
            TransactionKind.Transfer or TransactionKind.CreditCardPayment or TransactionKind.CashWithdrawal => TransactionFinancialImpact.Zero,
            _ => throw new ArgumentOutOfRangeException(nameof(kind))
        };
    }
}
