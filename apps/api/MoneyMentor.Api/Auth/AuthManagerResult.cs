namespace MoneyMentor.Api.Auth;

public enum AuthFailureKind
{
    None,
    Validation,
    Conflict,
    InvalidCredentials,
    Unauthorized,
    NotFound
}

public sealed record AuthManagerResult(
    bool Succeeded,
    AuthFailureKind FailureKind,
    IReadOnlyCollection<string> Errors)
{
    public static AuthManagerResult Success() =>
        new(true, AuthFailureKind.None, []);

    public static AuthManagerResult Failure(
        AuthFailureKind failureKind,
        IEnumerable<string> errors) =>
        new(false, failureKind, errors.ToArray());
}

public sealed record AuthManagerResult<T>(
    bool Succeeded,
    T? Value,
    AuthFailureKind FailureKind,
    IReadOnlyCollection<string> Errors)
{
    public static AuthManagerResult<T> Success(T value) =>
        new(true, value, AuthFailureKind.None, []);

    public static AuthManagerResult<T> Failure(
        AuthFailureKind failureKind,
        IEnumerable<string> errors) =>
        new(false, default, failureKind, errors.ToArray());
}
