using Microsoft.EntityFrameworkCore;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Commitments;
using MoneyMentor.Application.Households;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Categories;
using MoneyMentor.Infrastructure.Persistence;

namespace MoneyMentor.Infrastructure.Commitments;

internal sealed class PostgresCommitmentService(
    MoneyMentorDbContext dbContext,
    IHouseholdAccessService householdAccessService,
    TimeProvider timeProvider) : ICommitmentService
{
    public async Task<IReadOnlyCollection<CommitmentModel>> ListAsync(
        AppUserContext userContext,
        Guid? householdId,
        CancellationToken cancellationToken)
    {
        var access = await householdAccessService.ResolveAsync(
            userContext,
            householdId,
            requireWrite: false,
            cancellationToken);

        var commitments = await dbContext.Commitments
            .AsNoTracking()
            .Where(commitment => commitment.HouseholdId == access.HouseholdId
                && (commitment.UserProfileId == null || commitment.UserProfileId == userContext.UserProfileId))
            .OrderByDescending(commitment => commitment.IsActive)
            .ThenBy(commitment => commitment.NextDueDate)
            .ThenBy(commitment => commitment.Name)
            .ToArrayAsync(cancellationToken);

        return await MapAsync(commitments, cancellationToken);
    }

    public async Task<CommitmentModel> CreateAsync(
        CreateCommitmentCommand command,
        CancellationToken cancellationToken)
    {
        var access = await householdAccessService.ResolveAsync(
            command.UserContext,
            command.HouseholdId,
            requireWrite: true,
            cancellationToken);
        ValidateTransactionType(command.TransactionType);
        if (command.Amount <= 0m)
        {
            throw new CommitmentValidationException("Commitment amount must be greater than zero.");
        }

        var categoryId = command.CategoryId
            ?? await CategoryPersistence.GetOrCreateSystemCategoryIdAsync(
                dbContext,
                command.CategoryName,
                CategoryType.Expense,
                cancellationToken);
        await ValidateReferencesAsync(access.HouseholdId, categoryId, command.GoalId, cancellationToken);

        var now = timeProvider.GetUtcNow();
        var commitment = new Commitment
        {
            HouseholdId = access.HouseholdId,
            UserProfileId = command.IsShared ? null : command.UserContext.UserProfileId,
            CategoryId = categoryId,
            GoalId = command.GoalId,
            Name = Normalize(command.Name)
                ?? throw new CommitmentValidationException("Commitment name is required."),
            TransactionType = command.TransactionType,
            Amount = command.Amount,
            Cadence = command.Cadence,
            NextDueDate = command.NextDueDate,
            IsActive = true,
            CreatedAt = now,
            UpdatedAt = now
        };

        dbContext.Commitments.Add(commitment);
        await dbContext.SaveChangesAsync(cancellationToken);
        return (await MapAsync([commitment], cancellationToken)).Single();
    }

    public async Task<CommitmentModel?> UpdateAsync(
        AppUserContext userContext,
        Guid commitmentId,
        UpdateCommitmentCommand command,
        CancellationToken cancellationToken)
    {
        var commitment = await dbContext.Commitments.FirstOrDefaultAsync(
            item => item.Id == commitmentId,
            cancellationToken);
        if (commitment is null || !await CanModifyAsync(userContext, commitment, cancellationToken))
        {
            return null;
        }

        if (command.Name is not null)
        {
            commitment.Name = Normalize(command.Name)
                ?? throw new CommitmentValidationException("Commitment name is required.");
        }

        if (command.TransactionType is not null)
        {
            ValidateTransactionType(command.TransactionType.Value);
            commitment.TransactionType = command.TransactionType.Value;
        }

        if (command.Amount is not null)
        {
            if (command.Amount <= 0m)
            {
                throw new CommitmentValidationException("Commitment amount must be greater than zero.");
            }

            commitment.Amount = command.Amount.Value;
        }

        if (command.Cadence is not null)
        {
            commitment.Cadence = command.Cadence.Value;
        }

        if (command.NextDueDate is not null)
        {
            commitment.NextDueDate = command.NextDueDate.Value;
        }

        if (command.IsActive is not null)
        {
            commitment.IsActive = command.IsActive.Value;
        }

        if (command.CategoryId is not null || command.CategoryName is not null)
        {
            commitment.CategoryId = command.CategoryId
                ?? await CategoryPersistence.GetOrCreateSystemCategoryIdAsync(
                    dbContext,
                    command.CategoryName,
                    CategoryType.Expense,
                    cancellationToken);
        }

        if (command.GoalId is not null)
        {
            commitment.GoalId = command.GoalId;
        }

        await ValidateReferencesAsync(
            commitment.HouseholdId,
            commitment.CategoryId,
            commitment.GoalId,
            cancellationToken);
        commitment.UpdatedAt = timeProvider.GetUtcNow();
        await dbContext.SaveChangesAsync(cancellationToken);
        return (await MapAsync([commitment], cancellationToken)).Single();
    }

    public async Task<int> MatchDueCommitmentsAsync(CancellationToken cancellationToken)
    {
        var today = DateOnly.FromDateTime(timeProvider.GetLocalNow().DateTime);
        var commitments = await dbContext.Commitments
            .Where(commitment => commitment.IsActive && commitment.NextDueDate < today)
            .OrderBy(commitment => commitment.NextDueDate)
            .Take(100)
            .ToArrayAsync(cancellationToken);
        if (commitments.Length == 0)
        {
            return 0;
        }

        var now = timeProvider.GetUtcNow();
        var commitmentIds = commitments.Select(item => item.Id).ToArray();
        var occurrences = await dbContext.CommitmentOccurrences
            .Where(item => commitmentIds.Contains(item.CommitmentId))
            .ToDictionaryAsync(item => (item.CommitmentId, item.DueDate), cancellationToken);
        var minimumDate = commitments.Min(item => item.NextDueDate).AddDays(-3);
        var maximumDate = commitments.Max(item => item.NextDueDate).AddDays(5);
        var householdIds = commitments.Select(item => item.HouseholdId).Distinct().ToArray();
        var candidates = await dbContext.Transactions
            .Where(item => householdIds.Contains(item.HouseholdId)
                && item.DeletedAt == null
                && item.TransactionDate >= minimumDate
                && item.TransactionDate <= maximumDate
                && (item.Type == TransactionType.Expense || item.Type == TransactionType.Investment))
            .OrderBy(item => item.TransactionDate)
            .ThenBy(item => item.CreatedAt)
            .ToArrayAsync(cancellationToken);
        var candidateIds = candidates.Select(item => item.Id).ToArray();
        var existingContributionKeys = await dbContext.GoalContributions.AsNoTracking()
            .Where(item => item.CommitmentId != null
                && item.TransactionId != null
                && commitmentIds.Contains(item.CommitmentId.Value)
                && candidateIds.Contains(item.TransactionId.Value))
            .Select(item => new { CommitmentId = item.CommitmentId!.Value, TransactionId = item.TransactionId!.Value })
            .ToArrayAsync(cancellationToken);
        var contributionKeys = existingContributionKeys
            .Select(item => (item.CommitmentId, item.TransactionId))
            .ToHashSet();
        var goalIds = commitments.Select(item => item.GoalId).OfType<Guid>().Distinct().ToArray();
        var goals = await dbContext.FinancialGoals
            .Where(item => goalIds.Contains(item.Id))
            .ToDictionaryAsync(item => item.Id, cancellationToken);
        var usedTransactions = occurrences.Values
            .Select(item => item.MatchedTransactionId)
            .OfType<Guid>()
            .ToHashSet();
        var matchedCount = 0;

        foreach (var commitment in commitments)
        {
            var dueDate = commitment.NextDueDate;
            if (!occurrences.TryGetValue((commitment.Id, dueDate), out var occurrence))
            {
                occurrence = new CommitmentOccurrence
                {
                    CommitmentId = commitment.Id,
                    HouseholdId = commitment.HouseholdId,
                    UserProfileId = commitment.UserProfileId,
                    DueDate = dueDate,
                    ExpectedAmount = commitment.Amount,
                    TransactionType = commitment.TransactionType,
                    Status = CommitmentOccurrenceStatus.Expected,
                    CreatedAt = now,
                    UpdatedAt = now
                };
                dbContext.CommitmentOccurrences.Add(occurrence);
                occurrences[(commitment.Id, dueDate)] = occurrence;
            }

            var windowStart = dueDate.AddDays(-3);
            var windowEnd = dueDate.AddDays(5);
            var tolerance = decimal.Round(commitment.Amount * 0.10m, 2);
            var matchedTransaction = candidates.FirstOrDefault(item =>
                !usedTransactions.Contains(item.Id)
                && item.HouseholdId == commitment.HouseholdId
                && item.CategoryId == commitment.CategoryId
                && item.Type == commitment.TransactionType
                && item.TransactionDate >= windowStart
                && item.TransactionDate <= windowEnd
                && item.Amount >= commitment.Amount - tolerance
                && item.Amount <= commitment.Amount + tolerance);
            if (matchedTransaction is null)
            {
                if (today > windowEnd)
                {
                    occurrence.Status = CommitmentOccurrenceStatus.Missed;
                    occurrence.EvaluatedAt = now;
                    occurrence.UpdatedAt = now;
                    commitment.NextDueDate = Advance(dueDate, commitment.Cadence);
                    commitment.UpdatedAt = now;
                }
                continue;
            }

            usedTransactions.Add(matchedTransaction.Id);
            occurrence.Status = CommitmentOccurrenceStatus.Matched;
            occurrence.MatchedTransactionId = matchedTransaction.Id;
            occurrence.MatchedAt = now;
            occurrence.EvaluatedAt = now;
            occurrence.UpdatedAt = now;
            commitment.LastMatchedAt = now;
            commitment.NextDueDate = Advance(dueDate, commitment.Cadence);
            commitment.UpdatedAt = now;
            matchedCount++;

            if (commitment.GoalId is not null
                && !contributionKeys.Contains((commitment.Id, matchedTransaction.Id))
                && goals.TryGetValue(commitment.GoalId.Value, out var goal))
            {
                var contribution = new GoalContribution
                {
                    GoalId = goal.Id,
                    UserProfileId = matchedTransaction.UserProfileId,
                    Amount = matchedTransaction.Amount,
                    ContributedAt = matchedTransaction.TransactionDate,
                    Source = GoalContributionSource.Sip,
                    TransactionId = matchedTransaction.Id,
                    CommitmentId = commitment.Id,
                    CreatedAt = now
                };
                dbContext.GoalContributions.Add(contribution);
                contributionKeys.Add((commitment.Id, matchedTransaction.Id));
                goal.CurrentAmount += contribution.Amount;
                goal.UpdatedAt = now;
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return matchedCount;
    }

    private async Task<IReadOnlyCollection<CommitmentModel>> MapAsync(
        IReadOnlyCollection<Commitment> commitments,
        CancellationToken cancellationToken)
    {
        var categoryIds = commitments.Select(commitment => commitment.CategoryId).OfType<Guid>().Distinct().ToArray();
        var categories = await dbContext.Categories
            .AsNoTracking()
            .Where(category => categoryIds.Contains(category.Id))
            .ToDictionaryAsync(category => category.Id, category => category.Name, cancellationToken);

        return commitments
            .Select(commitment => new CommitmentModel(
                commitment.Id,
                commitment.HouseholdId,
                commitment.UserProfileId,
                commitment.CategoryId,
                commitment.CategoryId is null ? null : categories.GetValueOrDefault(commitment.CategoryId.Value),
                commitment.GoalId,
                commitment.Name,
                commitment.TransactionType,
                commitment.Amount,
                commitment.Cadence,
                commitment.NextDueDate,
                commitment.IsActive,
                commitment.LastMatchedAt,
                commitment.LastJudgementAt,
                commitment.CreatedAt,
                commitment.UpdatedAt))
            .ToArray();
    }

    private async Task<bool> CanModifyAsync(
        AppUserContext userContext,
        Commitment commitment,
        CancellationToken cancellationToken)
    {
        try
        {
            var access = await householdAccessService.ResolveAsync(
                userContext,
                commitment.HouseholdId,
                requireWrite: true,
                cancellationToken);
            if (commitment.UserProfileId == userContext.UserProfileId)
            {
                return true;
            }

            return commitment.UserProfileId is null
                && access.Role is HouseholdRole.Owner or HouseholdRole.Admin;
        }
        catch (HouseholdNotFoundException)
        {
            return false;
        }
    }

    private async Task ValidateReferencesAsync(
        Guid householdId,
        Guid? categoryId,
        Guid? goalId,
        CancellationToken cancellationToken)
    {
        if (categoryId is not null)
        {
            var categoryExists = await dbContext.Categories.AnyAsync(
                category => category.Id == categoryId.Value
                    && (category.HouseholdId == null || category.HouseholdId == householdId),
                cancellationToken);
            if (!categoryExists)
            {
                throw new CommitmentValidationException("Category is not available.");
            }
        }

        if (goalId is not null)
        {
            var goalExists = await dbContext.FinancialGoals.AnyAsync(
                goal => goal.Id == goalId.Value && goal.HouseholdId == householdId,
                cancellationToken);
            if (!goalExists)
            {
                throw new CommitmentValidationException("Goal is not available.");
            }
        }
    }

    private static DateOnly Advance(DateOnly date, CommitmentCadence cadence) =>
        cadence switch
        {
            CommitmentCadence.Monthly => date.AddMonths(1),
            CommitmentCadence.Quarterly => date.AddMonths(3),
            CommitmentCadence.Annual => date.AddYears(1),
            _ => date
        };

    private static void ValidateTransactionType(TransactionType type)
    {
        if (type is not (TransactionType.Expense or TransactionType.Investment))
        {
            throw new CommitmentValidationException("Commitments can only be expense or investment flows.");
        }
    }

    private static string? Normalize(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }
}
