# Backend logging in CloudWatch

The API emits one JSON object per stdout line using the existing .NET console provider. No additional NuGet packages, AWS credentials, or direct CloudWatch API calls are required by logging. OpenTelemetry export remains enabled when configured. Collect stdout with your existing CloudWatch agent, container logging driver, or collector; this change does not provision ingestion infrastructure.

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

Workers covered: CommitmentDueWorker, DeletedTransactionPurgeService, GoalPlanningWorker, InvitationEmailDispatcher, JudgementReportSchedulerWorker, JudgementReportCalculationWorker, and JudgementReportNarrationWorker. Each scheduled execution/poll/processing attempt gets a new RunId. Nested judgement work attempts get their own ID; lease renewal inherits that attempt's scope. Worker lifecycle events use a worker-level run. Empty polls do not add informational log messages.

Persisted identifiers are separate from attempt IDs: Scope.GoalPlanningRunId, Scope.InvitationId, Scope.JudgementWorkItemId, Scope.JudgementWorkStage and Scope.Generation let you follow an item across attempts. Existing message arguments remain under Properties. Use ILogger<T> and structured templates for new logs; wrap new background execution boundaries with BeginJobRun before resolving/calling dependencies, and keep exception logging inside that scope.

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

Follow a persisted work item across attempts:

```sql
fields @timestamp, RunId, Scope.JudgementWorkStage, Scope.Generation, Message
| filter Scope.JudgementWorkItemId = "REPLACE_WITH_WORK_ITEM_ID"
| sort @timestamp asc
```

Slow requests:

```sql
fields @timestamp, RequestId, Properties.Route, Properties.StatusCode, Properties.ElapsedMs
| filter LogType = "Request" and Properties.ElapsedMs > 1000
| sort Properties.ElapsedMs desc
```

If your collector wraps stdout in an envelope, configure it to forward the raw message or parse the inner JSON before applying these queries. Keep multiline aggregation disabled for these JSON events; stack traces are escaped in a single event.

## Verification

```sh
dotnet test apps/api/MoneyMentor.Api.IntegrationTests/MoneyMentor.Api.IntegrationTests.csproj --filter FullyQualifiedName~StructuredLoggingTests
```

These tests require no database or Docker. They cover JSON framing and typed properties, source fields, concurrent job scope isolation, child-task thread IDs, nested run restoration, request correlation, and handled HTTP failures. After deployment, call an endpoint, copy X-Request-ID, and use the request query above to verify ingestion end to end.

References: [.NET console formatters](https://learn.microsoft.com/en-us/dotnet/core/extensions/logging/console-log-formatter), [CloudWatch discovered fields](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_AnalyzeLogData-discoverable-fields.html).
