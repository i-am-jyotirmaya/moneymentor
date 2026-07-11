using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Households;
using MoneyMentor.Application.Privacy;
using MoneyMentor.Application.Transactions;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Auth;
using MoneyMentor.Infrastructure.Persistence;
using Npgsql;

namespace MoneyMentor.Infrastructure.Privacy;

internal sealed class PostgresPrivacyService(
    MoneyMentorDbContext dbContext,
    IAuthRepository authRepository,
    IConfiguration configuration,
    TimeProvider timeProvider) : IPrivacyService
{
    public async Task<PrivacyConsentModel> AcceptAsync(
        AppUserContext userContext,
        string policyVersion,
        CancellationToken cancellationToken)
    {
        if (!string.Equals(policyVersion, PrivacyPolicy.CurrentVersion, StringComparison.Ordinal))
        {
            throw new ArgumentException("The privacy policy version is not current.", nameof(policyVersion));
        }

        var existing = await dbContext.PrivacyConsents.FirstOrDefaultAsync(
            consent => consent.UserProfileId == userContext.UserProfileId
                && consent.PolicyVersion == policyVersion,
            cancellationToken);
        if (existing is not null)
        {
            return new PrivacyConsentModel(existing.PolicyVersion, existing.AcceptedAt);
        }

        var consent = new PrivacyConsent
        {
            UserProfileId = userContext.UserProfileId,
            PolicyVersion = policyVersion,
            AcceptedAt = timeProvider.GetUtcNow()
        };
        dbContext.PrivacyConsents.Add(consent);
        await dbContext.SaveChangesAsync(cancellationToken);
        return new PrivacyConsentModel(consent.PolicyVersion, consent.AcceptedAt);
    }

    public async Task<PrivacyExportModel> ExportAsync(
        AppUserContext userContext,
        CancellationToken cancellationToken)
    {
        var settings = new UserSettingsModel(
            userContext.UserProfileId,
            userContext.Email,
            userContext.DisplayName,
            userContext.CurrencyCode,
            userContext.TimeZone,
            userContext.Plan,
            userContext.RequireMerchantForExpenses,
            userContext.DefaultTransactionVisibility);
        var consents = await dbContext.PrivacyConsents.AsNoTracking()
            .Where(consent => consent.UserProfileId == userContext.UserProfileId)
            .OrderBy(consent => consent.AcceptedAt)
            .Select(consent => new PrivacyConsentModel(consent.PolicyVersion, consent.AcceptedAt))
            .ToArrayAsync(cancellationToken);

        var householdRows = await dbContext.HouseholdMembers.AsNoTracking()
            .Where(member => member.UserProfileId == userContext.UserProfileId)
            .Join(
                dbContext.Households,
                member => member.HouseholdId,
                household => household.Id,
                (member, household) => new { Member = member, Household = household })
            .ToArrayAsync(cancellationToken);
        var householdIds = householdRows.Select(row => row.Household.Id).ToArray();
        var memberCounts = await dbContext.HouseholdMembers.AsNoTracking()
            .Where(member => householdIds.Contains(member.HouseholdId)
                && member.Status == HouseholdMemberStatus.Active)
            .GroupBy(member => member.HouseholdId)
            .ToDictionaryAsync(group => group.Key, group => group.Count(), cancellationToken);
        var households = householdRows.Select(row => new HouseholdSummaryModel(
            row.Household.Id,
            row.Household.Name,
            row.Household.Kind,
            row.Member.Role,
            row.Member.Status,
            row.Member.Role != HouseholdRole.Viewer,
            memberCounts.GetValueOrDefault(row.Household.Id),
            row.Household.CreatedAt)).ToArray();

        var invitations = await dbContext.HouseholdInvitations.AsNoTracking()
            .Where(invitation => invitation.InvitedByUserProfileId == userContext.UserProfileId
                || invitation.Email == userContext.Email.ToLower())
            .Join(
                dbContext.Households,
                invitation => invitation.HouseholdId,
                household => household.Id,
                (invitation, household) => new { Invitation = invitation, Household = household })
            .Join(
                dbContext.UserProfiles,
                row => row.Invitation.InvitedByUserProfileId,
                profile => profile.Id,
                (row, profile) => new HouseholdInvitationModel(
                    row.Invitation.Id,
                    row.Invitation.HouseholdId,
                    row.Household.Name,
                    row.Invitation.Email,
                    row.Invitation.Role,
                    row.Invitation.Status,
                    profile.DisplayName,
                    row.Invitation.CreatedAt,
                    row.Invitation.ExpiresAt,
                    row.Invitation.RespondedAt,
                    row.Invitation.DeliveryStatus,
                    row.Invitation.DeliveryAttemptCount,
                    row.Invitation.SentAt,
                    row.Invitation.LastDeliveryError))
            .ToArrayAsync(cancellationToken);

        var transactionRows = await dbContext.Transactions.AsNoTracking()
            .Where(transaction => transaction.UserProfileId == userContext.UserProfileId)
            .OrderBy(transaction => transaction.TransactionDate)
            .ToArrayAsync(cancellationToken);
        var categoryIds = transactionRows.Select(row => row.CategoryId).OfType<Guid>().Distinct().ToArray();
        var categories = await dbContext.Categories.AsNoTracking()
            .Where(category => categoryIds.Contains(category.Id))
            .ToDictionaryAsync(category => category.Id, category => category.Name, cancellationToken);
        var transactions = transactionRows.Select(transaction => new TransactionModel(
            transaction.Id,
            transaction.HouseholdId,
            transaction.UserProfileId,
            transaction.Amount,
            userContext.CurrencyCode,
            transaction.Type,
            transaction.CategoryId is null ? null : categories.GetValueOrDefault(transaction.CategoryId.Value),
            transaction.Type == TransactionType.Income ? null : transaction.MerchantName,
            transaction.Type == TransactionType.Income ? null : transaction.Description,
            transaction.SourceText,
            transaction.TransactionDate,
            transaction.InputMode,
            transaction.Confidence,
            transaction.Visibility,
            transaction.CreatedAt,
            transaction.UpdatedAt,
            null)
        {
            SenderName = transaction.Type == TransactionType.Income ? transaction.MerchantName : null,
            Reason = transaction.Type == TransactionType.Income ? transaction.Description : null,
            DeletedAt = transaction.DeletedAt,
            PurgeAfter = transaction.PurgeAfter
        }).ToArray();

        var goals = await dbContext.FinancialGoals.AsNoTracking()
            .Where(goal => goal.UserProfileId == userContext.UserProfileId)
            .OrderBy(goal => goal.CreatedAt)
            .Select(goal => new PrivacyFinancialGoalModel(
                goal.Id,
                goal.HouseholdId,
                goal.Name,
                goal.TargetAmount,
                goal.CurrentAmount,
                goal.TargetDate,
                goal.Priority,
                goal.Status,
                goal.CreatedAt,
                goal.UpdatedAt))
            .ToArrayAsync(cancellationToken);
        var insights = await dbContext.Insights.AsNoTracking()
            .Where(insight => insight.UserProfileId == userContext.UserProfileId)
            .OrderBy(insight => insight.CreatedAt)
            .Select(insight => new PrivacyInsightModel(
                insight.Id,
                insight.HouseholdId,
                insight.Type,
                insight.Title,
                insight.Summary,
                insight.Severity,
                insight.Judgment,
                insight.Recommendation,
                insight.DataJson,
                insight.Status,
                insight.CreatedAt))
            .ToArrayAsync(cancellationToken);
        var assistantSessions = await dbContext.AssistantSessions.AsNoTracking()
            .Where(session => session.UserProfileId == userContext.UserProfileId)
            .OrderBy(session => session.CreatedAt)
            .ToArrayAsync(cancellationToken);
        var assistantSessionIds = assistantSessions.Select(session => session.Id).ToArray();
        var assistantMessages = await dbContext.AssistantMessages.AsNoTracking()
            .Where(message => assistantSessionIds.Contains(message.SessionId))
            .OrderBy(message => message.CreatedAt)
            .ToArrayAsync(cancellationToken);
        var sessionModels = assistantSessions.Select(session => new PrivacyAssistantSessionModel(
            session.Id,
            session.HouseholdId,
            session.CreatedAt,
            session.LastMessageAt,
            assistantMessages
                .Where(message => message.SessionId == session.Id)
                .Select(message => new PrivacyAssistantMessageModel(
                    message.Id,
                    message.Role,
                    message.Content,
                    message.Intent,
                    message.ParsedDataJson,
                    message.CreatedAt))
                .ToArray()))
            .ToArray();
        var pendingActions = await dbContext.PendingActions.AsNoTracking()
            .Where(action => action.UserProfileId == userContext.UserProfileId)
            .OrderBy(action => action.CreatedAt)
            .Select(action => new PrivacyPendingActionModel(
                action.Id,
                action.HouseholdId,
                action.ActionType,
                action.PayloadJson,
                action.MissingFieldsJson,
                action.ExpiresAt,
                action.CreatedAt))
            .ToArrayAsync(cancellationToken);
        var entitlementChanges = await dbContext.EntitlementChanges.AsNoTracking()
            .Where(change => change.UserProfileId == userContext.UserProfileId)
            .OrderBy(change => change.ChangedAt)
            .Select(change => new PrivacyEntitlementChangeModel(
                change.PreviousPlan,
                change.NewPlan,
                change.Operator,
                change.Reason,
                change.ChangedAt))
            .ToArrayAsync(cancellationToken);

        return new PrivacyExportModel(
            1,
            timeProvider.GetUtcNow(),
            settings,
            consents,
            households,
            invitations,
            transactions,
            new PrivacyOwnedRecordsModel(
                goals,
                insights,
                sessionModels,
                pendingActions,
                entitlementChanges));
    }

    public async Task<bool> DeleteAccountAsync(
        AppUserIdentity identity,
        string password,
        CancellationToken cancellationToken)
    {
        var authUser = await authRepository.FindUserByIdAsync(
            Guid.Parse(identity.AuthSubject),
            cancellationToken);
        if (authUser is null
            || !await authRepository.CheckPasswordAsync(authUser, password, cancellationToken))
        {
            return false;
        }

        var connectionString = configuration.GetConnectionString(DependencyInjection.ConnectionStringName)
            ?? throw new InvalidOperationException("The MoneyMentor database is not configured.");
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        var appOptions = new DbContextOptionsBuilder<MoneyMentorDbContext>()
            .UseNpgsql(connection)
            .Options;
        var authOptions = new DbContextOptionsBuilder<MoneyMentorAuthDbContext>()
            .UseNpgsql(connection)
            .Options;
        await using var appDb = new MoneyMentorDbContext(appOptions);
        await using var authDb = new MoneyMentorAuthDbContext(authOptions);
        await appDb.Database.UseTransactionAsync(transaction, cancellationToken);
        await authDb.Database.UseTransactionAsync(transaction, cancellationToken);

        var profile = await appDb.UserProfiles.FirstOrDefaultAsync(
            item => item.AuthProvider == identity.AuthProvider
                && item.AuthSubject == identity.AuthSubject,
            cancellationToken);
        if (profile is not null)
        {
            await DeleteApplicationDataAsync(appDb, profile, cancellationToken);
            await appDb.SaveChangesAsync(cancellationToken);
        }

        var user = await authDb.Users.FirstOrDefaultAsync(item => item.Id == authUser.Id, cancellationToken);
        if (user is not null)
        {
            authDb.Users.Remove(user);
            await authDb.SaveChangesAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);
        return true;
    }

    private static async Task DeleteApplicationDataAsync(
        MoneyMentorDbContext appDb,
        UserProfile profile,
        CancellationToken cancellationToken)
    {
        var personalHouseholdIds = await appDb.Households
            .Where(household => household.Kind == HouseholdKind.Personal
                && household.CreatedByUserProfileId == profile.Id)
            .Select(household => household.Id)
            .ToArrayAsync(cancellationToken);
        var familyMembershipIds = await appDb.HouseholdMembers
            .Where(member => member.UserProfileId == profile.Id
                && !personalHouseholdIds.Contains(member.HouseholdId))
            .Select(member => member.HouseholdId)
            .ToArrayAsync(cancellationToken);

        var ownedFamilies = await appDb.Households
            .Where(household => household.Kind == HouseholdKind.Family
                && household.CreatedByUserProfileId == profile.Id)
            .ToArrayAsync(cancellationToken);
        foreach (var household in ownedFamilies)
        {
            var successor = await appDb.HouseholdMembers
                .Where(member => member.HouseholdId == household.Id
                    && member.UserProfileId != profile.Id
                    && member.Status == HouseholdMemberStatus.Active
                    && (member.Role == HouseholdRole.Admin || member.Role == HouseholdRole.Member))
                .OrderBy(member => member.Role == HouseholdRole.Admin ? 0 : 1)
                .ThenBy(member => member.JoinedAt)
                .FirstOrDefaultAsync(cancellationToken);
            if (successor is null)
            {
                appDb.Households.Remove(household);
                continue;
            }

            successor.Role = HouseholdRole.Owner;
            household.CreatedByUserProfileId = successor.UserProfileId;
        }

        var sharedTransactions = await appDb.Transactions
            .Where(item => item.UserProfileId == profile.Id
                && familyMembershipIds.Contains(item.HouseholdId)
                && item.Visibility == TransactionVisibility.Household)
            .ToArrayAsync(cancellationToken);
        foreach (var item in sharedTransactions)
        {
            item.UserProfileId = null;
            item.UpdatedByUserProfileId = null;
            item.DeletedByUserProfileId = null;
            item.SourceText = string.Empty;
            item.MerchantName = null;
            item.Description = null;
        }

        var privateTransactions = await appDb.Transactions
            .Where(item => item.UserProfileId == profile.Id
                && (!familyMembershipIds.Contains(item.HouseholdId)
                    || item.Visibility != TransactionVisibility.Household))
            .ToArrayAsync(cancellationToken);
        appDb.Transactions.RemoveRange(privateTransactions);
        var editedAudit = await appDb.TransactionAuditEntries
            .Where(entry => entry.EditedByUserProfileId == profile.Id)
            .ToArrayAsync(cancellationToken);
        appDb.TransactionAuditEntries.RemoveRange(editedAudit);
        var invitations = await appDb.HouseholdInvitations
            .Where(invitation => invitation.InvitedByUserProfileId == profile.Id
                || invitation.RespondedByUserProfileId == profile.Id
                || invitation.Email == profile.Email.ToLower())
            .ToArrayAsync(cancellationToken);
        appDb.HouseholdInvitations.RemoveRange(invitations);
        var memberships = await appDb.HouseholdMembers
            .Where(member => member.UserProfileId == profile.Id)
            .ToArrayAsync(cancellationToken);
        appDb.HouseholdMembers.RemoveRange(memberships);
        var personalHouseholds = await appDb.Households
            .Where(household => personalHouseholdIds.Contains(household.Id))
            .ToArrayAsync(cancellationToken);
        appDb.Households.RemoveRange(personalHouseholds);
        var sessions = await appDb.AssistantSessions
            .Where(session => session.UserProfileId == profile.Id)
            .ToArrayAsync(cancellationToken);
        appDb.AssistantSessions.RemoveRange(sessions);
        var pendingActions = await appDb.PendingActions
            .Where(action => action.UserProfileId == profile.Id)
            .ToArrayAsync(cancellationToken);
        appDb.PendingActions.RemoveRange(pendingActions);
        var goals = await appDb.FinancialGoals
            .Where(goal => goal.UserProfileId == profile.Id)
            .ToArrayAsync(cancellationToken);
        appDb.FinancialGoals.RemoveRange(goals);
        var insights = await appDb.Insights
            .Where(insight => insight.UserProfileId == profile.Id)
            .ToArrayAsync(cancellationToken);
        appDb.Insights.RemoveRange(insights);
        appDb.UserProfiles.Remove(profile);
    }
}
