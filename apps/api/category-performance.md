# Categories request performance

Code inspection found 108 sequential catalog-initialization SELECTs per request
(60 category lookups, 47 parent lookups, one legacy-category scan), followed by
the catalog SELECT. Legacy flat rows added further parent queries. Database
round-trip latency therefore accumulated even when the catalog was unchanged.

Initialization now loads global categories once and resolves categories and
parents in memory. The normal categories path uses two catalog SELECTs total.
Existing initialization/backfill and IDs remain supported; unchanged catalogs
produce no writes. Roots are still saved before children for the database's
parent-validation trigger. The response query selects only DTO fields.

Privacy middleware already resolves the profile, personal household and consent.
Category endpoints now reuse that request-local context, avoiding a second
provisioning transaction and its three SELECTs. Household membership is still
checked on every request; nothing is cached between users or requests.

## Deployment

Deploy/restart the API normally. No schema changes, stored procedures, migrations,
manual SQL or additional configuration are required for this change. Existing
schema migrations must already be applied. No production deployment was performed.

## Validation

Run with Docker available:

```powershell
dotnet test apps/api/MoneyMentor.Api.IntegrationTests/MoneyMentor.Api.IntegrationTests.csproj --filter "FullyQualifiedName~CategoryPersistenceTests|FullyQualifiedName~PrivacyContextTests"
```

The PostgreSQL regression test checks the initialization query count, catalog
contents, legacy ID preservation and repeat-request writes. The privacy test
checks request-local context reuse. Production latency has not been measured:
compare authenticated requests before/after deployment using the same household,
including cold and warm requests. If latency remains high, inspect database
command durations, connection acquisition, API/database network distance, and
instance cold starts. The reported 23 seconds cannot be attributed entirely to
these code paths without production traces.
