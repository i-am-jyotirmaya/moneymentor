# Backend logging in CloudWatch

The API emits one JSON object per stdout line using the existing .NET console provider and logging abstractions. No AWS credentials or direct CloudWatch API calls are required by logging. OpenTelemetry export remains enabled when configured. Collect stdout with your existing CloudWatch agent, container logging driver, or collector; this change does not provision ingestion infrastructure.

## Fields

| Field | Meaning |
| --- | --- |
| Timestamp, Level | UTC event timestamp and .NET severity |
| Service, Environment | Host application and environment names |
| InstanceId, ProcessId, ProcessRunId | Machine/container name, OS process ID, and unique host-process logging session |
| SourceContext, EventId, EventName | Logger category (normally the originating class) and event identity |
| LogType | Request, Job, or System |
| RequestId | Server-generated HTTP request identifier; also returned in X-Request-ID and exposed through CORS |
| JobName, RunId | Worker name and unique execution-attempt ID; System events use the process logging session as RunId |
| ThreadId | Managed thread emitting this event, captured per call, including after awaits |
| TraceId, SpanId | Current Activity identifiers, when an Activity exists |
| Message, MessageTemplate, Exception | Rendered message, structured template, and escaped exception details |
| Properties | Typed message-template arguments |
| Scope | Structured context inherited from outer to inner logging scopes |

Requests and jobs are correlated independently. Thread IDs can change within one run and can be reused across runs: always start with RequestId or RunId. HTTP lifecycle logs emitted by ASP.NET Core use its RequestId scope. Startup/shutdown and other events outside a request or worker are System events and retain a RunId. No artificial request ID is assigned to them.

Jobs that create a new RunId for each scheduled execution or processing attempt include CommitmentDueWorker, DeletedTransactionPurgeService, GoalPlanningWorker, and InvitationEmailDispatcher. Worker lifecycle events use a worker-level run. Empty polls do not add informational log messages. The contextual judgment workers currently log under their SourceContext without a per-attempt job scope.

Persisted identifiers are separate from attempt IDs: Scope.GoalPlanningRunId and Scope.InvitationId let you follow an item across attempts. Existing message arguments remain under Properties. Use ILogger<T> and structured templates for new logs; wrap new background execution boundaries with BeginJobRun before resolving/calling dependencies, and keep exception logging inside that scope.

The new request completion event uses a route template and excludes query strings, headers, bodies, and route values. Existing framework/library messages retain their existing content; setting their verbosity higher can expose URLs or database diagnostics. Do not log credentials, tokens, email bodies or finance input. Operations command diagnostics use the same JSON format with JobName = Operations.<command>. The CLI intentionally retains its list-command JSON data, usage text, and pre-logging configuration errors as command output rather than log events.

## Logs Insights examples

Select the log group receiving the API's raw JSON lines (Standard class for automatic field discovery).

All job errors:

```sql
fields @timestamp, JobName, RunId, SourceContext, Message, Exception
| filter LogType = "Job" and Level in ["Warning", "Error", "Critical"]
| sort @timestamp desc
```

Follow a request (copy X-Request-ID from the response):

```sql
fields @timestamp, SourceContext, ThreadId, Message
| filter RequestId = "REPLACE_WITH_REQUEST_ID"
| sort @timestamp asc
```

Follow one job attempt, including concurrent lease renewal:

```sql
fields @timestamp, JobName, SourceContext, ThreadId, Message
| filter RunId = "REPLACE_WITH_RUN_ID"
| sort @timestamp asc
```

Find contextual judgment decision worker logs:

```sql
fields @timestamp, SourceContext, Message
| filter SourceContext like /JudgmentDecisionWorker/
| sort @timestamp asc
```

Slow requests:

```sql
fields @timestamp, RequestId, Properties.Route, Properties.StatusCode, Properties.ElapsedMs
| filter LogType = "Request" and Properties.ElapsedMs > 1000
| sort Properties.ElapsedMs desc
```

If your collector wraps stdout in an envelope, configure it to forward the raw message or parse the inner JSON before applying these queries. Keep multiline aggregation disabled for these JSON events; stack traces are escaped in a single event.

## Message capture and Jev diagnostics

