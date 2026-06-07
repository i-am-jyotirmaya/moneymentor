namespace MoneyMentor.Infrastructure.Auth;

public sealed record AuthRepositoryResult(
    bool Succeeded,
    IReadOnlyCollection<AuthRepositoryError> Errors)
{
    public static AuthRepositoryResult Success() => new(true, []);

    public static AuthRepositoryResult Failure(IEnumerable<AuthRepositoryError> errors) =>
        new(false, errors.ToArray());
}

public sealed record AuthRepositoryResult<T>(
    bool Succeeded,
    T? Value,
    IReadOnlyCollection<AuthRepositoryError> Errors)
{
    public static AuthRepositoryResult<T> Success(T value) => new(true, value, []);

    public static AuthRepositoryResult<T> Failure(IEnumerable<AuthRepositoryError> errors) =>
        new(false, default, errors.ToArray());
}
