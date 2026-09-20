using System.Collections.Concurrent;
using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using MoneyMentor.Api.Logging;
using MoneyMentor.Infrastructure.Logging;
using Xunit;

namespace MoneyMentor.Api.IntegrationTests;

public sealed class StructuredLoggingTests
{
    [Fact]
    public void Events_are_single_line_json_with_source_typed_properties_and_system_run_id()
    {
        using var provider = new CaptureProvider();
        using var factory = LoggerFactory.Create(builder => builder.AddProvider(provider));
        var logger = factory.CreateLogger("Example.Service");
        logger.LogError(new InvalidOperationException("first\nsecond"), "Failed after {Count} attempts", 3);
        logger.LogInformation("Next event");

        var records = provider.Read();
        var record = records[0];
        Assert.Equal("Example.Service", record.GetProperty("SourceContext").GetString());
        Assert.Equal("Test.Service", record.GetProperty("Service").GetString());
        Assert.Equal("Testing", record.GetProperty("Environment").GetString());
        Assert.Equal("Error", record.GetProperty("Level").GetString());
        Assert.Equal("System", record.GetProperty("LogType").GetString());
        Assert.Equal(3, record.GetProperty("Properties").GetProperty("Count").GetInt32());
        Assert.Equal(Environment.CurrentManagedThreadId, record.GetProperty("ThreadId").GetInt32());
        Assert.Contains("first\nsecond", record.GetProperty("Exception").GetString());
        Assert.False(string.IsNullOrWhiteSpace(record.GetProperty("RunId").GetString()));
        Assert.Equal(record.GetProperty("RunId").GetString(), records[1].GetProperty("RunId").GetString());
        Assert.All(provider.Lines, line => Assert.DoesNotContain('\n', line.TrimEnd('\r', '\n')));
    }

    [Fact]
    public async Task Concurrent_jobs_keep_separate_runs_and_capture_the_emitting_thread()
    {
        using var provider = new CaptureProvider();
        using var factory = LoggerFactory.Create(builder => builder.AddProvider(provider));
        var logger = factory.CreateLogger("Worker");
        var dependency = factory.CreateLogger("Dependency");
        var entered = 0;
        var ready = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        async Task Run(string name)
        {
            using var run = logger.BeginJobRun(name);
            logger.LogInformation("Started");
            if (Interlocked.Increment(ref entered) == 2) ready.SetResult();
            await ready.Task;
            await Task.Run(() => dependency.LogInformation("Child thread {ExpectedThreadId}", Environment.CurrentManagedThreadId));
            logger.LogInformation("Finished");
        }
        await Task.WhenAll(Run("FirstJob"), Run("SecondJob"));
        logger.LogInformation("Outside");

        var records = provider.Read();
        var runs = new HashSet<string>();
        foreach (var name in new[] { "FirstJob", "SecondJob" })
        {
            var events = records.Where(record => record.GetProperty("JobName").GetString() == name).ToArray();
            Assert.Equal(3, events.Length);
            var runId = Assert.Single(events.Select(record => record.GetProperty("RunId").GetString()).Distinct());
            Assert.True(runs.Add(runId!));
            Assert.All(events, record => Assert.Equal("Job", record.GetProperty("LogType").GetString()));
            var child = Assert.Single(events, record => record.GetProperty("SourceContext").GetString() == "Dependency");
            Assert.Equal(child.GetProperty("Properties").GetProperty("ExpectedThreadId").GetInt32(), child.GetProperty("ThreadId").GetInt32());
        }
        Assert.Equal("System", records[^1].GetProperty("LogType").GetString());
    }

