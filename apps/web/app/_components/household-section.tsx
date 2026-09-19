"use client";
import { SectionSkeleton } from "./loading-ui";

import type {
  HouseholdDashboard,
  HouseholdInvitation,
  HouseholdRole,
} from "@/lib/api";
import { Plus, Save, UserPlus } from "lucide-react";
import { FormEvent } from "react";
import { EmptyInline, Field } from "./common-ui";
import { formatDate } from "./workspace-format";

export function HouseholdSection({
  householdName,
  households,
  invitations,
  sentInvitations,
  isSaving,
  memberEmail,
  memberRole,
  onAddMember,
  onCreateHousehold,
  onSaveHouseholdSettings,
  onHouseholdNameChange,
  onInvitationResponse,
  onMemberEmailChange,
  onMemberRoleChange,
  onSelectedHouseholdChange,
  selectedHouseholdId,
  statusMessage,
}: {
  householdName: string;
  households: HouseholdDashboard | null;
  invitations: HouseholdInvitation[];
  sentInvitations: HouseholdInvitation[];
  isSaving: boolean;
  memberEmail: string;
  memberRole: HouseholdRole;
  onAddMember: (event: FormEvent<HTMLFormElement>) => void;
  onCreateHousehold: (event: FormEvent<HTMLFormElement>) => void;
  onSaveHouseholdSettings: (event: FormEvent<HTMLFormElement>) => void;
  onHouseholdNameChange: (value: string) => void;
  onInvitationResponse: (
    invitationId: string,
    response: "accept" | "decline",
  ) => void;
  onMemberEmailChange: (value: string) => void;
  onMemberRoleChange: (role: HouseholdRole) => void;
  onSelectedHouseholdChange: (householdId: string) => void;
  selectedHouseholdId: string | null;
  statusMessage: string | null;
}) {
  if (!households) {
    return <SectionSkeleton />;
  }

  const selectedHousehold = households.households.find(
    (household) => household.id === selectedHouseholdId,
  );
  const canManageSelectedHousehold =
    selectedHousehold?.kind === "Family" &&
    selectedHousehold.canWrite &&
    (selectedHousehold.role === "Owner" || selectedHousehold.role === "Admin");
  const canEditSelectedSettings = Boolean(
    selectedHousehold?.canWrite &&
    (selectedHousehold.role === "Owner" || selectedHousehold.role === "Admin"),
  );

  return (
    <section className="min-h-full overflow-y-auto px-4 py-4 lg:px-0 lg:py-0">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <article className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-normal">
                Household
              </h2>
              <p className="mt-1 text-sm font-medium text-[var(--muted)]">
                Personal is the default scope. Premium entitlement is managed by
                Spndrr support.
              </p>
            </div>
            <span className="rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-xs font-bold text-[var(--accent)]">
              {households.plan}
            </span>
          </div>

          {statusMessage ? (
            <p
              className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"
              role="status"
            >
              {statusMessage}
            </p>
          ) : null}

          {invitations.length > 0 ? (
            <div className="mt-5 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
              <h3 className="text-base font-semibold">Invitations for you</h3>
              <div className="mt-3 grid gap-3">
                {invitations.map((invitation) => (
                  <article
                    className="rounded-lg border border-[var(--border)] bg-white p-3"
                    key={invitation.id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">
                          {invitation.householdName}
                        </p>
                        <p className="mt-1 text-xs font-medium text-[var(--muted)]">
                          {invitation.invitedByDisplayName} invited you as{" "}
                          {invitation.role}. Expires{" "}
                          {formatDate(invitation.expiresAt)}.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="h-9 rounded-lg border border-[var(--border)] bg-white px-3 text-xs font-bold text-[var(--muted)] disabled:opacity-65"
                          disabled={isSaving}
                          onClick={() =>
                            onInvitationResponse(invitation.id, "decline")
                          }
                          type="button"
                        >
                          Decline
                        </button>
                        <button
                          className="h-9 rounded-lg bg-[var(--accent)] px-3 text-xs font-bold text-white disabled:opacity-65"
                          disabled={isSaving}
                          onClick={() =>
                            onInvitationResponse(invitation.id, "accept")
                          }
                          type="button"
                        >
                          Accept
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-5 grid gap-3">
            {households.households.length > 0 ? (
              households.households.map((household) => (
                <button
                  className={`rounded-lg border p-4 text-left transition ${
                    selectedHouseholdId === household.id
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-[var(--border)] bg-[var(--surface)]"
                  }`}
                  key={household.id}
                  onClick={() => onSelectedHouseholdChange(household.id)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">{household.name}</p>
                    <span className="text-xs font-bold text-[var(--muted)]">
                      {household.role}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-[var(--muted)]">
                    {household.memberCount} member
                    {household.memberCount === 1 ? "" : "s"} -{" "}
                    {household.status}
                  </p>
                  <p className="mt-1 text-xs font-medium text-[var(--muted)]">
                    {household.currencyCode} · {household.timeZone}
                  </p>
                </button>
              ))
            ) : (
              <EmptyInline text="No households are available." />
            )}
          </div>

          {sentInvitations.length > 0 ? (
            <div className="mt-5 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
              <h3 className="text-base font-semibold">Sent invitations</h3>
              <div className="mt-3 grid gap-2">
                {sentInvitations.map((invitation) => (
                  <div
                    className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-white p-3"
                    key={invitation.id}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {invitation.email}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {invitation.role} - {invitation.status}
                      </p>
                    </div>
                    <span className="rounded-md bg-[var(--accent-soft)] px-2 py-1 text-xs font-bold text-[var(--accent)]">
                      {invitation.deliveryStatus}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </article>

        <aside className="space-y-5">
          {selectedHousehold ? (
            <form
              className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm"
              key={selectedHousehold.id}
              onSubmit={onSaveHouseholdSettings}
            >
              <h3 className="text-lg font-semibold">Report settings</h3>
              <p className="mt-1 text-sm font-medium text-[var(--muted)]">
                Time zone changes apply to future report windows. Currency locks
                after the first transaction.
              </p>
              <Field label="Currency">
                <input
                  className="form-control uppercase"
                  defaultValue={selectedHousehold.currencyCode}
                  maxLength={3}
                  name="currencyCode"
                  required
                />
              </Field>
              <Field label="IANA time zone">
                <input
                  className="form-control"
                  defaultValue={selectedHousehold.timeZone}
                  name="timeZone"
                  placeholder="Asia/Kolkata"
                  required
                />
              </Field>
              <button
                className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-4 text-sm font-bold text-white disabled:opacity-65"
                disabled={isSaving || !canEditSelectedSettings}
                type="submit"
              >
                <Save className="h-4 w-4" />
                {isSaving ? "Saving..." : "Save report settings"}
              </button>
            </form>
          ) : null}

          <form
            className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm"
            onSubmit={onCreateHousehold}
          >
            <h3 className="text-lg font-semibold">Create household</h3>
            <Field label="Household name">
              <input
                className="form-control"
                onChange={(event) => onHouseholdNameChange(event.target.value)}
                placeholder="Family workspace"
                value={householdName}
              />
            </Field>
            <button
              className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-4 text-sm font-bold text-white disabled:opacity-65"
              disabled={isSaving || !households.canUseHouseholds}
              type="submit"
            >
              <Plus className="h-4 w-4" />
              Create household
            </button>
          </form>

          <form
            className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm"
            onSubmit={onAddMember}
          >
            <h3 className="text-lg font-semibold">Invite member</h3>
            <p className="mt-1 text-sm font-medium text-[var(--muted)]">
              They can accept after signing in with this email.
            </p>
            <Field label="Email">
              <input
                className="form-control"
                onChange={(event) => onMemberEmailChange(event.target.value)}
                placeholder="name@example.com"
                type="email"
                value={memberEmail}
              />
            </Field>
            <Field label="Role">
              <select
                className="form-control"
                onChange={(event) =>
                  onMemberRoleChange(event.target.value as HouseholdRole)
                }
                value={memberRole}
              >
                <option value="Admin">Admin</option>
                <option value="Member">Member</option>
                <option value="Viewer">Viewer</option>
              </select>
            </Field>
            <button
              className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-4 text-sm font-bold text-white disabled:opacity-65"
              disabled={isSaving || !canManageSelectedHousehold}
              type="submit"
            >
              <UserPlus className="h-4 w-4" />
              Send invitation
            </button>
          </form>
        </aside>
      </div>
    </section>
  );
}
