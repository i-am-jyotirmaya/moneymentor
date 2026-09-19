"use client";
import { SectionSkeleton } from "./loading-ui";

import type { TransactionVisibility } from "@/lib/api";
import { Download, Save, Settings } from "lucide-react";
import { FormEvent } from "react";
import { Field, PreferenceToggle } from "./common-ui";
import { ProgressLink as Link } from "./navigation-progress";
import { SettingsForm } from "./workspace-types";

export function SettingsSection({
  deletionConfirmation,
  deletionPassword,
  form,
  isPrivacyWorking,
  isSaving,
  onDeleteAccount,
  onDeletionConfirmationChange,
  onDeletionPasswordChange,
  onExportData,
  onFormChange,
  onSave,
}: {
  deletionConfirmation: string;
  deletionPassword: string;
  form: SettingsForm | null;
  isPrivacyWorking: boolean;
  isSaving: boolean;
  onDeleteAccount: (event: FormEvent<HTMLFormElement>) => void;
  onDeletionConfirmationChange: (value: string) => void;
  onDeletionPasswordChange: (value: string) => void;
  onExportData: () => void;
  onFormChange: (form: SettingsForm) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (!form) {
    return <SectionSkeleton />;
  }

  return (
    <section className="min-h-full overflow-y-auto px-4 py-4 lg:px-0 lg:py-0">
      <form className="grid gap-4 xl:grid-cols-2" onSubmit={onSave}>
        <article className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-normal">
                Settings
              </h2>
              <p className="mt-1 text-sm font-medium text-[var(--muted)]">
                Personalize your tracking preferences.
              </p>
            </div>
            <Settings className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <div className="mt-5 grid gap-4">
            <Field label="Default currency">
              <input
                className="form-control uppercase"
                maxLength={3}
                onChange={(event) =>
                  onFormChange({
                    ...form,
                    currencyCode: event.target.value.toUpperCase(),
                  })
                }
                value={form.currencyCode}
              />
            </Field>
            <Field label="Time zone">
              <input
                className="form-control"
                onChange={(event) =>
                  onFormChange({ ...form, timeZone: event.target.value })
                }
                value={form.timeZone}
              />
            </Field>
            <Field label="Plan">
              <input className="form-control" readOnly value={form.plan} />
              <span className="text-xs font-medium text-[var(--muted)]">
                Entitlements are server-controlled. Contact support for beta
                access changes.
              </span>
            </Field>
            <Field label="Default visibility">
              <select
                className="form-control"
                onChange={(event) =>
                  onFormChange({
                    ...form,
                    defaultTransactionVisibility: event.target
                      .value as TransactionVisibility,
                  })
                }
                value={form.defaultTransactionVisibility}
              >
                <option value="Private">Private</option>
                <option value="Household">Household</option>
              </select>
            </Field>
          </div>
        </article>

        <article className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
          <h3 className="text-base font-semibold">Capture preferences</h3>
          <div className="mt-4 space-y-3">
            <PreferenceToggle
              checked={form.requireMerchantForExpenses}
              description="Ask a follow-up when an expense does not include a merchant."
              label="Require merchant for expenses"
              onChange={(checked) =>
                onFormChange({ ...form, requireMerchantForExpenses: checked })
              }
            />
          </div>
          <button
            className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-4 text-sm font-bold text-white disabled:opacity-65"
            disabled={isSaving}
            type="submit"
          >
            <Save className="h-4 w-4" />
            {isSaving ? "Saving..." : "Save settings"}
          </button>
        </article>
      </form>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <article className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold">Your privacy data</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Download a versioned JSON copy of your profile, consent history,
            memberships, invitations, transactions including trash, and other
            user-owned records.
          </p>
          <button
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-3 text-sm font-bold disabled:opacity-60"
            disabled={isPrivacyWorking}
            onClick={onExportData}
            type="button"
          >
            <Download className="h-4 w-4" /> Export my data
          </button>
          <p className="mt-4 text-sm font-medium text-[var(--muted)]">
            Support:{" "}
            <a
              className="font-bold text-[var(--accent)] underline"
              href={`mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@spndrr.example"}`}
            >
              {process.env.NEXT_PUBLIC_SUPPORT_EMAIL ??
                "support@spndrr.example"}
            </a>
          </p>
          <Link
            className="mt-2 inline-flex text-sm font-bold text-[var(--accent)] underline"
            href="/privacy"
            target="_blank"
          >
            Read the beta privacy policy
          </Link>
        </article>

        <form
          className="rounded-lg border border-red-200 bg-white p-4 shadow-sm"
          onSubmit={onDeleteAccount}
        >
          <h3 className="text-lg font-semibold text-red-800">Delete account</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            This deletes private data and anonymizes eligible shared household
            records. Enter your password and type DELETE.
          </p>
          <Field label="Current password">
            <input
              autoComplete="current-password"
              className="form-control"
              onChange={(event) => onDeletionPasswordChange(event.target.value)}
              required
              type="password"
              value={deletionPassword}
            />
          </Field>
          <Field label="Confirmation">
            <input
              className="form-control"
              onChange={(event) =>
                onDeletionConfirmationChange(event.target.value)
              }
              placeholder="DELETE"
              required
              value={deletionConfirmation}
            />
          </Field>
          <button
            className="mt-4 rounded-lg bg-red-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
            disabled={isPrivacyWorking || deletionConfirmation !== "DELETE"}
            type="submit"
          >
            Delete my account
          </button>
        </form>
      </div>
    </section>
  );
}
