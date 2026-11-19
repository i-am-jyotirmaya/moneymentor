"use client";
import { FinancialAccountsPanel } from "./financial-accounts-panel";
import { SectionSkeleton } from "./loading-ui";

import type { TransactionVisibility } from "@/lib/api";
import { Download, Save, Settings } from "lucide-react";
import { FormEvent } from "react";
import { Field, PreferenceToggle } from "./common-ui";
import { Dropdown } from "./dropdown";
import { PrivacyPolicyLink } from "./privacy-policy-link";
import { SettingsForm } from "./workspace-types";
import { AppearanceControl } from "./appearance";
import { useSpndrrWeb } from "./web-design";
import styles from "./cobalt-settings-reports.module.css";

export function SettingsSection({
  accessToken, householdId, canWrite,
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
  accessToken: string;
  householdId: string | null;
  canWrite: boolean;
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
  const isWeb = useSpndrrWeb();
  if (!form) {
    return <SectionSkeleton />;
  }

  const visibility = (
    <Dropdown
      label="Default visibility"
      onChange={(value) => onFormChange({ ...form, defaultTransactionVisibility: value as TransactionVisibility })}
      options={[{ value: "Private", label: "Private" }, { value: "Household", label: "Household" }]}
      value={form.defaultTransactionVisibility}
    />
  );

  return (
    <section className={`min-h-full overflow-y-auto px-4 py-4 lg:px-0 lg:py-0 ${isWeb ? styles.page : ""}`}>
      {isWeb ? <h1 className={styles.title}>Settings</h1> : null}
      <form className="grid gap-4 xl:grid-cols-2" onSubmit={onSave}>
        <article className="rounded-lg border border-[var(--border)] bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-normal">
                {isWeb ? "Preferences" : "Settings"}
              </h2>
              <p className="mt-1 text-sm font-medium text-[var(--muted)]">
                Personalize your tracking preferences.
              </p>
            </div>
            <Settings className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <div className="mt-5 grid gap-4">
            {isWeb ? <AppearanceControl /> : null}
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
            {!isWeb ? <Field label="Plan">
              <input className="form-control" readOnly value={form.plan} />
              <span className="text-xs font-medium text-[var(--muted)]">
                Entitlements are server-controlled. Contact support for beta
                access changes.
              </span>
            </Field> : null}
            {!isWeb ? visibility : null}
          </div>
        </article>

        <article className="rounded-lg border border-[var(--border)] bg-surface p-4 shadow-sm">
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
            {isWeb ? visibility : null}
          </div>
          <button
            className={`mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold disabled:opacity-65 ${isWeb ? "bg-primary text-on-primary" : "bg-[var(--sp-strong-action,var(--ink))] text-white"}`}
            disabled={isSaving}
            type="submit"
          >
            <Save className="h-4 w-4" />
            {isSaving ? "Saving..." : "Save settings"}
          </button>
        </article>
      </form>

      {isWeb ? <article className="mt-5 rounded-lg border border-outline-variant bg-surface p-4">
        <h2 className="text-lg font-semibold">Plan</h2>
        <p className={styles.plan}><strong>{form.plan} plan</strong><span>Contact support for access changes.</span></p>
      </article> : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <article className="rounded-lg border border-[var(--border)] bg-surface p-4 shadow-sm">
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
          <PrivacyPolicyLink className="mt-2 inline-flex text-sm font-bold text-[var(--accent)] underline">
            Read the beta privacy policy
          </PrivacyPolicyLink>
        </article>

        <form
          className={`rounded-lg border border-red-200 bg-surface p-4 shadow-sm ${isWeb ? styles.dangerPanel : ""}`}
          onSubmit={onDeleteAccount}
        >
          <h3 className="text-lg font-semibold text-danger">Delete account</h3>
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
      <FinancialAccountsPanel key={householdId ?? "personal"} accessToken={accessToken} householdId={householdId} canWrite={canWrite} />
    </section>
  );
}
