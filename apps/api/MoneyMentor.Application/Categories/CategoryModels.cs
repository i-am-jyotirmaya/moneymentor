using MoneyMentor.Application.AppUsers;
using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Application.Categories;

public sealed record CategoryCatalogModel(
    Guid HouseholdId,
    bool CanWrite,
    IReadOnlyCollection<CategoryModel> Categories);

public sealed record CategoryModel(
    Guid Id,
    Guid? HouseholdId,
    Guid? ParentCategoryId,
    string Name,
    CategoryType Type,
    CategoryClassification Classification,
    bool IsSystemCategory,
    string? Icon,
    int SortOrder,
    bool IsHidden,
    DateTimeOffset CreatedAt);

public sealed record CreateCategoryCommand(
    AppUserContext UserContext,
    Guid? HouseholdId,
    string Name,
    Guid? ParentCategoryId,
    CategoryType Type,
    CategoryClassification Classification,
    string? Icon);

public sealed record UpdateCategoryCommand(
    AppUserContext UserContext,
    string? Name,
    Guid? ParentCategoryId,
    CategoryClassification? Classification,
    string? Icon,
    bool? IsHidden);

public interface ICategoryService
{
    Task<CategoryCatalogModel> ListAsync(
        AppUserContext userContext,
        Guid? householdId,
        CancellationToken cancellationToken);

    Task<CategoryModel> CreateAsync(
        CreateCategoryCommand command,
        CancellationToken cancellationToken);

    Task<CategoryModel?> UpdateAsync(
        AppUserContext userContext,
        Guid categoryId,
        UpdateCategoryCommand command,
        CancellationToken cancellationToken);

    Task<bool> DeleteAsync(
        AppUserContext userContext,
        Guid categoryId,
        CancellationToken cancellationToken);
}

public sealed class CategoryValidationException(string message) : Exception(message);
