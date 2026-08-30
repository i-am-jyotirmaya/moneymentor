using Microsoft.EntityFrameworkCore;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Goals;
using MoneyMentor.Application.Households;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Persistence;

namespace MoneyMentor.Infrastructure.Goals;

internal sealed class PostgresGoalService(
    MoneyMentorDbContext dbContext,
    IHouseholdAccessService householdAccessService,
    TimeProvider timeProvider) : IGoalService
{
    public async Task<IReadOnlyCollection<GoalModel>> ListAsync(
        AppUserContext userContext,
        Guid? householdId,
        CancellationToken cancellationToken)
    {
        var access = await householdAccessService.ResolveAsync(
            userContext,
            householdId,
            requireWrite: false,
            cancellationToken);

        var goals = await dbContext.FinancialGoals
            .AsNoTracking()
            .Where(goal => goal.HouseholdId == access.HouseholdId
                && (goal.UserProfileId == null || goal.UserProfileId == userContext.UserProfileId))
            .OrderBy(goal => goal.Status)
            .ThenByDescending(goal => goal.Priority)
            .ThenBy(goal => goal.TargetDate)
            .ThenBy(goal => goal.Name)
            .ToArrayAsync(cancellationToken);

        return goals.Select(goal => Map(goal, userContext.CurrentDate)).ToArray();
    }

    public async Task<GoalModel?> GetAsync(
        AppUserContext userContext,
        Guid goalId,
        CancellationToken cancellationToken)
    {
        var goal = await dbContext.FinancialGoals
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.Id == goalId, cancellationToken);
        if (goal is null)
        {
            return null;
        }

        try
        {
            await householdAccessService.ResolveAsync(
                userContext,
                goal.HouseholdId,
                requireWrite: false,
                cancellationToken);
        }
        catch (HouseholdNotFoundException)
        {
            return null;
        }

        if (goal.UserProfileId is not null && goal.UserProfileId != userContext.UserProfileId)
        {
            return null;
        }

        return Map(goal, userContext.CurrentDate);
    }

    public async Task<GoalModel> CreateAsync(
        CreateGoalCommand command,
        CancellationToken cancellationToken)
    {
        var access = await householdAccessService.ResolveAsync(
            command.UserContext,
            command.HouseholdId,
            requireWrite: true,
            cancellationToken);

        var name = Normalize(command.Name)
            ?? throw new GoalValidationException("Goal name is required.");
        if (command.TargetAmount <= 0m)
        {
            throw new GoalValidationException("Target amount must be greater than zero.");
        }

        var now = timeProvider.GetUtcNow();
        var goal = new FinancialGoal
        {
            HouseholdId = access.HouseholdId,
            UserProfileId = command.IsShared ? null : command.UserContext.UserProfileId,
            CreatedByUserProfileId = command.UserContext.UserProfileId,
            Name = name,
            GoalType = command.GoalType,
            TargetAmount = command.TargetAmount,
            CurrentAmount = 0m,
            TargetDate = command.TargetDate,
            MonthlyTarget = command.MonthlyTarget,
            Priority = command.Priority,
            Status = FinancialGoalStatus.Active,
            CreatedAt = now,
            UpdatedAt = now
        };

        dbContext.FinancialGoals.Add(goal);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Map(goal, command.UserContext.CurrentDate);
    }

    public async Task<GoalModel?> UpdateAsync(
        AppUserContext userContext,
        Guid goalId,
        UpdateGoalCommand command,
        CancellationToken cancellationToken)
    {
        var goal = await dbContext.FinancialGoals.FirstOrDefaultAsync(
            item => item.Id == goalId,
            cancellationToken);
        if (goal is null || !await CanModifyAsync(userContext, goal, cancellationToken))
        {
            return null;
        }

        if (command.Name is not null)
        {
            goal.Name = Normalize(command.Name)
                ?? throw new GoalValidationException("Goal name is required.");
        }

        if (command.GoalType is not null)
        {
            goal.GoalType = command.GoalType.Value;
        }

        if (command.TargetAmount is not null)
        {
            if (command.TargetAmount <= 0m)
            {
                throw new GoalValidationException("Target amount must be greater than zero.");
            }

            goal.TargetAmount = command.TargetAmount.Value;
        }

        if (command.TargetDate is not null)
        {
            goal.TargetDate = command.TargetDate.Value;
        }

        if (command.MonthlyTarget is not null)
        {
            goal.MonthlyTarget = command.MonthlyTarget.Value;
        }

        if (command.Priority is not null)
        {
            goal.Priority = command.Priority.Value;
        }

        if (command.Status is not null)
        {
            goal.Status = command.Status.Value;
            goal.AchievedAt = command.Status.Value == FinancialGoalStatus.Completed
                ? timeProvider.GetUtcNow()
                : null;
        }

        goal.UpdatedAt = timeProvider.GetUtcNow();
        await dbContext.SaveChangesAsync(cancellationToken);
        return Map(goal, userContext.CurrentDate);
    }

    public async Task<GoalContributionModel?> AddContributionAsync(
        CreateGoalContributionCommand command,
        CancellationToken cancellationToken)
    {
        var goal = await dbContext.FinancialGoals.FirstOrDefaultAsync(
            item => item.Id == command.GoalId,
            cancellationToken);
        if (goal is null || !await CanModifyAsync(command.UserContext, goal, cancellationToken))
        {
            return null;
        }

        if (command.Amount <= 0m)
        {
            throw new GoalValidationException("Contribution amount must be greater than zero.");
        }

        var now = timeProvider.GetUtcNow();
        var contribution = new GoalContribution
        {
            GoalId = goal.Id,
            UserProfileId = command.UserContext.UserProfileId,
            Amount = command.Amount,
            ContributedAt = command.ContributedAt ?? command.UserContext.CurrentDate,
            Source = command.Source,
            TransactionId = command.TransactionId,
            CommitmentId = command.CommitmentId,
            CreatedAt = now
        };

        dbContext.GoalContributions.Add(contribution);
        goal.CurrentAmount += contribution.Amount;
        goal.UpdatedAt = now;
        if (goal.CurrentAmount >= goal.TargetAmount && goal.Status == FinancialGoalStatus.Active)
        {
            goal.Status = FinancialGoalStatus.Completed;
            goal.AchievedAt = now;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return MapContribution(contribution);
    }

    private async Task<bool> CanModifyAsync(
        AppUserContext userContext,
        FinancialGoal goal,
        CancellationToken cancellationToken)
    {
        try
        {
            var access = await householdAccessService.ResolveAsync(
                userContext,
                goal.HouseholdId,
                requireWrite: true,
                cancellationToken);
            if (goal.UserProfileId == userContext.UserProfileId)
            {
                return true;
            }

            return goal.UserProfileId is null
                && access.Role is HouseholdRole.Owner or HouseholdRole.Admin;
        }
        catch (HouseholdNotFoundException)
        {
            return false;
        }
    }

    private static GoalModel Map(FinancialGoal goal, DateOnly currentDate)
    {
        var remaining = Math.Max(0m, goal.TargetAmount - goal.CurrentAmount);
        int? monthsRemaining = goal.TargetDate is null
            ? null
            : Math.Max(
                1,
                ((goal.TargetDate.Value.Year - currentDate.Year) * 12)
                + goal.TargetDate.Value.Month
                - currentDate.Month);
        decimal? requiredMonthly = monthsRemaining is null
            ? null
            : decimal.Round(remaining / monthsRemaining.Value, 2);

        return new GoalModel(
            goal.Id,
            goal.HouseholdId,
            goal.UserProfileId,
            goal.CreatedByUserProfileId,
            goal.Name,
            goal.GoalType,
            goal.TargetAmount,
            goal.CurrentAmount,
            goal.TargetDate,
            goal.MonthlyTarget,
            goal.Priority,
            goal.Status,
            remaining,
            monthsRemaining,
            requiredMonthly,
            null,
            null,
            goal.AchievedAt,
            goal.CreatedAt,
            goal.UpdatedAt);
    }

    private static GoalContributionModel MapContribution(GoalContribution contribution) =>
        new(
            contribution.Id,
            contribution.GoalId,
            contribution.UserProfileId,
            contribution.Amount,
            contribution.ContributedAt,
            contribution.Source,
            contribution.TransactionId,
            contribution.CommitmentId,
            contribution.CreatedAt);

    private static string? Normalize(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }
}
