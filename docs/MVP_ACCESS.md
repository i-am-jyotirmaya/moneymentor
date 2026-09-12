# Temporary MVP access

New accounts require approval by default. Existing users can continue signing in. Approval grants a normal Free account; Premium remains controlled by the separate entitlement command. Household invitations do not grant MVP access.

## Deployment

Build the API, web, and operations executable from the same revision. Run the existing migration command against the intended deployment database before starting the updated API:

```sh
dotnet /app/operations/MoneyMentor.Operations.dll migrate
```

This applies the additive `AddMvpAccessRequests` auth migration. It creates `auth.mvp_access_requests` without altering finance data or existing sessions. The integration suite applies and exercises it in an isolated PostgreSQL database.

Set these values on both the API and the operations environment (use deployment secrets for credentials):

```text
Registration__Mode=RequestOnly
ConnectionStrings__MoneyMentorDb=<deployment database connection string>
Product__PublicWebUrl=https://<app hostname>
AWS__Enabled=true
AWS__Region=<SES region>
SES__FromAddress=<SES verified sender>
SES__ReplyTo=<support address>
```

The web build needs its existing `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_SUPPORT_EMAIL`. API configuration is the source of truth for registration mode. An unavailable settings endpoint leaves public signup hidden. `RateLimits__AccessRequestsPerHour` defaults to five per client IP; invitation validation uses the existing session rate limit.

The operations executable reads environment configuration; running it from a source checkout only falls back to the development JSON file for the database connection. Configure the AWS region, SES sender, and public web URL explicitly in its environment. Credentials come from the EC2 instance role or a local SSO profile. `SES__DispatcherEnabled` controls household email processing only; it does not disable approval-command emails. Complete [SES setup](../deploy/aws/README.md#ses-email-delivery) before approving users.

## Review requests

Visitors choose **Request MVP access** on the signed-out home or login page. `/request-access` collects name, email, and an optional reason. Submitting does not create an account or send an email. Repeated requests and requests for existing accounts receive the same acknowledgment.

Run these commands in the operations container or the API container that includes the operations executable:

```sh
dotnet /app/operations/MoneyMentor.Operations.dll access-requests list --status pending
dotnet /app/operations/MoneyMentor.Operations.dll access-requests approve --id <request-id> --operator <your-name>
dotnet /app/operations/MoneyMentor.Operations.dll access-requests reject --id <request-id> --operator <your-name>
dotnet /app/operations/MoneyMentor.Operations.dll access-requests resend --id <request-id> --operator <your-name>
```

For a local source checkout, substitute `dotnet run --project apps/api/MoneyMentor.Operations --` for `dotnet /app/operations/MoneyMentor.Operations.dll`.

`list` returns JSON containing request IDs, names, emails, reasons, status, review metadata, expiry, and latest delivery outcome. It accepts `pending` (default), `approved`, `rejected`, `registered`, or `all`. It never prints signup tokens.

Approval persists the decision, then sends an email using the SES sender. The private URL is `/signup#token=...`; the browser validates the fragment token through the API before revealing the form. The approved email is fixed, the user selects a password and accepts the privacy policy, and the existing signup/session flow continues. The link is valid for seven days and one account creation. Possession of the email link confirms the approved address.

Reject sends no email and invalidates an unused link. A rejected request can later be approved explicitly. Duplicate form submissions never reset a review. Registered requests cannot be resent or rejected; existing account management remains separate.

## Delivery failures and retries

Approval returns exit code `0` only after the provider reports success. A delivery failure returns `1`, leaves the request approved, and records `Failed` plus a provider error. An interrupted command may leave delivery `Pending`. Provider acceptance means the email was submitted; it is not an inbox-delivery guarantee.

Use `list --status approved` to inspect failures, verify provider configuration, and run `resend`. The resend command generates a new delivery ID and token, resets the seven-day expiry, and invalidates every older link. Repeating `approve` on an already approved request returns an error directing you to `resend`. If a recipient clicked an older email after a resend, they need the latest email. An SES message ID confirms provider acceptance, not inbox delivery; timeouts can leave delivery uncertain.

The commands store only token hashes. Sending happens outside the database transaction; simultaneous administrative changes can cause an older email to arrive, but only the latest unrevoked link works. Review and resend one request at a time. No background retries, admin notification emails, or admin dashboard are included.

## Verification and reopening signup

After deployment, submit an access request using an inbox you control, review it through the CLI, approve it, verify receipt, create the account, then confirm that the used link fails and login works. Verify that `/signup` without a token redirects to `/request-access`, including URLs with household invitation IDs. Household invitees need MVP approval before account creation; expired household invitations must be reissued through the existing household flow.

Automated checks:

```sh
dotnet test apps/api/MoneyMentor.Api.IntegrationTests --filter FullyQualifiedName~MvpAccessTests
pnpm --filter web exec playwright test tests/mvp-access.spec.ts --workers=2
```

To restore public signup, set `Registration__Mode=Open` on the API and operations environment and restart the API. Public links and `/signup` use the original signup form. Existing approval links remain subject to their token validation. No migration rollback or deletion of requests is necessary. Returning to `RequestOnly` gates new accounts again without revoking existing users.
