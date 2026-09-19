"use client";

import { BrandMarkIcon } from "./icons";
import { WorkspaceSkeleton } from "./loading-ui";
import { ProgressLink as Link } from "./navigation-progress";
import { RegistrationLink } from "./registration-link";

export function WorkspaceError({
  error,
  onRetry,
}: {
  error: string | null;
  isLoading: boolean;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <div
        role="alert"
        className="mb-4 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-3 text-sm font-semibold text-[var(--danger)]"
      >
        <p>{error}</p>
        <button type="button" className="mt-2 underline" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }

  return null;
}

export function SignedOutHome() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] px-5 text-[var(--ink)]">
      <section className="w-full max-w-md rounded-lg border border-[var(--border)] bg-white p-6 text-center shadow-[0_18px_55px_rgba(16,43,38,0.08)]">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-[var(--ink)] text-white">
          <BrandMarkIcon className="h-7 w-7" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-normal">Spndrr</h1>
        <p className="mt-3 text-base font-medium leading-7 text-[var(--muted)]">
          Sign in to use the assistant input workspace.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link
            className="inline-flex h-11 items-center justify-center rounded-lg bg-[var(--ink)] px-4 text-sm font-bold text-white"
            href="/login"
          >
            Login
          </Link>
          <RegistrationLink className="inline-flex h-11 items-center justify-center rounded-lg border border-[var(--border)] bg-white px-4 text-sm font-bold text-[var(--ink)]" />
        </div>
      </section>
    </main>
  );
}

export function LoadingSession() {
  return <WorkspaceSkeleton />;
}

export function PrivacyConsentGate({
  isSaving,
  onAccept,
  onSignOut,
}: {
  isSaving: boolean;
  onAccept: () => void;
  onSignOut: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] px-5 text-[var(--ink)]">
      <section className="w-full max-w-xl rounded-xl border border-[var(--border)] bg-white p-7 shadow-lg">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
          Privacy update
        </p>
        <h1 className="mt-3 text-3xl font-semibold">
          Review the beta privacy policy
        </h1>
        <p className="mt-4 leading-7 text-[var(--muted)]">
          Before finance features reopen, please review and accept version
          2026-07-26-ai-planning.1, which discloses minimized AI goal-planning
          processing. You can still export or delete your account through the
          API without accepting.
        </p>
        <Link
          className="mt-5 inline-flex font-bold text-[var(--accent)] underline"
          href="/privacy"
          target="_blank"
        >
          Read the plain-language policy
        </Link>
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            className="rounded-lg bg-[var(--ink)] px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
            disabled={isSaving}
            onClick={onAccept}
            type="button"
          >
            {isSaving ? "Recording…" : "Accept and continue"}
          </button>
          <button
            className="rounded-lg border border-[var(--border)] px-5 py-3 text-sm font-bold"
            onClick={onSignOut}
            type="button"
          >
            Sign out
          </button>
        </div>
      </section>
    </main>
  );
}