History checked against main `1b45c22` and account-aware branch `3c65bd4`:

| Revision | Capture behavior |
| --- | --- |
| `f76ed0b` (September 27) | Introduced the shared Jev client and category calls for captured expenses/income. |
| `0a7b814` (September 28) | Preserved current-policy consent checks when merging the shared categorizer into the architecture branch. |
| `a151646`, `f721234` (September 28) | Added provider/capture metrics and renamed the instruments to `spndrr.*`. |
| October 1 → main `1b45c22` | Capture routing, key binding, consent checks and metric export were not removed. The client gained response model/token metadata. |
| Account-aware branch | Expense/income persistence delegates to `PostgresFinancialEventService`, which retains Jev categorization for eligible events. The former parser incorrectly stripped `upi` before matching accounts; full names/aliases now take precedence. |

This code comparison cannot establish the deployed container's key, consent data, revision, or collector health. A successful ordinary capture with an Uncategorized leaf can result from a missing key, a provider failure/invalid category, or a valid Jev fallback choice. Missing consent on the message API is blocked by the privacy middleware with HTTP 428; non-HTTP writers can still save with deterministic fallback. No outbound attempt means no `spndrr.jev.requests` sample, by design.

At startup, `Jev configuration loaded` reports `JevConfigured` without revealing the key. A nonblank `JEV_API_KEY` overrides `Jev:ApiKey` (environment spelling `Jev__ApiKey`); an empty/whitespace alias no longer erases a configured hierarchical key. Recreate the API container after changing its environment. Existing deployments read their private environment file; this PR does not change secrets.

For one message, copy `X-Request-ID` and run:

```sql
fields @timestamp, SourceContext, Message, Properties.CaptureRoute,
       Properties.AccountResolutionOutcome, Properties.AccountType,
       Properties.HasCurrentAiConsent, Properties.JevConfigured,
       Properties.CategorizationSkipReason, Properties.CategorizationOutcome,
       Properties.SelectedFallbackCategory, Properties.JevOperation,
       Properties.JevOutcome, Properties.JevStatusCode, Properties.JevElapsedMs
| filter RequestId = "REPLACE_WITH_REQUEST_ID"
| sort @timestamp asc
```

Expected ordinary purchase stages: endpoint receipt; intent/expense route; account match; consent and key eligibility; `Jev HTTP request started`; provider completion; categorization outcome; capture commit; endpoint/HTTP completion. Match outcomes distinguish exact names/aliases, trailing-suffix fallback, ambiguity, unavailable IDs and unknown aliases. The persisted account type comes from the saved account, independently of payment channel.

`unconfigured_fallback` and `source_missing_fallback` have no HTTP attempt. `provider_error_fallback` follows an attempted request with an HTTP/network/timeout/response outcome. `jev_selected` with `SelectedFallbackCategory=true` proves Jev chose the catalog's fallback. Linked adjustments, explicit category IDs, neutral movements and duplicate imported references log a skip reason. A privacy block logs `PrivacyGateReason=current_consent_missing` before endpoint processing. These diagnostics exclude finance text, account/category names, provider payloads and credentials.

For metrics, inspect `spndrr.jev.requests` and `spndrr.jev.request.duration` with `operation=categorization`, and `spndrr.capture.categorization` by outcome. If correlated provider logs show attempts but CloudWatch has no matching samples, check the existing `spndrr.telemetry.heartbeat`, metrics collector and its export errors; the category-selection path has already run. JSON logs use the awslogs pipeline separately from OTLP metrics.

## Verification

```sh
dotnet test apps/api/MoneyMentor.Api.IntegrationTests/MoneyMentor.Api.IntegrationTests.csproj --filter FullyQualifiedName~StructuredLoggingTests
```

These tests require no database or Docker. They cover JSON framing and typed properties, source fields, concurrent job scope isolation, child-task thread IDs, nested run restoration, request correlation, and handled HTTP failures. After deployment, call an endpoint, copy X-Request-ID, and use the request query above to verify ingestion end to end.

References: [.NET console formatters](https://learn.microsoft.com/en-us/dotnet/core/extensions/logging/console-log-formatter), [CloudWatch discovered fields](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_AnalyzeLogData-discoverable-fields.html).
