using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Dashboard;
using MoneyMentor.Application.Households;
using MoneyMentor.Application.Transactions;
using MoneyMentor.Infrastructure.AppUsers;
using MoneyMentor.Infrastructure.Auth;
using MoneyMentor.Infrastructure.Dashboard;
using MoneyMentor.Infrastructure.Households;
using MoneyMentor.Infrastructure.Identity;
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
        services.AddScoped<IFinanceTransactionReader, PostgresFinanceTransactionReader>();
        services.AddScoped<IPrivacyService, PostgresPrivacyService>();
        services.AddHostedService<DeletedTransactionPurgeService>();
        services.Configure<ResendOptions>(configuration.GetSection(ResendOptions.SectionName));
        services.AddHttpClient<ITransactionalEmailSender, ResendTransactionalEmailSender>(client =>
        {
            client.BaseAddress = new Uri("https://api.resend.com/");
            client.DefaultRequestHeaders.UserAgent.ParseAdd("MoneyMentor/1.0");
            client.Timeout = TimeSpan.FromSeconds(15);
        });
        services.AddHostedService<InvitationEmailDispatcher>();
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
