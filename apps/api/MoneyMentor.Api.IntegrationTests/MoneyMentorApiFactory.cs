using System.Collections.Concurrent;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.Tokens;
using MoneyMentor.Application.Households;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Email;
using MoneyMentor.Infrastructure.Identity;
using MoneyMentor.Infrastructure.Persistence;
using Testcontainers.PostgreSql;
using Xunit;

namespace MoneyMentor.Api.IntegrationTests;

public sealed class MoneyMentorApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:17.5-alpine")
        .WithDatabase("moneymentor_tests")
        .WithUsername("moneymentor")
        .WithPassword("moneymentor-tests")
        .Build();
    private string? _connectionString;

    public FrozenTimeProvider Clock { get; } = new(
        new DateTimeOffset(2026, 7, 1, 18, 45, 0, TimeSpan.Zero));

    public RecordingEmailSender EmailSender { get; } = new();

    public string ConnectionString => _connectionString
        ?? throw new InvalidOperationException("The PostgreSQL test container has not started.");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        TestWebHostSettings.Apply(
            builder,
            new Dictionary<string, string>
            {
                ["ConnectionStrings:MoneyMentorDb"] = ConnectionString,
                ["Jwt:Issuer"] = "MoneyMentor.Tests",
                ["Jwt:Audience"] = "MoneyMentor.Api.IntegrationTests",
                ["Jwt:SigningKey"] = "integration-tests-signing-key-at-least-32-bytes-long",
                ["Jwt:AccessTokenMinutes"] = "15",
                ["Jwt:RefreshTokenDays"] = "30",
                ["AuthCookie:Secure"] = "false",
                ["AuthCookie:SameSite"] = "Lax",
                ["Product:PublicWebUrl"] = "http://localhost",
                ["Product:SupportEmail"] = "support@moneymentor.test",
                ["Resend:ApiKey"] = "test-key",
                ["Resend:FromAddress"] = "MoneyMentor <noreply@moneymentor.test>",
                ["Resend:ReplyTo"] = "support@moneymentor.test",
                ["RateLimits:AuthenticatedPerMinute"] = "10000",
                ["RateLimits:AnonymousPerMinute"] = "10000",
                ["RateLimits:SignupsPerHour"] = "10000",
                ["RateLimits:LoginsPerFiveMinutes"] = "10000",
                ["RateLimits:SessionsPerFiveMinutes"] = "10000",
                ["RateLimits:InvitationsPerHour"] = "10000",
                ["RateLimits:PrivacyOperationsPerHour"] = "10000"
            });
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(Clock);
            TestWebHostSettings.UseJwtClock(services, Clock);
            services.RemoveAll<ITransactionalEmailSender>();
            services.AddSingleton<ITransactionalEmailSender>(EmailSender);
        });
    }

    public async ValueTask InitializeAsync()
    {
        await _postgres.StartAsync();
        _connectionString = _postgres.GetConnectionString();
        var authOptions = new DbContextOptionsBuilder<MoneyMentorAuthDbContext>()
            .UseNpgsql(ConnectionString, options =>
                options.MigrationsAssembly(typeof(MoneyMentorAuthDbContext).Assembly.FullName))
            .Options;
        var appOptions = new DbContextOptionsBuilder<MoneyMentorDbContext>()
            .UseNpgsql(ConnectionString, options =>
                options.MigrationsAssembly(typeof(MoneyMentorDbContext).Assembly.FullName))
            .Options;
        await using var authDb = new MoneyMentorAuthDbContext(authOptions);
        await using var appDb = new MoneyMentorDbContext(appOptions);
        await authDb.Database.MigrateAsync();
        await appDb.Database.MigrateAsync();
    }

    public override async ValueTask DisposeAsync()
    {
        await base.DisposeAsync();
        await _postgres.DisposeAsync();
    }

    public async Task<Guid> SeedIdentityUserAsync(string email, string password, string displayName)
    {
        await using var scope = Services.CreateAsyncScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = email,
            Email = email,
            DisplayName = displayName,
            EmailConfirmed = true
        };
        var result = await userManager.CreateAsync(user, password);
        Assert.True(result.Succeeded, string.Join("; ", result.Errors.Select(error => error.Description)));
        return user.Id;
    }

    public async Task DispatchInvitationsAsync(CancellationToken cancellationToken = default)
    {
        using var dispatcher = ActivatorUtilities.CreateInstance<InvitationEmailDispatcher>(Services);
        await dispatcher.DispatchAvailableAsync(cancellationToken);
    }
}

