using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Categories;
using MoneyMentor.Application.Commitments;
using MoneyMentor.Application.Dashboard;
using MoneyMentor.Application.Goals;
using MoneyMentor.Application.Households;
using MoneyMentor.Application.Judgements;
using MoneyMentor.Application.JudgementReports;
using MoneyMentor.Application.Transactions;
using MoneyMentor.Infrastructure.AppUsers;
using MoneyMentor.Infrastructure.Auth;
using MoneyMentor.Infrastructure.Categories;
using MoneyMentor.Infrastructure.Commitments;
using MoneyMentor.Infrastructure.Dashboard;
using MoneyMentor.Infrastructure.Goals;
using MoneyMentor.Infrastructure.Households;
using MoneyMentor.Infrastructure.Identity;
using MoneyMentor.Infrastructure.Judgements;
using MoneyMentor.Infrastructure.JudgementReports;
using MoneyMentor.Infrastructure.Persistence;
using MoneyMentor.Application.Privacy;
using MoneyMentor.Infrastructure.Privacy;
using MoneyMentor.Infrastructure.Transactions;
using MoneyMentor.Infrastructure.Email;
using MoneyMentor.Application.Registration;
using MoneyMentor.Infrastructure.Aws;

namespace MoneyMentor.Infrastructure;

public static class DependencyInjection
{
    public const string ConnectionStringName = "MoneyMentorDb";

    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.AddAwsIntegration(configuration);
        services.TryAddSingleton(TimeProvider.System);
        services.AddOptions<RegistrationOptions>()
            .Bind(configuration.GetSection(RegistrationOptions.SectionName))
            .Validate(options => options.Mode is "RequestOnly" or "Open", "Registration:Mode must be RequestOnly or Open.")
            .ValidateOnStart();
        services.AddScoped<IMvpAccessService, PostgresMvpAccessService>();

