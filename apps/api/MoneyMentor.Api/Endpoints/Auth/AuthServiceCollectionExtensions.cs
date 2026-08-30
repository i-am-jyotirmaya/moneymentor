using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.DependencyInjection.Extensions;
using MoneyMentor.Infrastructure.Auth;

namespace MoneyMentor.Api.Endpoints.Auth;

public static class AuthServiceCollectionExtensions
{
    public static IServiceCollection AddMoneyMentorAuth(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var jwtOptions = configuration
            .GetSection(JwtOptions.SectionName)
            .Get<JwtOptions>() ?? new JwtOptions();

        jwtOptions.Validate();

        services.Configure<JwtOptions>(configuration.GetSection(JwtOptions.SectionName));
        services.Configure<AuthCookieOptions>(configuration.GetSection(AuthCookieOptions.SectionName));
        services.TryAddSingleton(TimeProvider.System);
        services.AddScoped<IAuthManager, PostgresAuthManager>();

        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = jwtOptions.Issuer,
                    ValidateAudience = true,
                    ValidAudience = jwtOptions.Audience,
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtOptions.SigningKey)),
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.FromMinutes(1),
                    NameClaimType = ClaimTypes.NameIdentifier,
                    RoleClaimType = ClaimTypes.Role
                };
                options.Events = new JwtBearerEvents
                {
                    OnTokenValidated = async context =>
                    {
                        var userIdValue = context.Principal?.FindFirstValue(ClaimTypes.NameIdentifier);
                        var sessionIdValue = context.Principal?.FindFirstValue("sid");
                        if (!Guid.TryParse(userIdValue, out var userId)
                            || !Guid.TryParse(sessionIdValue, out var sessionId))
                        {
                            context.Fail("The access token session is invalid.");
                            return;
                        }

                        var repository = context.HttpContext.RequestServices
                            .GetRequiredService<IAuthRepository>();
                        var timeProvider = context.HttpContext.RequestServices
                            .GetRequiredService<TimeProvider>();
                        if (!await repository.IsSessionActiveAsync(
                                sessionId,
                                userId,
                                timeProvider.GetUtcNow(),
                                context.HttpContext.RequestAborted))
                        {
                            context.Fail("The access token session has been revoked.");
                        }
                    }
                };
            });

        services.AddAuthorization();

        return services;
    }
}
