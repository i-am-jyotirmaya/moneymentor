using System.Collections.Concurrent;
using System.Diagnostics.Metrics;
using MoneyMentor.Application.Telemetry;
using MoneyMentor.Infrastructure.JudgementReports;
using Xunit;

namespace MoneyMentor.Api.IntegrationTests;

public sealed class JudgmentAnalysisRunMetricsTests
{
    [Fact]
    public async Task Empty_analysis_still_reports_a_successful_run_and_duration()
    {
        var events = new ConcurrentQueue<(string Name, string Outcome, double Value)>();
        using var listener = Listen(events);

        await JudgmentAnalysisRunMetrics.RunAsync(_ => Task.CompletedTask, CancellationToken.None);

        Assert.Contains(events, item => item.Name == "spndrr.job.runs"
            && item.Outcome == "success" && item.Value == 1);
        Assert.Contains(events, item => item.Name == "spndrr.job.run_duration"
            && item.Outcome == "success" && item.Value >= 0);
    }

    [Fact]
    public async Task Failed_and_cancelled_analyses_report_their_outcomes()
    {
        var events = new ConcurrentQueue<(string Name, string Outcome, double Value)>();
        using var listener = Listen(events);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            JudgmentAnalysisRunMetrics.RunAsync(_ => throw new InvalidOperationException(), CancellationToken.None));

        using var cancelled = new CancellationTokenSource();
        cancelled.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            JudgmentAnalysisRunMetrics.RunAsync(token => Task.FromCanceled(token), cancelled.Token));

        Assert.Contains(events, item => item.Name == "spndrr.job.runs"
            && item.Outcome == "failure" && item.Value == 1);
        Assert.Contains(events, item => item.Name == "spndrr.job.runs"
            && item.Outcome == "cancelled" && item.Value == 1);
        Assert.Contains(events, item => item.Name == "spndrr.job.run_duration" && item.Outcome == "failure");
        Assert.Contains(events, item => item.Name == "spndrr.job.run_duration" && item.Outcome == "cancelled");
    }

    private static MeterListener Listen(ConcurrentQueue<(string Name, string Outcome, double Value)> events)
    {
        var listener = new MeterListener();
        listener.InstrumentPublished = (instrument, current) =>
        {
            if (instrument.Meter.Name == MoneyMentorTelemetry.SourceName
                && instrument.Name is ("spndrr.job.runs" or "spndrr.job.run_duration"))
                current.EnableMeasurementEvents(instrument);
        };
        listener.SetMeasurementEventCallback<long>((instrument, value, tags, _) => Add(instrument, value, tags));
        listener.SetMeasurementEventCallback<double>((instrument, value, tags, _) => Add(instrument, value, tags));
        listener.Start();
        return listener;

        void Add(Instrument instrument, double value, ReadOnlySpan<KeyValuePair<string, object?>> tags)
        {
            string? job = null, outcome = null;
            foreach (var tag in tags)
            {
                if (tag.Key == "job") job = tag.Value?.ToString();
                if (tag.Key == "outcome") outcome = tag.Value?.ToString();
                Assert.DoesNotContain(tag.Key, new[] { "user_id", "household_id", "RunId" });
            }
            if (job == "judgment_candidate_analysis" && outcome is not null)
                events.Enqueue((instrument.Name, outcome, value));
        }
    }
}