    [Fact]
    public void Nested_attempt_restores_parent_scope_and_generates_a_new_id()
    {
        using var provider = new CaptureProvider();
        using var factory = LoggerFactory.Create(builder => builder.AddProvider(provider));
        var logger = factory.CreateLogger("Worker");
        using (logger.BeginJobRun("Scheduler", "parent"))
        {
            using (logger.BeginJobRun("Calculation")) logger.LogInformation("Attempt");
            logger.LogInformation("Parent");
        }
        logger.LogInformation("Outside");
        var records = provider.Read();
        Assert.NotEqual("parent", records[0].GetProperty("RunId").GetString());
        Assert.Equal("Calculation", records[0].GetProperty("JobName").GetString());
        Assert.Equal("parent", records[1].GetProperty("RunId").GetString());
        Assert.Equal("Scheduler", records[1].GetProperty("JobName").GetString());
        Assert.Equal(JsonValueKind.Null, records[2].GetProperty("JobName").ValueKind);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Requests_include_correlation_on_response_and_handled_failures(bool fail)
    {
        using var provider = new CaptureProvider();
        using var server = new TestServer(new WebHostBuilder()
            .ConfigureLogging(builder => builder.ClearProviders().AddProvider(provider))
            .Configure(app =>
            {
                app.UseMiddleware<RequestLoggingMiddleware>();
                app.UseExceptionHandler(error => error.Run(context =>
                {
                    context.Response.StatusCode = 500;
                    return Task.CompletedTask;
                }));
                app.Run(async context =>
                {
                    await Task.Yield();
                    context.RequestServices.GetRequiredService<ILoggerFactory>()
                        .CreateLogger("Endpoint").LogInformation("Request work");
                    if (fail) throw new InvalidOperationException("Test failure");
                    context.Response.StatusCode = 204;
                });
            }));
        using var client = server.CreateClient();
        client.DefaultRequestHeaders.Add("X-Request-ID", "untrusted-client-id");
        var responses = await Task.WhenAll(client.GetAsync("/one"), client.GetAsync("/two"));
        var ids = responses.Select(response => Assert.Single(response.Headers.GetValues("X-Request-ID"))).ToArray();
        Assert.Equal(2, ids.Distinct().Count());
        Assert.DoesNotContain("untrusted-client-id", ids);
        foreach (var response in responses)
        {
            Assert.Equal(fail ? HttpStatusCode.InternalServerError : HttpStatusCode.NoContent, response.StatusCode);
            response.Dispose();
        }
        var records = provider.Read();
        foreach (var id in ids)
        {
            var requestEvents = records.Where(record => record.GetProperty("RequestId").GetString() == id).ToArray();
            Assert.Contains(requestEvents, record => record.GetProperty("SourceContext").GetString() == "Endpoint");
            var completion = Assert.Single(requestEvents, record => record.GetProperty("SourceContext").GetString() == typeof(RequestLoggingMiddleware).FullName);
            Assert.Equal(fail ? 500 : 204, completion.GetProperty("Properties").GetProperty("StatusCode").GetInt32());
            Assert.All(requestEvents, record => Assert.Equal("Request", record.GetProperty("LogType").GetString()));
            if (fail) Assert.Contains(requestEvents, record => record.GetProperty("Exception").ValueKind == JsonValueKind.String);
        }
    }

    private sealed class CaptureProvider : ILoggerProvider, ISupportExternalScope
    {
        private IExternalScopeProvider scopes = new LoggerExternalScopeProvider();
        private readonly CloudWatchConsoleFormatter formatter = new(new TestEnvironment());
        public ConcurrentQueue<string> Lines { get; } = new();
        public ILogger CreateLogger(string categoryName) => new CaptureLogger(this, categoryName);
        public void SetScopeProvider(IExternalScopeProvider scopeProvider) => scopes = scopeProvider;
        public void Dispose() { }
        public JsonElement[] Read() => Lines.Select(line =>
        {
            using var document = JsonDocument.Parse(line);
            return document.RootElement.Clone();
        }).ToArray();

        private sealed class CaptureLogger(CaptureProvider owner, string category) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => owner.scopes.Push(state);
            public bool IsEnabled(LogLevel logLevel) => true;
            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state,
                Exception? exception, Func<TState, Exception?, string> formatter)
            {
                var entry = new LogEntry<TState>(logLevel, category, eventId, state, exception, formatter);
                using var writer = new StringWriter();
                owner.formatter.Write(entry, owner.scopes, writer);
                owner.Lines.Enqueue(writer.ToString());
            }
        }
    }

    private sealed class TestEnvironment : IHostEnvironment
    {
        public string ApplicationName { get; set; } = "Test.Service";
        public string EnvironmentName { get; set; } = "Testing";
        public string ContentRootPath { get; set; } = "";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
