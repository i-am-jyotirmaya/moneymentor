using Microsoft.Extensions.Logging;
using MoneyMentor.Infrastructure.Logging;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Application.Registration;
using System.Text.Json;
using MoneyMentor.Infrastructure;
using MoneyMentor.Infrastructure.Persistence;

namespace MoneyMentor.Operations;

public static class Program
{
    public static Task<int> Main(string[] args) => OperationsCommand.RunAsync(args);
}

public static class OperationsCommand
{
    public static async Task<int> RunAsync(string[] args, string? connectionString = null,
        Action<IServiceCollection>? configureServices = null)
    {
        if (args.Length == 0)
        {
            WriteUsage();
            return 2;
        }

        try
        {
            var builder = Host.CreateApplicationBuilder();
            builder.Logging.AddCloudWatchConsole();
            if (!string.IsNullOrWhiteSpace(connectionString))
            {
                builder.Configuration[$"ConnectionStrings:{DependencyInjection.ConnectionStringName}"] =
                    connectionString;
            }
            else
            {
                LoadLocalDevelopmentConnectionString(builder.Configuration);
            }

            builder.Services.AddInfrastructure(builder.Configuration);
            configureServices?.Invoke(builder.Services);
            await using var services = builder.Services.BuildServiceProvider();
            await using var scope = services.CreateAsyncScope();

            var logger = services.GetRequiredService<ILoggerFactory>().CreateLogger("MoneyMentor.Operations");
            using var runScope = logger.BeginJobRun($"Operations.{args[0].ToLowerInvariant()}");
            try
            {
                return args[0].ToLowerInvariant() switch
                {
                    "migrate" => await MigrateAsync(scope.ServiceProvider),
                    "email-smoke-test" => await RunEmailSmokeTestAsync(scope.ServiceProvider, args[1..]),
                    "entitlement" => await ChangeEntitlementAsync(scope.ServiceProvider, args[1..]),
                    "access-requests" => await ManageAccessRequestsAsync(scope.ServiceProvider, args[1..]),
                    _ => UnknownCommand(args[0])
                };
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "Operation failed.");
                return 1;
            }
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine($"Operation failed: {exception.Message}");
            return 1;
        }
    }

    private static Task<int> RunEmailSmokeTestAsync(IServiceProvider services, string[] args)
    {
        var options = ParseOptions(args);
        if (!Guid.TryParse(Required(options, "delivery-id"), out var deliveryId) || deliveryId == Guid.Empty)
            throw new ArgumentException("--delivery-id must be a non-empty GUID; reuse it for retries.");
        return EmailSmokeTest.RunAsync(
            services.GetRequiredService<MoneyMentor.Application.Households.ITransactionalEmailSender>(),
            GetLogger(services), deliveryId, CancellationToken.None);
    }

    private static ILogger GetLogger(IServiceProvider services) =>
        services.GetRequiredService<ILoggerFactory>().CreateLogger("MoneyMentor.Operations");

    private static async Task<int> ManageAccessRequestsAsync(IServiceProvider services, string[] args)
    {
        if (args.Length == 0) { WriteUsage(); return 2; }
        var options = ParseOptions(args[1..]);
        var service = services.GetRequiredService<IMvpAccessService>();
        if (args[0] == "list")
        {
            var requests = await service.ListAsync(options.GetValueOrDefault("status", "pending"), CancellationToken.None);
            Console.WriteLine(JsonSerializer.Serialize(requests, new JsonSerializerOptions { WriteIndented = true }));
            return 0;
        }
        if (!Guid.TryParse(Required(options, "id"), out var id))
            throw new ArgumentException("--id must be a request GUID.");
        await service.ReviewAsync(id, args[0], Required(options, "operator"), CancellationToken.None);
        GetLogger(services).LogInformation("Access request {AccessRequestId} action {Action} completed.", id, args[0]);
        return 0;
    }

    private static async Task<int> MigrateAsync(IServiceProvider services)
    {
        var authDbContext = services.GetRequiredService<MoneyMentorAuthDbContext>();
        var appDbContext = services.GetRequiredService<MoneyMentorDbContext>();

        await authDbContext.Database.MigrateAsync();
        await appDbContext.Database.MigrateAsync();
        GetLogger(services).LogInformation("Auth and application migrations completed.");
        return 0;
    }

    private static async Task<int> ChangeEntitlementAsync(
        IServiceProvider services,
        string[] args)
    {
        if (args.Length == 0 || (args[0] != "grant" && args[0] != "revoke"))
        {
            WriteUsage();
            return 2;
        }

        var options = ParseOptions(args[1..]);
        var email = Required(options, "email").Trim().ToLowerInvariant();
        var operatorName = Required(options, "operator").Trim();
        var reason = Required(options, "reason").Trim();
        var newPlan = args[0] == "grant" ? UserPlan.Premium : UserPlan.Free;

        var dbContext = services.GetRequiredService<MoneyMentorDbContext>();
        var timeProvider = services.GetRequiredService<TimeProvider>();
        await using var transaction = await dbContext.Database.BeginTransactionAsync();

        var profile = await dbContext.UserProfiles.SingleOrDefaultAsync(
            candidate => candidate.Email.ToLower() == email);

        if (profile is null)
        {
            throw new InvalidOperationException("No application profile exists for that email address.");
        }

        if (profile.Plan == newPlan)
        {
            GetLogger(services).LogInformation("Profile is already on the {Plan} plan; no change was recorded.", newPlan);
            await transaction.RollbackAsync();
            return 0;
        }

        var previousPlan = profile.Plan;
        profile.Plan = newPlan;
        profile.UpdatedAt = timeProvider.GetUtcNow();
        dbContext.EntitlementChanges.Add(new EntitlementChange
        {
            Id = Guid.NewGuid(),
            UserProfileId = profile.Id,
            PreviousPlan = previousPlan,
            NewPlan = newPlan,
            Operator = operatorName,
            Reason = reason,
            ChangedAt = timeProvider.GetUtcNow()
        });

        await dbContext.SaveChangesAsync();
        await transaction.CommitAsync();
        GetLogger(services).LogInformation("Changed entitlement from {PreviousPlan} to {NewPlan} for profile {ProfileId}.", previousPlan, newPlan, profile.Id);
        return 0;
    }

    private static Dictionary<string, string> ParseOptions(string[] args)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        for (var index = 0; index < args.Length; index += 2)
        {
            if (!args[index].StartsWith("--", StringComparison.Ordinal) || index + 1 >= args.Length)
            {
                throw new ArgumentException("Options must use --name value pairs.");
            }

            result[args[index][2..]] = args[index + 1];
        }

        return result;
    }

    private static string Required(IReadOnlyDictionary<string, string> options, string name) =>
        options.TryGetValue(name, out var value) && !string.IsNullOrWhiteSpace(value)
            ? value
            : throw new ArgumentException($"--{name} is required.");

    private static void LoadLocalDevelopmentConnectionString(
        ConfigurationManager configuration)
    {
        if (!string.IsNullOrWhiteSpace(
                configuration.GetConnectionString(DependencyInjection.ConnectionStringName)))
        {
            return;
        }

        var candidates = new[]
        {
            Path.Combine(
                Directory.GetCurrentDirectory(),
                "apps",
                "api",
                "MoneyMentor.Api",
                "appsettings.Development.json"),
            Path.Combine(
                Directory.GetCurrentDirectory(),
                "..",
                "MoneyMentor.Api",
                "appsettings.Development.json"),
            Path.Combine(
                AppContext.BaseDirectory,
                "..",
                "..",
                "..",
                "..",
                "MoneyMentor.Api",
                "appsettings.Development.json")
        };

        var settingsPath = candidates
            .Select(Path.GetFullPath)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .FirstOrDefault(File.Exists);
        if (settingsPath is null)
        {
            return;
        }

        var localConfiguration = new ConfigurationBuilder()
            .AddJsonFile(settingsPath, optional: false, reloadOnChange: false)
            .Build();
        var localConnectionString = localConfiguration.GetConnectionString(
            DependencyInjection.ConnectionStringName);
        if (string.IsNullOrWhiteSpace(localConnectionString))
        {
            return;
        }

        configuration[$"ConnectionStrings:{DependencyInjection.ConnectionStringName}"] =
            localConnectionString;
        Console.WriteLine(
            $"Using local development database configuration from {settingsPath}.");
    }

    private static int UnknownCommand(string command)
    {
        Console.Error.WriteLine($"Unknown command '{command}'.");
        WriteUsage();
        return 2;
    }

    private static void WriteUsage()
    {
        Console.Error.WriteLine("Usage:");
        Console.Error.WriteLine("  MoneyMentor.Operations migrate");
        Console.Error.WriteLine("  MoneyMentor.Operations email-smoke-test --delivery-id <guid>");
        Console.Error.WriteLine("  MoneyMentor.Operations access-requests list [--status pending|approved|rejected|registered|all]");
        Console.Error.WriteLine("  MoneyMentor.Operations access-requests approve|reject|resend --id <request-id> --operator <name>");
        Console.Error.WriteLine("  MoneyMentor.Operations entitlement grant|revoke --email <email> --operator <name> --reason <reason>");
        Console.Error.WriteLine("Set ConnectionStrings__MoneyMentorDb outside a local source checkout.");
    }

}
