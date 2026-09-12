# AWS / EC2 deployment

Run one API and one Next.js server on a Linux EC2 instance, with Nginx terminating HTTPS and the existing Neon database providing PostgreSQL. These templates prepare a manually managed deployment; they do not provision resources or publish images.

```text
app.example.com  ---> EC2 Nginx ---> Next.js
api.example.com  ---> EC2 Nginx ---> API ---> Neon (TLS)
                                    |
                                    +-- EC2 instance role ---> future AWS services

Later: landing site ---> CloudFront ---> private S3 bucket
```

The pending `apps/landing` PR is separate. Do not statically export `apps/web`; its current standalone Next.js image continues running on EC2. Resend remains the email provider. RDS migration, SES, Secrets Manager, CloudFront provisioning, and deployment automation are future work.

## AWS configuration and credentials

| API / Operations setting | Default | Meaning |
| --- | --- | --- |
| `AWS__Enabled` | `false` | Registers shared SDK options; the EC2 template enables this |
| `AWS__Region` | unset | Required when enabled; choose the region used by the instance/services |
| `AWS__Profile` | unset | Optional named local profile; omit on EC2 |

The module binds configuration only. It does not resolve credentials, call STS, verify an account, or add an AWS health check. Startup succeeds without AWS access when the region is configured. A future AWS service client will resolve credentials through the SDK and surface authentication/authorization errors when used.

