using Microsoft.EntityFrameworkCore;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Categories;
using MoneyMentor.Application.Households;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Infrastructure.Persistence;

namespace MoneyMentor.Infrastructure.Categories;

internal sealed class PostgresCategoryService(
    MoneyMentorDbContext dbContext,
    IHouseholdAccessService householdAccessService) : ICategoryService
{
    public async Task<CategoryCatalogModel> ListAsync(
        AppUserContext userContext,
        Guid? householdId,
        CancellationToken cancellationToken)
    {
        var access = await householdAccessService.ResolveAsync(
            userContext,
            householdId,
            requireWrite: false,
            cancellationToken);

        await CategoryPersistence.EnsureSystemCatalogAsync(dbContext, cancellationToken);

        var categories = await dbContext.Categories
            .AsNoTracking()
            .Where(category => category.HouseholdId == null || category.HouseholdId == access.HouseholdId)
            .OrderBy(category => category.SortOrder)
            .ThenBy(category => category.Name)
            .ToArrayAsync(cancellationToken);

        return new CategoryCatalogModel(
            access.HouseholdId,
            access.CanWrite,
            categories.Select(CategoryPersistence.Map).ToArray());
    }

    public async Task<CategoryModel> CreateAsync(
        CreateCategoryCommand command,
        CancellationToken cancellationToken)
    {
        var access = await householdAccessService.ResolveAsync(
            command.UserContext,
            command.HouseholdId,
            requireWrite: true,
            cancellationToken);

        var name = CategoryPersistence.NormalizeOptional(command.Name)
            ?? throw new CategoryValidationException("Category name is required.");
        await ValidateParentAsync(access.HouseholdId, command.ParentCategoryId, cancellationToken);

        var duplicate = await dbContext.Categories.AnyAsync(
            category => category.HouseholdId == access.HouseholdId
                && category.ParentCategoryId == command.ParentCategoryId
                && category.Name == name,
            cancellationToken);
        if (duplicate)
        {
            throw new CategoryValidationException("A category with that name already exists in this group.");
        }

        var category = new Category
        {
            HouseholdId = access.HouseholdId,
            Name = name,
            ParentCategoryId = command.ParentCategoryId,
            Type = command.Type,
            Classification = command.Classification,
            KeywordsJson = "[]",
            IsSystemCategory = false,
            Icon = CategoryPersistence.NormalizeOptional(command.Icon),
            SortOrder = 20_000
        };

        dbContext.Categories.Add(category);
        await dbContext.SaveChangesAsync(cancellationToken);
        return CategoryPersistence.Map(category);
    }

    public async Task<CategoryModel?> UpdateAsync(
        AppUserContext userContext,
        Guid categoryId,
        UpdateCategoryCommand command,
        CancellationToken cancellationToken)
    {
        var category = await dbContext.Categories.FirstOrDefaultAsync(
            item => item.Id == categoryId,
            cancellationToken);
        if (category is null)
        {
            return null;
        }

        if (category.IsSystemCategory || category.HouseholdId is null)
        {
            throw new CategoryValidationException("System categories cannot be changed.");
        }

        await householdAccessService.ResolveAsync(
            userContext,
            category.HouseholdId,
            requireWrite: true,
            cancellationToken);

        if (command.Name is not null)
        {
            category.Name = CategoryPersistence.NormalizeOptional(command.Name)
                ?? throw new CategoryValidationException("Category name is required.");
        }

        if (command.ParentCategoryId is not null && command.ParentCategoryId != category.ParentCategoryId)
        {
            await ValidateParentAsync(category.HouseholdId.Value, command.ParentCategoryId, cancellationToken);
            category.ParentCategoryId = command.ParentCategoryId;
        }

        if (command.Classification is not null)
        {
            category.Classification = command.Classification.Value;
        }

        if (command.Icon is not null)
        {
            category.Icon = CategoryPersistence.NormalizeOptional(command.Icon);
        }

        if (command.IsHidden is not null)
        {
            category.IsHidden = command.IsHidden.Value;
        }

        var duplicate = await dbContext.Categories.AnyAsync(
            item => item.Id != category.Id
                && item.HouseholdId == category.HouseholdId
                && item.ParentCategoryId == category.ParentCategoryId
                && item.Name == category.Name,
            cancellationToken);
        if (duplicate)
        {
            throw new CategoryValidationException("A category with that name already exists in this group.");
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return CategoryPersistence.Map(category);
    }

    public async Task<bool> DeleteAsync(
        AppUserContext userContext,
        Guid categoryId,
        CancellationToken cancellationToken)
    {
        var category = await dbContext.Categories.FirstOrDefaultAsync(
            item => item.Id == categoryId,
            cancellationToken);
        if (category is null)
        {
            return false;
        }

        if (category.IsSystemCategory || category.HouseholdId is null)
        {
            throw new CategoryValidationException("System categories cannot be deleted.");
        }

        await householdAccessService.ResolveAsync(
            userContext,
            category.HouseholdId,
            requireWrite: true,
            cancellationToken);

        var isReferenced = await dbContext.Categories.AnyAsync(
                child => child.ParentCategoryId == category.Id,
                cancellationToken)
            || await dbContext.Transactions.AnyAsync(
                transaction => transaction.CategoryId == category.Id,
                cancellationToken)
            || await dbContext.Commitments.AnyAsync(
                commitment => commitment.CategoryId == category.Id,
                cancellationToken);
        if (isReferenced)
        {
            throw new CategoryValidationException("Category is still in use.");
        }

        dbContext.Categories.Remove(category);
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    private async Task ValidateParentAsync(
        Guid householdId,
        Guid? parentCategoryId,
        CancellationToken cancellationToken)
    {
        if (parentCategoryId is null)
        {
            return;
        }

        var parent = await dbContext.Categories
            .AsNoTracking()
            .FirstOrDefaultAsync(
                category => category.Id == parentCategoryId
                    && (category.HouseholdId == null || category.HouseholdId == householdId),
                cancellationToken);
        if (parent is null)
        {
            throw new CategoryValidationException("Parent category is not available.");
        }

        if (parent.ParentCategoryId is not null)
        {
            throw new CategoryValidationException("Categories support only two levels: group and category.");
        }
    }
}
