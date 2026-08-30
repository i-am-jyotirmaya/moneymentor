using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Application.JudgementReports;
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
                "judgement-reports" => await ManageJudgementReportsAsync(scope.ServiceProvider, args[1..]),
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

    private static async Task<int> ManageJudgementReportsAsync(
        IServiceProvider services,
        string[] args)
    {
        if (args.Length == 0 || !string.Equals(args[0], "backfill", StringComparison.OrdinalIgnoreCase))
        {
            WriteUsage();
            return 2;
        }

        var options = ParseOptions(args[1..]);
        var dryRun = !options.TryGetValue("dry-run", out var dryRunValue)
            || !bool.TryParse(dryRunValue, out var parsedDryRun)
            || parsedDryRun;
        var dbContext = services.GetRequiredService<MoneyMentorDbContext>();
        var timeProvider = services.GetRequiredService<TimeProvider>();
        var now = timeProvider.GetUtcNow();
        var memberships = await dbContext.HouseholdMembers.AsNoTracking()
            .Where(member => member.Status == HouseholdMemberStatus.Active)
            .Join(
                dbContext.Households.AsNoTracking(),
                member => member.HouseholdId,
                household => household.Id,
                (member, household) => new { Member = member, Household = household })
            .ToArrayAsync();
        var desired = new Dictionary<BackfillKey, JudgementWorkItem>();

        foreach (var row in memberships)
        {
            AddBackfillWindows(desired, row.Household, row.Member.UserProfileId, JudgementReportScope.Personal, now);
            if (row.Household.Kind == HouseholdKind.Family)
            {
                AddBackfillWindows(desired, row.Household, null, JudgementReportScope.Household, now);
            }
        }

        Console.WriteLine($"Judgement report backfill would enqueue {desired.Count} calculation window(s). Dry run: {dryRun}.");
        if (dryRun)
        {
            return 0;
        }

        foreach (var pair in desired.OrderBy(item => item.Key.PeriodStart))
        {
            var key = pair.Key;
            var existing = await dbContext.JudgementWorkItems.FirstOrDefaultAsync(item =>
                item.HouseholdId == key.HouseholdId
                && item.UserProfileId == key.UserProfileId
                && item.Scope == key.Scope
                && item.Cadence == key.Cadence
                && item.PeriodStart == key.PeriodStart
                && item.Stage == JudgementWorkStage.Calculation);
            if (existing is null)
            {
                dbContext.JudgementWorkItems.Add(pair.Value);
            }
            else
            {
                existing.RequestedGeneration++;
                if (existing.Status != JudgementWorkStatus.Processing)
                {
                    existing.Status = JudgementWorkStatus.Pending;
                    existing.AvailableAt = now;
                    existing.AttemptCount = 0;
                    existing.DeadLetteredAt = null;
                    existing.FailureCategory = null;
                    existing.LastError = null;
                }
                existing.UpdatedAt = now;
            }
        }
        await dbContext.SaveChangesAsync();
        Console.WriteLine("Judgement report backfill calculations were queued oldest-first.");
        return 0;
    }

    private static void AddBackfillWindows(
        IDictionary<BackfillKey, JudgementWorkItem> desired,
        Household household,
        Guid? userProfileId,
        JudgementReportScope scope,
        DateTimeOffset now)
    {
        AddCadence(JudgementReportCadence.Weekly, 8);
        AddCadence(JudgementReportCadence.Monthly, 6);
        return;

        void AddCadence(JudgementReportCadence cadence, int count)
        {
            var period = ReportingPeriodCalculator.GetLastCompletedPeriod(cadence, now, household.TimeZone);
            var periods = new List<ReportingPeriod>(count);
            for (var index = 0; index < count; index++)
            {
                periods.Add(period);
                period = ReportingPeriodCalculator.Previous(period);
            }
            foreach (var item in periods.OrderBy(value => value.StartDate))
            {
                var key = new BackfillKey(household.Id, userProfileId, scope, cadence, item.StartDate);
                desired.TryAdd(key, new JudgementWorkItem
                {
                    HouseholdId = household.Id,
                    UserProfileId = userProfileId,
                    Scope = scope,
                    Cadence = cadence,
                    Stage = JudgementWorkStage.Calculation,
                    PeriodStart = item.StartDate,
                    PeriodEndExclusive = item.EndDateExclusive,
                    TimeZone = item.TimeZone,
                    CurrencyCode = household.CurrencyCode,
                    Status = JudgementWorkStatus.Pending,
                    RequestedGeneration = 1,
                    AvailableAt = item.EndInstant,
                    MaxAttempts = 4,
                    CreatedAt = now,
                    UpdatedAt = now
                });
            }
        }
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
        Console.Error.WriteLine("  MoneyMentor.Operations judgement-reports backfill [--dry-run true|false]");
        Console.Error.WriteLine("Set ConnectionStrings__MoneyMentorDb outside a local source checkout.");
    }

    private sealed record BackfillKey(
        Guid HouseholdId,
        Guid? UserProfileId,
        JudgementReportScope Scope,
        JudgementReportCadence Cadence,
        DateOnly PeriodStart);
}