On EC2, the SDK obtains and refreshes temporary credentials from the attached instance role. Do not set `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, or a profile in production containers: credential sources earlier in the SDK chain can override the instance role. Do not copy a developer's `.aws` directory into an image. The EC2 role's account determines the application's AWS identity; application users and ASP.NET Identity are independent.

For local development with an IAM Identity Center account assignment, install AWS CLI v2 and configure a profile outside this repository:

```powershell
aws configure sso --profile moneymentor-dev
aws sso login --profile moneymentor-dev
$env:AWS__Enabled = 'true'
$env:AWS__Region = 'ap-south-1'
$env:AWS__Profile = 'moneymentor-dev'
dotnet run --project apps/api/MoneyMentor.Api
```

Choose your actual region. Use the same environment settings when running Operations. The `AWSSDK.SSO` and `AWSSDK.SSOOIDC` packages support this profile; sign in again when your SSO session expires. These instructions use `aws sso login`, not the separate console `aws login` mechanism.

When implementing SES or another service, add its SDK v4 package and register its SDK interface through `AddAWSService<T>()` inside the enabled AWS registration block. Implement the provider behind an application interface in Infrastructure (for email, the existing `ITransactionalEmailSender`). Reuse the shared options and SDK-managed client lifetime; add only the service's required IAM permissions. Do not introduce a custom credential cache or AWS types into Application/Domain.

References: [SDK configuration and DI](https://docs.aws.amazon.com/sdk-for-net/v4/developer-guide/net-dg-config-netcore.html), [credential resolution](https://docs.aws.amazon.com/sdk-for-net/v4/developer-guide/creds-assign.html), and [local SSO](https://docs.aws.amazon.com/sdk-for-net/v4/developer-guide/creds-idc.html).

## EC2 host and instance profile

1. In the intended AWS account, create an IAM role named `MoneyMentorEc2Role` using [ec2-trust-policy.json](ec2-trust-policy.json). Its `sts:AssumeRole` trust action allows the EC2 service to assume the role; it is not an application STS check. No SES/S3 or administrator policy is needed for this foundation.
2. Create an instance profile containing that role and attach it to the instance. The IAM console normally creates the profile when creating an EC2 service role. If using the CLI from your operator session:

   ```bash
   aws iam create-role --role-name MoneyMentorEc2Role --assume-role-policy-document file://deploy/aws/ec2-trust-policy.json
   aws iam create-instance-profile --instance-profile-name MoneyMentorEc2Profile
   aws iam add-role-to-instance-profile --instance-profile-name MoneyMentorEc2Profile --role-name MoneyMentorEc2Role
   aws ec2 associate-iam-instance-profile --region YOUR_REGION --instance-id YOUR_INSTANCE_ID --iam-instance-profile Name=MoneyMentorEc2Profile
   aws ec2 modify-instance-metadata-options --region YOUR_REGION --instance-id YOUR_INSTANCE_ID --http-endpoint enabled --http-tokens required --http-put-response-hop-limit 2
   ```

   For an instance that already has a profile, review and replace the association instead of adding another. Wait for the metadata-options change to finish. IMDSv2 must be required, with hop limit `2` so bridged Docker containers can retrieve role credentials. See [EC2 instance roles](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/iam-roles-for-amazon-ec2.html) and [metadata options](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-IMDS-existing-instances.html).
3. Install Docker Engine with the Compose v2 plugin on a supported Linux host, and enable Docker to start at boot. Use matching CPU architectures for the host and built images. Keep the instance to one API replica: clarification drafts and rate limits are process-local, and workers run inside the API.
4. Assign a stable address and point sibling application/API DNS names at it. Allow inbound TCP 80/443; restrict SSH to operator addresses if used. API port 8080, web port 3000, and PostgreSQL ports are not published. Allow outbound HTTPS, DNS, and PostgreSQL TLS to Neon. Containers use the host's role trust boundary; only run trusted workloads on this instance.
5. Provision a trusted TLS certificate covering both hostnames. Put `fullchain.pem` and `privkey.pem` in a host directory such as `/opt/moneymentor/certs`. Mount that directory read-only using `TLS_CERTS_PATH`; keep private keys out of Git. If using a certificate tool's symlinks, copy the resolved files into this directory. Configure certificate renewal to update these files and reload Nginx with `docker compose exec ingress nginx -s reload`.

## Configure the release

From the repository root on the EC2 host:

```bash
cp deploy/aws/.env.example deploy/aws/.env
chmod 600 deploy/aws/.env
```

Edit `.env` and replace the example hosts, region, database connection, JWT key, support email, image tags, and certificate directory. Keep secrets in this private file for this phase; Secrets Manager integration is deferred. Do not put AWS credentials in it. Keep `.env` values containing `$` in single quotes so Compose does not interpolate them. Do not source this file into a shell.

- Preserve the existing Neon database. Use Npgsql keyword/value syntax with a direct Neon endpoint and TLS verification, as shown in the template. The same connection string feeds the separate auth and finance DbContexts and the migration process. No database is created on EC2. A later move to RDS PostgreSQL can retain these boundaries but requires a planned data migration and TLS configuration.
- For an existing deployment, preserve JWT signing key, issuer, audience, registration mode, Resend settings, and whichever optional workers are currently enabled. Defaults disable optional workers for a fresh smoke test. Changing issuer/audience/key invalidates existing access tokens.
- `WEB_HOST` and `API_HOST` must be sibling domains under the same site, with no scheme or path. The template uses secure `SameSite=Strict` cookies and exact HTTPS CORS. Moving between unrelated sites requires a separate cookie/CORS review.
- Request-only signup remains enabled. Set the existing Resend key and verified sender/reply-to addresses for access-approval emails even if household email dispatch is disabled. See [MVP access operations](../../docs/MVP_ACCESS.md).
- The private Docker subnet is `172.30.0.0/24`; Nginx has address `172.30.0.10`, which is explicitly trusted by the API. If this overlaps your VPC/VPN/Docker networks, change the subnet, ingress address, and `ReverseProxy__KnownProxies__0` together. Do not set `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true` for this deployment. Nginx replaces inbound forwarded headers; only Nginx publishes ports.

Build both images from the same CI-verified revision. Substitute the exact release tags stored in `.env`, your real API URL, and support address:

```bash
docker build -f apps/api/MoneyMentor.Api/Dockerfile -t moneymentor-api:YOUR_RELEASE .
docker build -f apps/web/Dockerfile -t moneymentor-web:YOUR_RELEASE --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com --build-arg NEXT_PUBLIC_SUPPORT_EMAIL=support@example.com .
```

Frontend `NEXT_PUBLIC_*` values are compiled into browser assets. Changing a running container's environment cannot change them; rebuild the web image. Alternatively transfer the same immutable images from a build host/registry, keeping architecture and release tags consistent. Registry publication and CI deployment are not automated here.

## Deploy and migrate

Take a recoverable Neon backup/restore point before migrations. Stop any old Railway API and workers before enabling the EC2 API against the same database; avoid two worker sets writing concurrently. This single-host rollout includes downtime.

All commands below run in `deploy/aws`, where Compose automatically reads the private `.env`:

```bash
cd deploy/aws
docker compose config --quiet
docker compose stop ingress web api
docker compose up --force-recreate --no-deps --abort-on-container-exit --exit-code-from migrate migrate
```

The migration command must exit `0` before proceeding. It runs `/app/operations/MoneyMentor.Operations.dll migrate` from `API_IMAGE`, applying both existing EF migration sets. A failed migration must be investigated before starting the release.

```bash
docker compose up -d --wait api web ingress
docker compose ps
docker compose logs --tail 100 api ingress
```

Compose also gates the API on successful migration completion and gates web/ingress on API readiness. The readiness probe supplies the API host and HTTPS forwarded scheme over trusted loopback so it checks PostgreSQL instead of accepting a redirect. API and web restart after host reboot; migrations are a one-shot release step.

Nginx resolves container names when loading its configuration. On every release, stop/start ingress as above so it picks up recreated API/web addresses. Reload it after certificate renewal. Keep previous release images available for rollback.

## Smoke tests and operations

1. Confirm `docker compose ps` shows a healthy API and running web/ingress; inspect logs for production configuration and migration errors.
2. Visit both HTTPS hostnames and confirm certificates. Verify `https://api.example.com/health/live` and `/health/ready` return `200` with `Healthy`, and HTTP redirects to HTTPS. Readiness verifies Neon connectivity and applied migrations; it does not verify AWS permissions.
3. From a clean browser, exercise access request/approval, signup, consent, login, reload, refresh, and logout. Inspect CORS and secure-cookie behavior. Use the existing Operations commands inside the API container:

   ```bash
   docker compose exec api dotnet /app/operations/MoneyMentor.Operations.dll access-requests list --status pending
   docker compose exec api dotnet /app/operations/MoneyMentor.Operations.dll access-requests approve --id REQUEST_ID --operator YOUR_NAME
   ```

