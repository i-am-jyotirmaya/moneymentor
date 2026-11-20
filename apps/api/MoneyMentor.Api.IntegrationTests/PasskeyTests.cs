using System.Buffers.Binary;
using System.Formats.Cbor;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;
using MoneyMentor.Api.Endpoints.Auth;
using Xunit;

namespace MoneyMentor.Api.IntegrationTests;

[Collection(PostgreSqlApiCollection.Name)]
public sealed class PasskeyTests(MoneyMentorApiFactory factory)
{
    private const string Path = "/api/auth/passkeys";
    private const string Password = "IntegrationPasskey123";
    private const string RpId = "mvp.spndrr.com";
    private const string Origin = "https://" + RpId;

    [Fact]
    public async Task Passkey_enrollment_and_sign_in_use_the_existing_session_contract_and_reject_replay()
    {
        var cancellation = TestContext.Current.CancellationToken;
        var email = $"passkey-{Guid.NewGuid():N}@example.test";
        var expectedUser = await factory.SeedIdentityUserAsync(email, Password, "Passkey user");
        using var account = factory.CreateClient();
        using var alternateSession = factory.CreateClient();
        using var anonymous = factory.CreateClient();
        await SignInWithPasswordAsync(account, email, cancellation);
        await SignInWithPasswordAsync(alternateSession, email, cancellation);

        using var unauthorized = await anonymous.PostAsJsonAsync($"{Path}/registration/options", new { Password }, cancellation);
        Assert.Equal(HttpStatusCode.Unauthorized, unauthorized.StatusCode);
        using var wrongPassword = await account.PostAsJsonAsync($"{Path}/registration/options", new { Password = "wrong" }, cancellation);
        Assert.Equal(HttpStatusCode.BadRequest, wrongPassword.StatusCode);

        var enrollment = await GetOptionsAsync(account, "registration", new { Password }, cancellation);
        var publicKey = enrollment.GetProperty("publicKey");
        Assert.Equal("required", publicKey.GetProperty("authenticatorSelection").GetProperty("userVerification").GetString());
        var userHandle = publicKey.GetProperty("user").GetProperty("id").GetString()!;
        using var authenticator = new TestAuthenticator();
        var registration = new
        {
            ChallengeId = enrollment.GetProperty("challengeId"),
            Credential = authenticator.Register(publicKey.GetProperty("challenge").GetString()!)
        };
        using var wrongSession = await alternateSession.PostAsJsonAsync($"{Path}/registration/verify", registration, cancellation);
        Assert.Equal(HttpStatusCode.BadRequest, wrongSession.StatusCode);
        using var enrolled = await account.PostAsJsonAsync($"{Path}/registration/verify", registration, cancellation);
        Assert.Equal(HttpStatusCode.NoContent, enrolled.StatusCode);
        using var registrationReplay = await account.PostAsJsonAsync($"{Path}/registration/verify", registration, cancellation);
        Assert.Equal(HttpStatusCode.BadRequest, registrationReplay.StatusCode);
        var listed = await account.GetFromJsonAsync<JsonElement>($"{Path}", cancellation);
        Assert.Equal(authenticator.Id, Assert.Single(listed.EnumerateArray()).GetProperty("id").GetString());

        var options = await GetOptionsAsync(anonymous, "login", null, cancellation);
        var loginKey = options.GetProperty("publicKey");
        Assert.Equal(RpId, loginKey.GetProperty("rpId").GetString());
        Assert.Equal(0, loginKey.GetProperty("allowCredentials").GetArrayLength());
        var invalidOrigin = new
        {
            ChallengeId = options.GetProperty("challengeId"),
            Credential = authenticator.Assert(loginKey.GetProperty("challenge").GetString()!, userHandle, "https://other.example", 1)
        };
        using var rejected = await anonymous.PostAsJsonAsync($"{Path}/login/verify", invalidOrigin, cancellation);
        Assert.Equal(HttpStatusCode.Unauthorized, rejected.StatusCode);

        options = await GetOptionsAsync(anonymous, "login", null, cancellation);
        var assertion = new
        {
            ChallengeId = options.GetProperty("challengeId"),
            Credential = authenticator.Assert(options.GetProperty("publicKey").GetProperty("challenge").GetString()!, userHandle, Origin, 1)
        };
        var contenders = await Task.WhenAll(
            anonymous.PostAsJsonAsync($"{Path}/login/verify", assertion, cancellation),
            anonymous.PostAsJsonAsync($"{Path}/login/verify", assertion, cancellation));
        using var success = Assert.Single(contenders, response => response.StatusCode == HttpStatusCode.OK);
        using var replay = Assert.Single(contenders, response => response.StatusCode == HttpStatusCode.Unauthorized);
        var session = await success.Content.ReadFromJsonAsync<AuthSessionResponse>(cancellation);
        Assert.Equal(expectedUser, session?.User.Id);
        Assert.True(session?.RequiresPrivacyConsent);
        var cookie = Assert.Single(success.Headers.GetValues("Set-Cookie"), value => value.StartsWith("mm_refresh="));
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
        using var refresh = new HttpRequestMessage(HttpMethod.Post, "/api/auth/refresh");
        refresh.Headers.Add("Cookie", cookie.Split(';')[0]);
        using var restored = await anonymous.SendAsync(refresh, cancellation);
        Assert.Equal(HttpStatusCode.OK, restored.StatusCode);

        using var removed = await account.PostAsJsonAsync($"{Path}/{authenticator.Id}/remove", new { Password }, cancellation);
        Assert.Equal(HttpStatusCode.NoContent, removed.StatusCode);
        options = await GetOptionsAsync(anonymous, "login", null, cancellation);
        using var removedPasskey = await anonymous.PostAsJsonAsync($"{Path}/login/verify", new
        {
            ChallengeId = options.GetProperty("challengeId"),
            Credential = authenticator.Assert(options.GetProperty("publicKey").GetProperty("challenge").GetString()!, userHandle, Origin, 2)
        }, cancellation);
        Assert.Equal(HttpStatusCode.Unauthorized, removedPasskey.StatusCode);
    }

