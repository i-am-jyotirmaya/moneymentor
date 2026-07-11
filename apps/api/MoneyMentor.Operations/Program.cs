using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure;
using MoneyMentor.Infrastructure.Persistence;

namespace MoneyMentor.Operations;

public static class Program
{
    public static Task<int> Main(string[] args) => OperationsCommand.RunAsync(args);
}

public static class OperationsCommand
{
    public static async Task<int> RunAsync(string[] args, string? connectionString = null)
    {
        if (args.Length == 0)
        {
            WriteUsage();
            return 2;
        }

        try
        {
            var builder = Host.CreateApplicationBuilder();
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
            await using var services = builder.Services.BuildServiceProvider();
            await using var scope = services.CreateAsyncScope();

            return args[0].ToLowerInvariant() switch
            {
                "migrate" => await MigrateAsync(scope.ServiceProvider),
                "entitlement" => await ChangeEntitlementAsync(scope.ServiceProvider, args[1..]),
                _ => UnknownCommand(args[0])
            };
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine($"Operation failed: {exception.Message}");
            return 1;
        }
    }

    private static async Task<int> MigrateAsync(IServiceProvider services)
    {
        var authDbContext = services.GetRequiredService<MoneyMentorAuthDbContext>();
        var appDbContext = services.GetRequiredService<MoneyMentorDbContext>();

        await authDbContext.Database.MigrateAsync();
        await appDbContext.Database.MigrateAsync();
        Console.WriteLine("Auth and application migrations completed.");
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
            Console.WriteLine($"Profile is already on the {newPlan} plan; no change was recorded.");
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
        Console.WriteLine($"Changed entitlement from {previousPlan} to {newPlan} for profile {profile.Id}.");
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
        Console.Error.WriteLine("  MoneyMentor.Operations entitlement grant|revoke --email <email> --operator <name> --reason <reason>");
        Console.Error.WriteLine("Set ConnectionStrings__MoneyMentorDb outside a local source checkout.");
    }
}