4. Confirm the approval email arrives through Resend. If household dispatch was already enabled, verify an invitation email too. Test two household members' Private/Household visibility boundaries.
5. Capture a transaction, reload the app, and compare a supported spending question with the stored data. Confirm data survives an API restart.
6. Inspect the instance's attached role/profile and metadata settings in EC2. There is deliberately no startup identity probe: validate service permissions with an actual service operation when SES or another client is implemented.

Follow logs with `docker compose logs -f api ingress`; configure host log retention and monitor Neon availability, API readiness, EC2 disk/memory, and certificate expiry. AWS calls do not influence current health endpoints.

## Rollback

Stop ingress/web/API, restore the previous `API_IMAGE` and `WEB_IMAGE` tags in `.env`, then run `docker compose up -d --no-deps --wait api web ingress` and repeat the smoke tests. This deliberately skips migrations. Only use it if the previous application is compatible with the current schema. Image rollback does not undo migrations; incompatible database changes require a separate reviewed restore/forward-fix decision.

## Repository validation

```bash
dotnet build MoneyMentor.slnx --configuration Release
dotnet test apps/api/MoneyMentor.Application.Tests --configuration Release --no-build
dotnet test apps/api/MoneyMentor.Api.IntegrationTests --configuration Release --no-build
docker compose --env-file deploy/aws/.env.example -f deploy/aws/compose.yml config --quiet
```

Integration tests need Docker for disposable PostgreSQL. AWS tests use isolated configuration and require no AWS account. Build both images with the commands above; real EC2/Neon smoke tests remain a deployment step.