    private static async Task SignInWithPasswordAsync(HttpClient client, string email, CancellationToken cancellation)
    {
        using var response = await client.PostAsJsonAsync("/api/auth/login", new { email, Password }, cancellation);
        response.EnsureSuccessStatusCode();
        var session = await response.Content.ReadFromJsonAsync<AuthSessionResponse>(cancellation);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session!.AccessToken);
    }

    private static async Task<JsonElement> GetOptionsAsync(HttpClient client, string ceremony, object? body, CancellationToken cancellation)
    {
        using var response = body is null
            ? await client.PostAsync($"{Path}/{ceremony}/options", null, cancellation)
            : await client.PostAsJsonAsync($"{Path}/{ceremony}/options", body, cancellation);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<JsonElement>(cancellation);
    }

    private sealed class TestAuthenticator : IDisposable
    {
        private readonly ECDsa _key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        private readonly byte[] _id = RandomNumberGenerator.GetBytes(32);
        public string Id => WebEncoders.Base64UrlEncode(_id);

        public object Register(string challenge)
        {
            var point = _key.ExportParameters(false).Q;
            var cose = new CborWriter();
            cose.WriteStartMap(5);
            cose.WriteInt32(1); cose.WriteInt32(2);
            cose.WriteInt32(3); cose.WriteInt32(-7);
            cose.WriteInt32(-1); cose.WriteInt32(1);
            cose.WriteInt32(-2); cose.WriteByteString(point.X!);
            cose.WriteInt32(-3); cose.WriteByteString(point.Y!);
            cose.WriteEndMap();
            byte[] attestedData = [.. AuthenticatorData(0x45, 0), .. new byte[16], 0, (byte)_id.Length, .. _id, .. cose.Encode()];
            var cbor = new CborWriter();
            cbor.WriteStartMap(3);
            cbor.WriteTextString("fmt"); cbor.WriteTextString("none");
            cbor.WriteTextString("authData"); cbor.WriteByteString(attestedData);
            cbor.WriteTextString("attStmt"); cbor.WriteStartMap(0); cbor.WriteEndMap();
            cbor.WriteEndMap();
            return Credential(new
            {
                clientDataJSON = WebEncoders.Base64UrlEncode(ClientData("webauthn.create", challenge, Origin)),
                attestationObject = WebEncoders.Base64UrlEncode(cbor.Encode())
            });
        }

        public object Assert(string challenge, string userHandle, string origin, uint count)
        {
            var clientData = ClientData("webauthn.get", challenge, origin);
            var data = AuthenticatorData(0x05, count);
            var signature = _key.SignData([.. data, .. SHA256.HashData(clientData)], HashAlgorithmName.SHA256, DSASignatureFormat.Rfc3279DerSequence);
            return Credential(new
            {
                clientDataJSON = WebEncoders.Base64UrlEncode(clientData),
                authenticatorData = WebEncoders.Base64UrlEncode(data),
                signature = WebEncoders.Base64UrlEncode(signature),
                userHandle
            });
        }

        private object Credential(object response) => new { id = Id, type = "public-key", clientExtensionResults = new Dictionary<string, object>(), response };
        private static byte[] ClientData(string type, string challenge, string origin) =>
            JsonSerializer.SerializeToUtf8Bytes(new { type, challenge, origin, crossOrigin = false });

        private static byte[] AuthenticatorData(byte flags, uint count)
        {
            var data = new byte[37];
            SHA256.HashData(Encoding.UTF8.GetBytes(RpId)).CopyTo(data, 0);
            data[32] = flags;
            BinaryPrimitives.WriteUInt32BigEndian(data.AsSpan(33), count);
            return data;
        }

        public void Dispose() => _key.Dispose();
    }
}
