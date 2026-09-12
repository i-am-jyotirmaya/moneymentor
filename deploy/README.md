# MoneyMentor deployment

The primary deployment target is **EC2 with Neon PostgreSQL**. Run the API and Next.js app behind Nginx using the [AWS / EC2 runbook](aws/README.md), [Compose template](aws/compose.yml), and [environment example](aws/.env.example).

AWS credentials come from the EC2 instance role. The application performs no STS identity check or AWS network call at startup. Resend remains the email provider. The pending landing site will later be served from S3 through CloudFront.

New accounts use request-only access by default; see [MVP access operations](../docs/MVP_ACCESS.md).

[Legacy Railway instructions](railway/README.md) and their environment templates remain available for existing Railway installations. The older [generic Compose example](compose.production.example.yml) includes a local PostgreSQL container; use the AWS template for EC2 and Neon.
