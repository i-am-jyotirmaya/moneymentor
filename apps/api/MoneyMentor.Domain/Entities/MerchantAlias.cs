namespace MoneyMentor.Domain.Entities;

public sealed class MerchantAlias
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid MerchantId { get; set; }
    public string Alias { get; set; } = string.Empty;
    public string NormalizedAlias { get; set; } = string.Empty;
    public string Source { get; set; } = "user";
    public decimal Confidence { get; set; } = 1m;
}
