namespace MoneyMentor.Application.AppUsers;

public interface IAppUserProfileService
{
    Task<AppUserContext> ResolveAsync(
        AppUserIdentity identity,
        CancellationToken cancellationToken);

    Task<UserSettingsModel> GetSettingsAsync(
        AppUserIdentity identity,
        CancellationToken cancellationToken);

    Task<UserSettingsModel> UpdateSettingsAsync(
        AppUserIdentity identity,
        UpdateUserSettingsCommand command,
        CancellationToken cancellationToken);
}