        var connectionString = configuration.GetConnectionString(ConnectionStringName);

        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException(
                $"Connection string '{ConnectionStringName}' is not configured.");
        }

        services.AddDbContext<MoneyMentorAuthDbContext>(options =>
            options.UseNpgsql(
                connectionString,
                npgsqlOptions => npgsqlOptions.MigrationsAssembly(typeof(MoneyMentorAuthDbContext).Assembly.FullName)));

        services.AddDbContext<MoneyMentorDbContext>(options =>
            options.UseNpgsql(
                connectionString,
                npgsqlOptions => npgsqlOptions.MigrationsAssembly(typeof(MoneyMentorDbContext).Assembly.FullName)));

        services
            .AddIdentityCore<ApplicationUser>(ConfigureIdentityOptions)
            .AddRoles<ApplicationRole>()
            .AddEntityFrameworkStores<MoneyMentorAuthDbContext>();

        services.AddScoped<IAuthRepository, PostgresAuthRepository>();
        services.AddScoped<IAppUserProfileService, PostgresAppUserProfileService>();
        services.AddScoped<ITransactionService, PostgresTransactionService>();
        services.AddScoped<MerchantResolver>();
        services.AddOptions<JevOptions>()
            .Bind(configuration.GetSection(JevOptions.SectionName))
            .PostConfigure(options => options.ApiKey = configuration["TYPESAFE_API_KEY"] ?? options.ApiKey)
            .Validate(options => options.CategoryConfidenceThreshold is >= 0m and <= 1m)
            .ValidateOnStart();
        services.AddHttpClient<JevTransactionEnricher>(client =>
        {
            client.BaseAddress = new Uri("https://api.typesafe.ai/");
            client.Timeout = TimeSpan.FromSeconds(5);
        });
        services.AddScoped<IHouseholdService, PostgresHouseholdService>();
        services.AddScoped<IHouseholdAccessService, PostgresHouseholdAccessService>();
        services.AddScoped<ICategoryService, PostgresCategoryService>();
        services.AddScoped<IGoalService, PostgresGoalService>();
        services.AddScoped<IGoalFinancialSnapshotBuilder, PostgresGoalFinancialSnapshotBuilder>();
        services.AddScoped<IGoalPlanningService, PostgresGoalPlanningService>();
        services.AddScoped<ICommitmentService, PostgresCommitmentService>();
        services.AddScoped<IJudgementService, PostgresJudgementService>();
        services.AddScoped<IJudgementReportService, PostgresJudgementReportService>();
        services.AddScoped<IJudgementReportWorkStore, PostgresJudgementReportWorkStore>();
        services.AddScoped<IJudgementReportPipeline, PostgresJudgementReportPipeline>();
        services.AddScoped<IJudgementReportRecalculationQueue, JudgementReportRecalculationQueue>();
        services.AddScoped<DailyFinancialFactStore>();
        services.AddScoped<JudgmentCandidateAnalysisService>();
        services.AddScoped<JudgmentContextBuilder>();
        services.AddScoped<JudgmentDecisionService>();
        services.AddSingleton<JudgmentDecisionWakeup>();
        services.AddHttpClient<JevJudgmentGate>(client =>
        {
            client.BaseAddress = new Uri("https://api.typesafe.ai/");
            client.Timeout = TimeSpan.FromSeconds(8);
        });
        services.AddOptions<CandidateDetectionOptions>()
            .Bind(configuration.GetSection(CandidateDetectionOptions.SectionName))
            .Validate(x => x.AnalysisIntervalHours is >= 1 and <= 168 &&
                x.MinInterestingness is >= 0m and <= 1m && x.RepeatedSpendCount >= 2 &&
                x.DeviationWeight + x.FrequencyWeight + x.GoalImpactWeight + x.SpendShareWeight + x.RecencyWeight == 1m)
            .ValidateOnStart();
        services.AddHostedService<JudgmentCandidateAnalysisWorker>();
        services.AddHostedService<JudgmentDecisionWorker>();
        services.AddScoped<IFinanceTransactionReader, PostgresFinanceTransactionReader>();
        services.AddScoped<IPrivacyService, PostgresPrivacyService>();
        services.AddHostedService<DeletedTransactionPurgeService>();
        services.AddHostedService<CommitmentDueWorker>();
        services.AddOptions<JudgementReportWorkerOptions>()
            .Bind(configuration.GetSection(JudgementReportWorkerOptions.SectionName))
            .ValidateOnStart();
        services.AddSingleton<IValidateOptions<JudgementReportWorkerOptions>, JudgementReportWorkerOptionsValidator>();
        services.AddHostedService<JudgementReportSchedulerWorker>();
        services.AddHostedService<JudgementReportCalculationWorker>();
        services.AddHostedService<JudgementReportNarrationWorker>();
        services.Configure<OpenAiGoalPlanningOptions>(options =>
        {
            configuration.GetSection(OpenAiGoalPlanningOptions.SectionName).Bind(options);
            options.ApiKey = configuration["OPENAI_API_KEY"] ?? options.ApiKey;
            options.SafetyIdentifierKey =
                configuration["OPENAI_SAFETY_IDENTIFIER_KEY"] ?? options.SafetyIdentifierKey;
        });
        services.AddSingleton<IGoalPlanningSafetyIdentifier, HmacGoalPlanningSafetyIdentifier>();
        services.AddHttpClient<IGoalPlanningModelClient, OpenAiGoalPlanningClient>((provider, client) =>
        {
            var options = provider.GetRequiredService<
                Microsoft.Extensions.Options.IOptions<OpenAiGoalPlanningOptions>>().Value;
            client.BaseAddress = new Uri("https://api.openai.com/v1/");
            client.Timeout = TimeSpan.FromSeconds(Math.Clamp(options.TimeoutSeconds, 5, 120));
            client.DefaultRequestHeaders.UserAgent.ParseAdd("MoneyMentor/1.0");
        });
        services.AddHttpClient<IJudgementNarrationClient, OpenAiJudgementNarrationClient>((provider, client) =>
        {
            var options = provider.GetRequiredService<IOptions<OpenAiGoalPlanningOptions>>().Value;
            client.BaseAddress = new Uri("https://api.openai.com/v1/");
            client.Timeout = TimeSpan.FromSeconds(Math.Clamp(options.TimeoutSeconds, 5, 120));
            client.DefaultRequestHeaders.UserAgent.ParseAdd("MoneyMentor/1.0");
        });
        //services.AddHostedService<GoalPlanningWorker>();
        services.AddOptions<ResendOptions>()
            .Bind(configuration.GetSection(ResendOptions.SectionName))
            .Validate(options => !options.DispatcherEnabled || !string.IsNullOrWhiteSpace(options.ApiKey),
                "Resend:ApiKey is required when Resend:DispatcherEnabled is true.")
            .Validate(options => !options.DispatcherEnabled || !string.IsNullOrWhiteSpace(options.FromAddress),
                "Resend:FromAddress is required when Resend:DispatcherEnabled is true.")
            .Validate(options => !options.DispatcherEnabled
                    || options.RecoveryInterval >= TimeSpan.FromMinutes(5)
                    && options.RecoveryInterval <= TimeSpan.FromDays(1),
                "Resend:RecoveryInterval must be between 5 minutes and 1 day when the dispatcher is enabled.")
            .ValidateOnStart();
        services.AddHttpClient<ITransactionalEmailSender, ResendTransactionalEmailSender>(client =>
        {
            client.BaseAddress = new Uri("https://api.resend.com/");
            client.Timeout = TimeSpan.FromSeconds(15);
        });
        services.AddSingleton<IInvitationDispatchSignal, InvitationDispatchSignal>();
        if (configuration.GetValue<bool>($"{ResendOptions.SectionName}:DispatcherEnabled"))
        {
            services.AddHostedService<InvitationEmailDispatcher>();
        }
        services.AddHealthChecks()
            .AddCheck<PostgresReadinessHealthCheck>("postgres", tags: ["ready"]);

        return services;
    }

    private static void ConfigureIdentityOptions(IdentityOptions options)
    {
        options.User.RequireUniqueEmail = true;

        options.Password.RequiredLength = 8;
        options.Password.RequireDigit = true;
        options.Password.RequireLowercase = true;
        options.Password.RequireUppercase = true;
        options.Password.RequireNonAlphanumeric = false;

        options.Lockout.AllowedForNewUsers = true;
        options.Lockout.MaxFailedAccessAttempts = 5;
        options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
    }
}
