using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Domain.Entities;

public sealed class Category
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid? HouseholdId { get; set; }

    public string Name { get; set; } = string.Empty;

    public CategoryType Type { get; set; }

    public Guid? ParentCategoryId { get; set; }

    public string KeywordsJson { get; set; } = string.Empty;

    public bool IsSystemCategory { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
