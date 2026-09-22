using System.Data.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Categories;
using MoneyMentor.Infrastructure.Persistence;
using Xunit;

namespace MoneyMentor.Api.IntegrationTests;

public sealed class CategoryPersistenceTests(MoneyMentorApiFactory factory)
    : IClassFixture<MoneyMentorApiFactory>
{
    [Fact]
    public async Task Catalog_initialization_uses_one_read_and_repeated_calls_do_not_write()
    {
        var commands = new CommandRecorder();
        var options = new DbContextOptionsBuilder<MoneyMentorDbContext>()
            .UseNpgsql(factory.ConnectionString)
            .AddInterceptors(commands)
            .Options;
        await using var db = new MoneyMentorDbContext(options);
        await using var transaction = await db.Database.BeginTransactionAsync();

        // A legacy flat category may already be referenced by transactions.
        var legacy = new Category
        {
            Name = "Groceries",
            Type = CategoryType.Expense,
            KeywordsJson = "[]",
            IsSystemCategory = true
        };
        db.Categories.Add(legacy);
        await db.SaveChangesAsync();
        commands.Commands.Clear();

        await CategoryPersistence.EnsureSystemCatalogAsync(db, CancellationToken.None);

        Assert.Single(commands.Commands, sql => sql.StartsWith("SELECT", StringComparison.Ordinal));
        var categories = await db.Categories.AsNoTracking().ToArrayAsync();
        foreach (var definition in SystemCategoryCatalog.Definitions)
        {
            Assert.Contains(categories, category => category.Name == definition.Name
                && category.Type == definition.Type
                && category.Classification == definition.Classification
                && category.IsSystemCategory
                && (definition.IsGroup ? category.ParentCategoryId is null : category.ParentCategoryId is not null));
        }

        var preserved = Assert.Single(categories, category => category.Id == legacy.Id);
        Assert.Equal("Food & Groceries", categories.Single(category => category.Id == preserved.ParentCategoryId).Name);

        // Use a fresh tracker, as a subsequent HTTP request would.
        db.ChangeTracker.Clear();
        commands.Commands.Clear();
        await CategoryPersistence.EnsureSystemCatalogAsync(db, CancellationToken.None);

        var onlyCommand = Assert.Single(commands.Commands);
        Assert.StartsWith("SELECT", onlyCommand);
        Assert.False(db.ChangeTracker.HasChanges());
        Assert.Equal(categories.Length, await db.Categories.CountAsync());
    }

    private sealed class CommandRecorder : DbCommandInterceptor
    {
        public List<string> Commands { get; } = [];

        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
            DbCommand command,
            CommandEventData eventData,
            InterceptionResult<DbDataReader> result,
            CancellationToken cancellationToken = default)
        {
            Commands.Add(command.CommandText);
            return ValueTask.FromResult(result);
        }

        public override ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(
            DbCommand command,
            CommandEventData eventData,
            InterceptionResult<int> result,
            CancellationToken cancellationToken = default)
        {
            Commands.Add(command.CommandText);
            return ValueTask.FromResult(result);
        }
    }
}
