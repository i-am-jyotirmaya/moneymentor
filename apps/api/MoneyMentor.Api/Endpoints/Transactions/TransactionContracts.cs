using System.ComponentModel.DataAnnotations;

namespace MoneyMentor.Api.Endpoints.Transactions;

public sealed class UpdateTransactionRequest
{
    [Range(typeof(decimal), "0.01", "999999999999")]
    public decimal? Amount { get; init; }

    [MaxLength(128)]
    public string? CategoryName { get; init; }

    [MaxLength(256)]
    public string? MerchantName { get; init; }

    [MaxLength(1024)]
    public string? Description { get; init; }

    public DateOnly? TransactionDate { get; init; }

    [MaxLength(32)]
    public string? Visibility { get; init; }
}
