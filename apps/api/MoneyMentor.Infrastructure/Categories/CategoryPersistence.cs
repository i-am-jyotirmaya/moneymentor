using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MoneyMentor.Application.Categories;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Persistence;

namespace MoneyMentor.Infrastructure.Categories;

internal static class CategoryPersistence
{
    public static async Task EnsureSystemCatalogAsync(
        MoneyMentorDbContext dbContext,
        CancellationToken cancellationToken)
    {
        foreach (var definition in SystemCategoryCatalog.Definitions.Where(definition => definition.IsGroup))
        {
            await EnsureSystemCategoryAsync(dbContext, definition, null, cancellationToken);
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        foreach (var definition in SystemCategoryCatalog.Definitions.Where(definition => !definition.IsGroup))
        {
            var parent = definition.ParentName is null
                ? null
                : await FindSystemRootAsync(dbContext, definition.ParentName, cancellationToken);
            await EnsureSystemCategoryAsync(dbContext, definition, parent?.Id, cancellationToken);
        }

        await BackfillFlatSystemCategoriesAsync(dbContext, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public static async Task<Guid?> GetOrCreateSystemCategoryIdAsync(
        MoneyMentorDbContext dbContext,
        string? categoryName,
        CategoryType categoryType,
        CancellationToken cancellationToken)
    {
        var normalizedName = NormalizeOptional(categoryName);
        if (normalizedName is null)
        {
            return null;
        }

        var definition = SystemCategoryCatalog.FindByName(normalizedName, categoryType);
        if (definition is not null)
        {
            Guid? parentId = null;
            if (definition.ParentName is not null)
            {
                var parent = await FindSystemRootAsync(dbContext, definition.ParentName, cancellationToken);
                if (parent is null)
                {
                    var parentDefinition = SystemCategoryCatalog.Definitions.First(item =>
                        item.IsGroup && item.Name == definition.ParentName);
                    parent = await EnsureSystemCategoryAsync(dbContext, parentDefinition, null, cancellationToken);
                    await dbContext.SaveChangesAsync(cancellationToken);
                }

                parentId = parent.Id;
            }

            var category = await EnsureSystemCategoryAsync(
                dbContext,
                definition,
                parentId,
                cancellationToken);
            await dbContext.SaveChangesAsync(cancellationToken);
            return category.Id;
        }

        var existing = await dbContext.Categories.FirstOrDefaultAsync(
            category => category.HouseholdId == null
                && category.ParentCategoryId == null
                && category.Type == categoryType
                && category.Name == normalizedName,
            cancellationToken);
        if (existing is not null)
        {
            return existing.Id;
        }

        var fallback = new Category
        {
            Name = normalizedName,
            Type = categoryType,
            Classification = SystemCategoryCatalog.GetFallbackClassification(categoryType),
            KeywordsJson = "[]",
            IsSystemCategory = true,
            SortOrder = 10_000
        };
        dbContext.Categories.Add(fallback);
        await dbContext.SaveChangesAsync(cancellationToken);
        return fallback.Id;
    }

    public static CategoryModel Map(Category category) =>
        new(
            category.Id,
            category.HouseholdId,
            category.ParentCategoryId,
            category.Name,
            category.Type,
            category.Classification,
            category.IsSystemCategory,
            category.Icon,
            category.SortOrder,
            category.IsHidden,
            category.CreatedAt);

    public static string? NormalizeOptional(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }

    private static async Task<Category?> FindSystemRootAsync(
        MoneyMentorDbContext dbContext,
        string name,
        CancellationToken cancellationToken) =>
        await dbContext.Categories.FirstOrDefaultAsync(
            category => category.HouseholdId == null
                && category.ParentCategoryId == null
                && category.Name == name,
            cancellationToken);

    private static async Task<Category> EnsureSystemCategoryAsync(
        MoneyMentorDbContext dbContext,
        SystemCategoryDefinition definition,
        Guid? parentCategoryId,
        CancellationToken cancellationToken)
    {
        var category = await dbContext.Categories.FirstOrDefaultAsync(
            item => item.HouseholdId == null
                && item.ParentCategoryId == parentCategoryId
                && item.Type == definition.Type
                && item.Name == definition.Name,
            cancellationToken);
        if (category is null)
        {
            category = new Category
            {
                Name = definition.Name,
                Type = definition.Type,
                Classification = definition.Classification,
                ParentCategoryId = parentCategoryId,
                KeywordsJson = JsonSerializer.Serialize(definition.Keywords),
                IsSystemCategory = true,
                Icon = definition.Icon,
                SortOrder = definition.SortOrder
            };
            dbContext.Categories.Add(category);
            return category;
        }

        category.Classification = definition.Classification;
        category.ParentCategoryId = parentCategoryId;
        category.KeywordsJson = JsonSerializer.Serialize(definition.Keywords);
        category.IsSystemCategory = true;
        category.Icon = definition.Icon ?? category.Icon;
        category.SortOrder = definition.SortOrder;
        return category;
    }

    private static async Task BackfillFlatSystemCategoriesAsync(
        MoneyMentorDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var flatCategories = await dbContext.Categories
            .Where(category => category.HouseholdId == null && category.ParentCategoryId == null)
            .ToArrayAsync(cancellationToken);

        foreach (var category in flatCategories)
        {
            var definition = SystemCategoryCatalog.FindByName(category.Name, category.Type);
            if (definition?.ParentName is null)
            {
                continue;
            }

            var parent = await FindSystemRootAsync(dbContext, definition.ParentName, cancellationToken);
            if (parent is null || parent.Id == category.Id)
            {
                continue;
            }

            category.ParentCategoryId = parent.Id;
            category.Classification = definition.Classification;
            category.KeywordsJson = JsonSerializer.Serialize(definition.Keywords);
            category.SortOrder = definition.SortOrder;
        }
    }
}
