using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.FinancialAccounts;
using MoneyMentor.Application.Households;
using MoneyMentor.Application.Transactions;
namespace MoneyMentor.Api.Endpoints.Transactions;

public static class FinancialEventEndpoints
{
    public static void MapFinancialEventEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var accounts = endpoints.MapGroup("/api/financial-accounts").RequireAuthorization().WithTags("Financial accounts");
        accounts.MapGet("", async (HttpContext http, IAppUserProfileService profiles, IFinancialAccountService service,
            Guid? householdId, CancellationToken ct) => await RunAsync(http, profiles, async user =>
                Results.Ok(await service.ListAsync(user, householdId, ct)), ct));
        accounts.MapPost("", async (SaveFinancialAccountCommand request, HttpContext http, IAppUserProfileService profiles,
            IFinancialAccountService service, CancellationToken ct) => await RunAsync(http, profiles, async user =>
                Results.Ok(await service.SaveAsync(user, null, request, ct)), ct));
        accounts.MapPut("/{id:guid}", async (Guid id, SaveFinancialAccountCommand request, HttpContext http, IAppUserProfileService profiles,
            IFinancialAccountService service, CancellationToken ct) => await RunAsync(http, profiles, async user =>
                Results.Ok(await service.SaveAsync(user, id, request, ct)), ct));
        endpoints.MapPost("/api/transactions", async (TransactionIntent request, HttpContext http, IAppUserProfileService profiles,
            IFinancialEventService service, CancellationToken ct) => await RunAsync(http, profiles, async user =>
                Results.Ok(await service.SaveAsync(user, request, ct)), ct)).RequireAuthorization().WithTags("Transactions");
    }
    private static async Task<IResult> RunAsync(HttpContext http, IAppUserProfileService profiles,
        Func<AppUserContext, Task<IResult>> action, CancellationToken ct)
    {
        var identity = AppUserIdentityFactory.FromPrincipal(http.User);
        if (identity is null) return Results.Unauthorized();
        var user = await profiles.ResolveAsync(identity, ct);
        try { return await action(user); }
        catch (HouseholdNotFoundException) { return Results.NotFound(); }
        catch (HouseholdWriteForbiddenException) { return Results.Forbid(); }
        catch (TransactionMatchRequiredException match)
        {
            return Results.UnprocessableEntity(new { error = match.Message, candidates = match.Candidates });
        }
        catch (FinancialTransactionValidationException error) { return EndpointValidation.ValidationProblem("financialEvent", error.Message); }
    }
}
