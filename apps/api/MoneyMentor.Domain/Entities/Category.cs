using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Domain.Entities;

public sealed class Category
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid? HouseholdId { get; set; }

    public string Name { get; set; } = string.Empty;

    public CategoryType Type { get; set; }

    public CategoryClassification Classification { get; set; } = CategoryClassification.Discretionary;

    public Guid? ParentCategoryId { get; set; }

    public string KeywordsJson { get; set; } = string.Empty;

    public bool IsSystemCategory { get; set; }

    public string? Icon { get; set; }

    public int SortOrder { get; set; }

    public bool IsHidden { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
