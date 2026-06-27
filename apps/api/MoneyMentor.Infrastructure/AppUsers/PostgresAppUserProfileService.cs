using Microsoft.EntityFrameworkCore;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Persistence;

namespace MoneyMentor.Infrastructure.AppUsers;

internal sealed class PostgresAppUserProfileService(
    MoneyMentorDbContext dbContext) : IAppUserProfileService
{
    private const string DefaultCurrencyCode = "INR";
    private const string DefaultTimeZone = "Asia/Calcutta";

    public async Task<AppUserContext> ResolveAsync(
        AppUserIdentity identity,
        CancellationToken cancellationToken)
    {
        var userProfile = await GetOrCreateUserProfileAsync(identity, cancellationToken);
        var personalHousehold = await GetOrCreatePersonalHouseholdAsync(userProfile, cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);

        return MapContext(userProfile, personalHousehold.Id);
    }

    public async Task<UserSettingsModel> GetSettingsAsync(
        AppUserIdentity identity,
        CancellationToken cancellationToken)
    {
        var context = await ResolveAsync(identity, cancellationToken);

        return new UserSettingsModel(
            context.UserProfileId,
            context.Email,
            context.DisplayName,
            context.CurrencyCode,
            context.TimeZone,
            context.Plan,
            context.RequireMerchantForExpenses,
            context.DefaultTransactionVisibility);
    }

    public async Task<UserSettingsModel> UpdateSettingsAsync(
        AppUserIdentity identity,
        UpdateUserSettingsCommand command,
        CancellationToken cancellationToken)
    {
        var userProfile = await GetOrCreateUserProfileAsync(identity, cancellationToken);
        await GetOrCreatePersonalHouseholdAsync(userProfile, cancellationToken);

        if (!string.IsNullOrWhiteSpace(command.CurrencyCode))
        {
            userProfile.CurrencyCode = command.CurrencyCode.Trim().ToUpperInvariant();
        }

        if (!string.IsNullOrWhiteSpace(command.TimeZone))
        {
            userProfile.TimeZone = command.TimeZone.Trim();
        }

        if (command.Plan is not null)
        {
            userProfile.Plan = command.Plan.Value;
        }

        if (command.RequireMerchantForExpenses is not null)
        {
            userProfile.RequireMerchantForExpenses = command.RequireMerchantForExpenses.Value;
        }

        if (command.DefaultTransactionVisibility is not null)
        {
            userProfile.DefaultTransactionVisibility = command.DefaultTransactionVisibility.Value;
        }

        userProfile.UpdatedAt = DateTimeOffset.UtcNow;

        await dbContext.SaveChangesAsync(cancellationToken);

        return new UserSettingsModel(
            userProfile.Id,
            userProfile.Email,
            userProfile.DisplayName,
            userProfile.CurrencyCode,
            userProfile.TimeZone,
            userProfile.Plan,
            userProfile.RequireMerchantForExpenses,
            userProfile.DefaultTransactionVisibility);
    }

    private async Task<UserProfile> GetOrCreateUserProfileAsync(
        AppUserIdentity identity,
        CancellationToken cancellationToken)
    {
        var authProvider = string.IsNullOrWhiteSpace(identity.AuthProvider)
            ? "local"
            : identity.AuthProvider.Trim();
        var authSubject = identity.AuthSubject.Trim();

        var userProfile = await dbContext.UserProfiles
            .FirstOrDefaultAsync(
                profile => profile.AuthProvider == authProvider
                    && profile.AuthSubject == authSubject,
                cancellationToken);

        if (userProfile is null)
        {
            userProfile = new UserProfile
            {
                AuthProvider = authProvider,
                AuthSubject = authSubject,
                Email = NormalizeEmail(identity.Email, authSubject),
                DisplayName = NormalizeDisplayName(identity.DisplayName, identity.Email),
                CurrencyCode = DefaultCurrencyCode,
                TimeZone = DefaultTimeZone,
                Plan = UserPlan.Free,
                DefaultTransactionVisibility = TransactionVisibility.Private,
                RequireMerchantForExpenses = false,
                IsOnboardingCompleted = true
            };

            dbContext.UserProfiles.Add(userProfile);
            return userProfile;
        }

        var changed = false;
        var email = NormalizeEmail(identity.Email, authSubject);
        var displayName = NormalizeDisplayName(identity.DisplayName, identity.Email);

        if (!string.Equals(userProfile.Email, email, StringComparison.OrdinalIgnoreCase))
        {
            userProfile.Email = email;
            changed = true;
        }

        if (!string.Equals(userProfile.DisplayName, displayName, StringComparison.Ordinal))
        {
            userProfile.DisplayName = displayName;
            changed = true;
        }

        if (string.IsNullOrWhiteSpace(userProfile.CurrencyCode))
        {
            userProfile.CurrencyCode = DefaultCurrencyCode;
            changed = true;
        }

        if (string.IsNullOrWhiteSpace(userProfile.TimeZone))
        {
            userProfile.TimeZone = DefaultTimeZone;
            changed = true;
        }

        if (changed)
        {
            userProfile.UpdatedAt = DateTimeOffset.UtcNow;
        }

        return userProfile;
    }

    private async Task<Household> GetOrCreatePersonalHouseholdAsync(
        UserProfile userProfile,
        CancellationToken cancellationToken)
    {
        var personalHousehold = await dbContext.HouseholdMembers
            .Where(member => member.UserProfileId == userProfile.Id
                && member.Status == HouseholdMemberStatus.Active)
            .Join(
                dbContext.Households,
                member => member.HouseholdId,
                household => household.Id,
                (_, household) => household)
            .FirstOrDefaultAsync(
                household => household.Kind == HouseholdKind.Personal,
                cancellationToken);

        if (personalHousehold is not null)
        {
            return personalHousehold;
        }

        personalHousehold = new Household
        {
            Name = $"{userProfile.DisplayName}'s workspace",
            Kind = HouseholdKind.Personal,
            CreatedByUserProfileId = userProfile.Id
        };

        var member = new HouseholdMember
        {
            HouseholdId = personalHousehold.Id,
            UserProfileId = userProfile.Id,
            Role = HouseholdRole.Owner,
            Status = HouseholdMemberStatus.Active
        };

        dbContext.Households.Add(personalHousehold);
        dbContext.HouseholdMembers.Add(member);

        return personalHousehold;
    }

    private static AppUserContext MapContext(UserProfile userProfile, Guid personalHouseholdId) =>
        new(
            userProfile.Id,
            personalHouseholdId,
            userProfile.Email,
            userProfile.DisplayName,
            userProfile.CurrencyCode,
            userProfile.TimeZone,
            userProfile.Plan,
            userProfile.RequireMerchantForExpenses,
            userProfile.DefaultTransactionVisibility);

    private static string NormalizeEmail(string? email, string authSubject)
    {
        if (!string.IsNullOrWhiteSpace(email))
        {
            return email.Trim().ToLowerInvariant();
        }

        return $"{authSubject}@local.moneymentor";
    }

    private static string NormalizeDisplayName(string? displayName, string? email)
    {
        if (!string.IsNullOrWhiteSpace(displayName))
        {
            return displayName.Trim();
        }

        if (!string.IsNullOrWhiteSpace(email))
        {
            return email.Split('@', StringSplitOptions.RemoveEmptyEntries)[0];
        }

        return "MoneyMentor user";
    }
}
