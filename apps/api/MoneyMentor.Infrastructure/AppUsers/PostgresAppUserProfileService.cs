using Microsoft.EntityFrameworkCore;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Privacy;
using MoneyMentor.Application.Telemetry;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Persistence;
using Npgsql;

namespace MoneyMentor.Infrastructure.AppUsers;

internal sealed class PostgresAppUserProfileService(
    MoneyMentorDbContext dbContext,
    TimeProvider timeProvider) : IAppUserProfileService
{
    private const string DefaultCurrencyCode = "INR";

    public async Task<AppUserContext> ResolveAsync(
        AppUserIdentity identity,
        CancellationToken cancellationToken)
    {
        var (userProfile, personalHousehold) = await ProvisionAsync(identity, cancellationToken);
        var hasConsent = await dbContext.PrivacyConsents.AsNoTracking().AnyAsync(
            consent => consent.UserProfileId == userProfile.Id
                && consent.PolicyVersion == PrivacyPolicy.CurrentVersion,
            cancellationToken);

        return MapContext(userProfile, personalHousehold.Id) with
        {
            HasCurrentPrivacyConsent = hasConsent
        };
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
        var (userProfile, _) = await ProvisionAsync(identity, cancellationToken);

        if (!string.IsNullOrWhiteSpace(command.CurrencyCode))
        {
            userProfile.CurrencyCode = command.CurrencyCode.Trim().ToUpperInvariant();
        }

        if (!string.IsNullOrWhiteSpace(command.TimeZone))
        {
            if (!UserTimeZone.TryNormalize(command.TimeZone, out var normalizedTimeZone))
            {
                throw new ArgumentException("TimeZone must be a valid IANA time-zone identifier.", nameof(command));
            }

            userProfile.TimeZone = normalizedTimeZone;
        }

        if (command.RequireMerchantForExpenses is not null)
        {
            userProfile.RequireMerchantForExpenses = command.RequireMerchantForExpenses.Value;
        }

        if (command.DefaultTransactionVisibility is not null)
        {
            userProfile.DefaultTransactionVisibility = command.DefaultTransactionVisibility.Value;
        }

        userProfile.UpdatedAt = timeProvider.GetUtcNow();

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

    private async Task<(UserProfile UserProfile, Household PersonalHousehold)> ProvisionAsync(
        AppUserIdentity identity,
        CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < 3; attempt++)
        {
            await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
            try
            {
                var userProfile = await GetOrCreateUserProfileAsync(identity, cancellationToken);
                await dbContext.SaveChangesAsync(cancellationToken);
                var personalHousehold = await GetOrCreatePersonalHouseholdAsync(userProfile, cancellationToken);
                await dbContext.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                return (userProfile, personalHousehold);
            }
            catch (DbUpdateException exception)
                when (exception.InnerException is PostgresException
                {
                    SqlState: PostgresErrorCodes.UniqueViolation
                } && attempt < 2)
            {
                await transaction.RollbackAsync(cancellationToken);
                dbContext.ChangeTracker.Clear();
                MoneyMentorTelemetry.ProvisioningRetries.Add(1);
            }
        }

        throw new InvalidOperationException("User profile provisioning could not be completed.");
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
            var now = timeProvider.GetUtcNow();
            userProfile = new UserProfile
            {
                AuthProvider = authProvider,
                AuthSubject = authSubject,
                Email = NormalizeEmail(identity.Email, authSubject),
                DisplayName = NormalizeDisplayName(identity.DisplayName, identity.Email),
                CurrencyCode = DefaultCurrencyCode,
                TimeZone = UserTimeZone.DefaultId,
                Plan = UserPlan.Free,
                DefaultTransactionVisibility = TransactionVisibility.Private,
                RequireMerchantForExpenses = false,
                IsOnboardingCompleted = true,
                CreatedAt = now,
                UpdatedAt = now
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
            userProfile.TimeZone = UserTimeZone.DefaultId;
            changed = true;
        }
        else if (UserTimeZone.TryNormalize(userProfile.TimeZone, out var normalizedTimeZone)
            && !string.Equals(userProfile.TimeZone, normalizedTimeZone, StringComparison.Ordinal))
        {
            userProfile.TimeZone = normalizedTimeZone;
            changed = true;
        }

        if (changed)
        {
            userProfile.UpdatedAt = timeProvider.GetUtcNow();
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

        var now = timeProvider.GetUtcNow();
        personalHousehold = new Household
        {
            Name = $"{userProfile.DisplayName}'s workspace",
            Kind = HouseholdKind.Personal,
            CurrencyCode = userProfile.CurrencyCode,
            TimeZone = userProfile.TimeZone,
            CreatedByUserProfileId = userProfile.Id,
            CreatedAt = now,
            UpdatedAt = now
        };

        var member = new HouseholdMember
        {
            HouseholdId = personalHousehold.Id,
            UserProfileId = userProfile.Id,
            Role = HouseholdRole.Owner,
            Status = HouseholdMemberStatus.Active,
            JoinedAt = now
        };

        dbContext.Households.Add(personalHousehold);
        dbContext.HouseholdMembers.Add(member);

        return personalHousehold;
    }

    private AppUserContext MapContext(UserProfile userProfile, Guid personalHouseholdId) =>
        new(
            userProfile.Id,
            personalHouseholdId,
            userProfile.Email,
            userProfile.DisplayName,
            userProfile.CurrencyCode,
            userProfile.TimeZone,
            userProfile.Plan,
            userProfile.RequireMerchantForExpenses,
            userProfile.DefaultTransactionVisibility)
        {
            CurrentDate = UserTimeZone.GetCurrentDate(userProfile.TimeZone, timeProvider)
        };

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