public sealed class FrozenTimeProvider(DateTimeOffset utcNow) : TimeProvider
{
    public override DateTimeOffset GetUtcNow() => utcNow;
}

public sealed class RecordingEmailSender : ITransactionalEmailSender
{
    public ConcurrentQueue<TransactionalEmailMessage> Messages { get; } = new();

    public Task<EmailSendResult> SendAsync(
        TransactionalEmailMessage message,
        CancellationToken cancellationToken)
    {
        Messages.Enqueue(message);
        return Task.FromResult(EmailSendResult.Success($"test-{message.DeliveryId:N}"));
    }
}

public sealed class RateLimitedApiFactory(
    string connectionString,
    TimeProvider clock,
    ITransactionalEmailSender emailSender) : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        TestWebHostSettings.Apply(
            builder,
            new Dictionary<string, string>
            {
                ["ConnectionStrings:MoneyMentorDb"] = connectionString,
                ["Jwt:Issuer"] = "MoneyMentor.Tests",
                ["Jwt:Audience"] = "MoneyMentor.Api.IntegrationTests",
                ["Jwt:SigningKey"] = "integration-tests-signing-key-at-least-32-bytes-long",
                ["AuthCookie:Secure"] = "false",
                ["Product:PublicWebUrl"] = "http://localhost",
                ["Product:SupportEmail"] = "support@moneymentor.test",
                ["RateLimits:AnonymousPerMinute"] = "2",
                ["RateLimits:AuthenticatedPerMinute"] = "10000"
            });
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<TimeProvider>();
            services.AddSingleton(clock);
            TestWebHostSettings.UseJwtClock(services, clock);
            services.RemoveAll<ITransactionalEmailSender>();
            services.AddSingleton(emailSender);
        });
    }
}

public sealed class InvalidProductionApiFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Production");
        TestWebHostSettings.Apply(
            builder,
            new Dictionary<string, string>
            {
                ["Cors:AllowedOrigins:0"] = "http://localhost:3000"
            });
    }
}

public sealed class LocalCorsProductionApiFactory(string connectionString) : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Production");
        TestWebHostSettings.Apply(
            builder,
            new Dictionary<string, string>
            {
                ["ConnectionStrings:MoneyMentorDb"] = connectionString,
                ["Jwt:Issuer"] = "MoneyMentor.Tests",
                ["Jwt:Audience"] = "MoneyMentor.Api.IntegrationTests",
                ["Jwt:SigningKey"] = "integration-tests-signing-key-at-least-32-bytes-long",
                ["AuthCookie:Secure"] = "true",
                ["AllowedHosts"] = "localhost",
                ["Cors:AllowedOrigins:0"] = "https://app.moneymentor.test",
                ["CORS_ALLOWED_ORIGINS"] = "http://localhost:3000",
                ["CORS_ALLOW_LOCALHOST"] = "true",
                ["Product:PublicWebUrl"] = "https://app.moneymentor.test",
                ["Product:SupportEmail"] = "support@moneymentor.test",
                ["JudgementReports:SchedulerEnabled"] = "false",
                ["JudgementReports:CalculationWorkerEnabled"] = "false",
                ["JudgementReports:NarrationWorkerEnabled"] = "false"
            });
    }
}

internal static class TestWebHostSettings
{
    public static void Apply(IWebHostBuilder builder, IReadOnlyDictionary<string, string> settings)
    {
        foreach (var (key, value) in settings)
        {
            builder.UseSetting(key, value);
        }
    }

    public static void UseJwtClock(IServiceCollection services, TimeProvider clock)
    {
        services.PostConfigure<JwtBearerOptions>(
            JwtBearerDefaults.AuthenticationScheme,
            options => options.TokenValidationParameters.LifetimeValidator =
                (notBefore, expires, _, parameters) =>
                    ValidateLifetime(notBefore, expires, parameters, clock));
    }

    private static bool ValidateLifetime(
        DateTime? notBefore,
        DateTime? expires,
        TokenValidationParameters parameters,
        TimeProvider clock)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        return (notBefore is null || notBefore <= now + parameters.ClockSkew)
            && (expires is not null
                ? expires >= now - parameters.ClockSkew
                : !parameters.RequireExpirationTime);
    }
}

[CollectionDefinition(Name, DisableParallelization = true)]
public sealed class PostgreSqlApiCollection : ICollectionFixture<MoneyMentorApiFactory>
{
    public const string Name = "postgres-api";
}
