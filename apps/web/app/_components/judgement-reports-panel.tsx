"use client";

import { useWorkspaceUrl } from "../_hooks/use-workspace-url";
import { LoadingBar } from "./loading-ui";
import {
  ApiError,
  dismissJudgement,
  explainJudgement,
  listActiveJudgements,
  type JudgementReportObservation,
  type JudgementReportScope,
} from "@/lib/api";
import { CheckCircle2, MessageCircle, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

type JudgementReportsPanelProps = {
  accessToken: string;
  householdId: string | null;
  allowHouseholdScope: boolean;
};

export function JudgementReportsPanel({
  accessToken,
  householdId,
  allowHouseholdScope,
}: JudgementReportsPanelProps) {
  const { params, updateQuery } = useWorkspaceUrl();
  const scope: JudgementReportScope =
    allowHouseholdScope && params.get("scope") === "Household" ? "Household" : "Personal";
  const [judgments, setJudgments] = useState<JudgementReportObservation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [explanation, setExplanation] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!householdId) return;
    let active = true;
    const timeout = window.setTimeout(() => {
      setIsLoading(true);
      setError(null);
      void listActiveJudgements(accessToken, { householdId, scope })
        .then((items) => { if (active) setJudgments(items); })
        .catch((caught: unknown) => {
          if (active) setError(message(caught));
        })
        .finally(() => { if (active) setIsLoading(false); });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [accessToken, householdId, scope]);

  async function dismiss(id: string) {
    setSavingId(id);
    setError(null);
    try {
      await dismissJudgement(accessToken, id);
      setJudgments((current) => current.filter((item) => item.id !== id));
      setReplyingTo(null);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setSavingId(null);
    }
  }

  async function explain(id: string) {
    const text = explanation.trim();
    if (text.length < 5 || text.length > 2000) {
      setError("Please write between 5 and 2000 characters.");
      return;
    }
    setSavingId(id);
    setError(null);
    try {
      await explainJudgement(accessToken, id, text);
      setReplyingTo(null);
      setExplanation("");
      setNotice("Your explanation was saved for review and may inform future judgments.");
    } catch (caught) {
      setError(message(caught));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section aria-busy={isLoading} className="min-h-full overflow-y-auto px-4 py-4 lg:px-0 lg:py-0">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--muted)]">Based on your tracked activity</p>
          <h2 className="text-3xl font-semibold tracking-normal">Judgments</h2>
          <p className="mt-1 text-sm font-medium text-[var(--muted)]">
            Patterns worth a closer look. Ordinary spending may produce no judgment.
          </p>
        </div>
        {allowHouseholdScope ? (
          <div aria-label="Judgment scope" className="flex rounded-lg border border-[var(--border)] bg-white p-1">
            {(["Personal", "Household"] as const).map((option) => (
              <button
                aria-pressed={scope === option}
                className={`rounded-md px-4 py-2 text-sm font-semibold ${scope === option ? "bg-[var(--accent)] text-white" : "text-[var(--muted)]"}`}
                key={option}
                onClick={() => { setNotice(null); setReplyingTo(null); updateQuery({ scope: option, cadence: null, period: null }); }}
                type="button"
              >
                {option}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <LoadingBar active={isLoading} />
      {error ? <p role="alert" className="mb-4 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger)]">{error}</p> : null}
      {notice ? <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p> : null}
      {!isLoading && !error && judgments.length === 0 ? (
        <div className="rounded-lg border border-[var(--border)] bg-white p-8 text-center shadow-sm">
          <CheckCircle2 className="mx-auto h-8 w-8 text-[var(--accent)]" />
          <h3 className="mt-3 text-lg font-semibold">Nothing needs your attention right now</h3>
          <p className="mt-2 text-sm text-[var(--muted)]">The engine reviews patterns daily and stays quiet when it has nothing useful to add.</p>
        </div>
      ) : null}
      {!isLoading && judgments.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {judgments.map((item) => (
            <article className="rounded-lg border border-[var(--border)] bg-white p-5 shadow-sm" key={item.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="inline-flex items-center gap-1 rounded-md bg-[var(--surface)] px-2 py-1 text-xs font-semibold text-[var(--muted)]">
                    <Sparkles className="h-3 w-3" /> {item.decisionAction ?? "Observation"}
                  </span>
                  <h3 className="mt-3 text-lg font-semibold">{item.title}</h3>
                </div>
                {item.value ? <span className="text-sm font-bold">{item.value}</span> : null}
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{item.message}</p>
              {item.followUpQuestion ? <p className="mt-3 text-sm font-semibold">{item.followUpQuestion}</p> : null}
              {replyingTo === item.id ? (
                <div className="mt-4 space-y-2">
                  <label className="block text-sm font-semibold" htmlFor={`explanation-${item.id}`}>Your explanation</label>
                  <textarea
                    className="min-h-24 w-full rounded-lg border border-[var(--border)] p-3 text-sm"
                    id={`explanation-${item.id}`}
                    maxLength={2000}
                    onChange={(event) => setExplanation(event.target.value)}
                    placeholder="Was this planned, temporary, or reimbursable?"
                    value={explanation}
                  />
                  <div className="flex gap-2">
                    <button className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={savingId !== null} onClick={() => void explain(item.id)} type="button">Send explanation</button>
                    <button className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold" onClick={() => { setReplyingTo(null); setExplanation(""); }} type="button">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold" onClick={() => { setExplanation(""); setNotice(null); setReplyingTo(item.id); }} type="button"><MessageCircle className="h-4 w-4" /> Add context</button>
                  <button className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={savingId !== null} onClick={() => void dismiss(item.id)} type="button">Dismiss</button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function message(error: unknown) {
  if (error instanceof ApiError) return error.errors[0] ?? error.message;
  return "Could not update judgments. Please try again.";
}
