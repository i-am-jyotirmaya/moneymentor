using System.ComponentModel.DataAnnotations;
using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Api.Endpoints.Categories;

public sealed class CreateCategoryRequest
{
    [Required]
    [MaxLength(128)]
    public string Name { get; init; } = string.Empty;

    public Guid? HouseholdId { get; init; }

    public Guid? ParentCategoryId { get; init; }

    public CategoryType Type { get; init; } = CategoryType.Expense;

    public CategoryClassification Classification { get; init; } = CategoryClassification.Discretionary;

    [MaxLength(64)]
    public string? Icon { get; init; }
}

public sealed class UpdateCategoryRequest
{
    [MaxLength(128)]
    public string? Name { get; init; }

    public Guid? ParentCategoryId { get; init; }

    public CategoryClassification? Classification { get; init; }

    [MaxLength(64)]
    public string? Icon { get; init; }

    public bool? IsHidden { get; init; }
}
