using System.ComponentModel.DataAnnotations;

namespace MoneyMentor.Api.Endpoints;

internal static class EndpointValidation
{
    public static IResult? Validate<TRequest>(TRequest request)
        where TRequest : notnull
    {
        var validationContext = new ValidationContext(request);
        var validationResults = new List<ValidationResult>();

        if (Validator.TryValidateObject(
            request,
            validationContext,
            validationResults,
            validateAllProperties: true))
        {
            return null;
        }

        return Results.ValidationProblem(ToValidationProblem(validationResults));
    }

    public static IResult ValidationProblem(
        string propertyName,
        string errorMessage) =>
        Results.ValidationProblem(
            new Dictionary<string, string[]>
            {
                [propertyName] = [errorMessage]
            });

    private static Dictionary<string, string[]> ToValidationProblem(
        IEnumerable<ValidationResult> validationResults) =>
        validationResults
            .SelectMany(result =>
            {
                var memberNames = result.MemberNames.Any()
                    ? result.MemberNames
                    : ["request"];

                return memberNames.Select(memberName => new
                {
                    MemberName = memberName,
                    Error = result.ErrorMessage ?? "The request is invalid."
                });
            })
            .GroupBy(item => item.MemberName)
            .ToDictionary(
                group => group.Key,
                group => group.Select(item => item.Error).Distinct().ToArray());
}
