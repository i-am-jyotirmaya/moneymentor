using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using MoneyMentor.Infrastructure.Persistence;
using Npgsql;

namespace MoneyMentor.Infrastructure.Auth;

public sealed class PostgresPasskeyStore(MoneyMentorAuthDbContext db)
{
    public async Task<bool> RegisterAsync(Guid userId, UserPasskeyInfo credential, CancellationToken cancellationToken)
    {
        db.UserPasskeys.Add(new IdentityUserPasskey<Guid>
        {
            CredentialId = credential.CredentialId,
            UserId = userId,
            Data = new IdentityPasskeyData
            {
                PublicKey = credential.PublicKey,
                Name = credential.Name,
                CreatedAt = credential.CreatedAt,
                SignCount = credential.SignCount,
                Transports = credential.Transports,
                IsUserVerified = credential.IsUserVerified,
                IsBackupEligible = credential.IsBackupEligible,
                IsBackedUp = credential.IsBackedUp,
                AttestationObject = credential.AttestationObject,
                ClientDataJson = credential.ClientDataJson
            }
        });
        // Insert only. An authenticator credential ID must never overwrite a credential on another account.
        try { await db.SaveChangesAsync(cancellationToken); }
        catch (DbUpdateException exception) when (exception.InnerException is PostgresException
            { SqlState: PostgresErrorCodes.UniqueViolation, ConstraintName: "PK_user_passkeys" })
        {
            return false;
        }
        return true;
    }

    public async Task<bool> UpdateAssertionAsync(Guid userId, UserPasskeyInfo credential, CancellationToken cancellationToken)
    {
        // Re-check ownership, the verified public key and the counter in the update so concurrent
        // assertions cannot roll the counter back and a removed credential cannot be recreated.
        var count = await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE auth.user_passkeys
            SET "Data" = "Data" || jsonb_build_object('SignCount', {(long)credential.SignCount}, 'IsBackedUp', {credential.IsBackedUp})
            WHERE "UserId" = {userId} AND "CredentialId" = {credential.CredentialId}
              AND "Data"->>'PublicKey' = {Convert.ToBase64String(credential.PublicKey)}
              AND (("Data"->>'SignCount')::bigint < {(long)credential.SignCount}
                   OR ("Data"->>'SignCount')::bigint = 0 AND {(long)credential.SignCount} = 0)
            """, cancellationToken);
        return count == 1;
    }

    public Task<int> RemoveAsync(Guid userId, byte[] credentialId, CancellationToken cancellationToken) =>
        db.UserPasskeys.Where(passkey => passkey.UserId == userId && passkey.CredentialId.SequenceEqual(credentialId))
            .ExecuteDeleteAsync(cancellationToken);
}
