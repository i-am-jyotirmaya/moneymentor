namespace MoneyMentor.Application.AppUsers;

public sealed record AppUserIdentity(
    string AuthProvider,
    string AuthSubject,
    string? Email,
    string? DisplayName);
