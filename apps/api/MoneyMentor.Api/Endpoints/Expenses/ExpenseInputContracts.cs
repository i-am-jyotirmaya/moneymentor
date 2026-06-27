using System.ComponentModel.DataAnnotations;
using MoneyMentor.Application.InputParsing;
using MoneyMentor.Application.Transactions;

namespace MoneyMentor.Api.Endpoints.Expenses;

public sealed class ExpenseInputRequest
{
    [Required]
    [MaxLength(4000)]
    public string Text { get; init; } = string.Empty;

    public Guid? HouseholdId { get; init; }

    [MaxLength(32)]
    public string InputMode { get; init; } = "Text";

    public DateOnly? TransactionDate { get; init; }

    [MinLength(3)]
    [MaxLength(3)]
    public string? CurrencyCode { get; init; }

    [MaxLength(32)]
    public string? Locale { get; init; }
}

public sealed record ExpenseInputResponse(
    ExpenseInputParseStatus Status,
    FinanceInputIntent Intent,
    TransactionModel? Transaction,
    ExpenseDraft? ParsedDebug,
    string? AssistantMessage,
    IReadOnlyCollection<string> Errors);
