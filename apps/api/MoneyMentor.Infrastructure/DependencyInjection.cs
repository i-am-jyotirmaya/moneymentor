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

namespace MoneyMentor.Infrastructure;

public static class DependencyInjection
{
    public const string ConnectionStringName = "MoneyMentorDb";

    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.TryAddSingleton(TimeProvider.System);

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
        services.Configure<ResendOptions>(configuration.GetSection(ResendOptions.SectionName));
        services.AddHttpClient<ITransactionalEmailSender, ResendTransactionalEmailSender>(client =>
        {
            client.BaseAddress = new Uri("https://api.resend.com/");
            client.DefaultRequestHeaders.UserAgent.ParseAdd("MoneyMentor/1.0");
            client.Timeout = TimeSpan.FromSeconds(15);
        });
        // TODO: Enable invitationEmailDispatcher once setup is done
        // services.AddHostedService<InvitationEmailDispatcher>();
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
