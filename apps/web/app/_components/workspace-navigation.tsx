"use client";

import type { HouseholdDashboard, UserPlan } from "@/lib/api";
import { Bot, LogOut, Menu, Users, X } from "lucide-react";
import { useWorkspaceUrl } from "../_hooks/use-workspace-url";
import { SidebarStat } from "./common-ui";
import { BrandMarkIcon } from "./icons";
import { ProgressLink as Link } from "./navigation-progress";
import { navItems, sectionLabel } from "./workspace-config";
import { formatMoney } from "./workspace-format";
import { AppSection } from "./workspace-types";

export function DesktopSidebar({
  activeSection,
  currencyCode,
  income,
  onSignOut,
  plan,
  saved,
  sessionEmail,
  sessionName,
  spends,
}: {
  activeSection: Exclude<AppSection, "home">;
  currencyCode: string;
  income: number;
  onSignOut: () => void;
  plan: UserPlan;
  saved: number;
  sessionEmail: string;
  sessionName: string;
  spends: number;
}) {
  const { params } = useWorkspaceUrl();
  const query = params.get("household")
    ? `?household=${encodeURIComponent(params.get("household")!)}`
    : "";
  return (
    <aside className="hidden w-[272px] shrink-0 border-r border-white/10 bg-[var(--sidebar)] px-5 py-6 text-white lg:flex lg:min-h-0 lg:flex-col">
      <Link className="flex items-center gap-3" href="/">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-white text-[var(--sidebar)]">
          <BrandMarkIcon className="h-6 w-6" />
        </span>
        <span className="text-lg font-semibold">Spndrr</span>
      </Link>

      <nav className="mt-9 space-y-1" aria-label="Desktop navigation">
        {navItems.map((item) => (
          <SidebarButton
            active={activeSection === item.section}
            icon={item.icon}
            key={item.section}
            label={item.label}
            href={`/${item.section}${query}`}
          />
        ))}
      </nav>

      <div className="mt-8 rounded-lg border border-white/12 bg-white/[0.06] p-4">
        <p className="text-xs font-semibold uppercase text-white/50">
          This month
        </p>
        <div className="mt-4 space-y-3">
          <SidebarStat
            label="Income"
            value={formatMoney(income, currencyCode)}
          />
          <SidebarStat
            label="Spends"
            value={formatMoney(spends, currencyCode)}
          />
          <SidebarStat label="Saved" value={formatMoney(saved, currencyCode)} />
          <SidebarStat label="Plan" value={plan} />
        </div>
      </div>

      <div className="mt-auto rounded-lg border border-white/12 bg-white/[0.06] p-4">
        <p className="text-sm font-semibold">{sessionName}</p>
        <p className="mt-1 break-words text-xs font-medium text-white/54">
          {sessionEmail}
        </p>
        <button
          className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-white px-3 text-sm font-bold text-[var(--sidebar)] transition hover:bg-[var(--mint)]"
          onClick={onSignOut}
          type="button"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

export function SidebarButton({
  active,
  icon: Icon,
  label,
  href,
}: {
  active: boolean;
  icon: typeof Bot;
  label: string;
  href: string;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-semibold transition ${
        active
          ? "bg-white text-[var(--sidebar)]"
          : "text-white/72 hover:bg-white/10 hover:text-white"
      }`}
      href={href}
    >
      <Icon className="h-5 w-5" />
      <span>{label}</span>
    </Link>
  );
}

export function MobileHeader({
  activeSection,
  greetingName,
  onMenuOpen,
}: {
  activeSection: Exclude<AppSection, "home">;
  greetingName: string;
  onMenuOpen: () => void;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--border)] bg-white/88 px-4 backdrop-blur lg:hidden">
      <button
        aria-label="Open menu"
        className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--border)] bg-white text-[var(--ink)]"
        onClick={onMenuOpen}
        type="button"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="min-w-0 text-center">
        <p className="text-xs font-semibold text-[var(--muted)]">
          Welcome, {greetingName}
        </p>
        <h1 className="truncate text-lg font-semibold tracking-normal">
          {sectionLabel(activeSection)}
        </h1>
      </div>
      <span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--ink)] text-white">
        <BrandMarkIcon className="h-6 w-6" />
      </span>
    </header>
  );
}

export function MobileMenu({
  activeSection,
  onClose,
  onSignOut,
  open,
  sessionEmail,
  sessionName,
}: {
  activeSection: Exclude<AppSection, "home">;
  onClose: () => void;
  onSignOut: () => void;
  open: boolean;
  sessionEmail: string;
  sessionName: string;
}) {
  const { params } = useWorkspaceUrl();
  const query = params.get("household")
    ? `?household=${encodeURIComponent(params.get("household")!)}`
    : "";
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/28 lg:hidden"
      role="presentation"
    >
      <aside
        aria-label="Mobile menu"
        className="flex h-full w-[min(84vw,340px)] flex-col bg-white p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--ink)] text-white">
              <BrandMarkIcon className="h-6 w-6" />
            </span>
            <span className="text-base font-semibold">Spndrr</span>
          </div>
          <button
            aria-label="Close menu"
            className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--border)]"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="mt-8 space-y-2" aria-label="Mobile navigation">
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                aria-current={
                  activeSection === item.section ? "page" : undefined
                }
                className={`flex h-12 w-full items-center gap-3 rounded-lg border px-3 text-sm font-bold transition ${
                  activeSection === item.section
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--border)] bg-white text-[var(--ink)]"
                }`}
                key={item.section}
                href={`/${item.section}${query}`}
                onClick={onClose}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-sm font-semibold">{sessionName}</p>
          <p className="mt-1 break-words text-xs font-medium text-[var(--muted)]">
            {sessionEmail}
          </p>
          <button
            className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-3 text-sm font-bold text-white"
            onClick={onSignOut}
            type="button"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>
    </div>
  );
}

export function HouseholdScopeSelector({
  households,
  onChange,
  selectedHouseholdId,
}: {
  households: HouseholdDashboard | null;
  onChange: (householdId: string) => void;
  selectedHouseholdId: string | null;
}) {
  if (!households || households.households.length === 0) return null;
  const selected = households.households.find(
    (household) => household.id === selectedHouseholdId,
  );
  return (
    <div className="mb-4 flex shrink-0 items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-white px-4 py-3 shadow-sm lg:mb-5">
      <label className="flex min-w-0 items-center gap-3 text-sm font-semibold">
        <Users className="h-4 w-4 shrink-0 text-[var(--accent)]" />
        <span className="hidden sm:inline">Household</span>
        <select
          className="min-w-0 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none"
          onChange={(event) => onChange(event.target.value)}
          value={selectedHouseholdId ?? households.defaultHouseholdId}
        >
          {households.households.map((household) => (
            <option key={household.id} value={household.id}>
              {household.name} ({household.kind})
            </option>
          ))}
        </select>
      </label>
      <span
        className={`rounded-md px-2 py-1 text-xs font-bold ${selected?.canWrite ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
      >
        {selected?.canWrite ? "Can write" : "Read only"}
      </span>
    </div>
  );
}

export function MobileBottomNav({
  activeSection,
  onMore,
}: {
  activeSection: Exclude<AppSection, "home">;
  onMore: () => void;
}) {
  const { params } = useWorkspaceUrl();
  const query = params.get("household")
    ? `?household=${encodeURIComponent(params.get("household")!)}`
    : "";
  return (
    <nav
      aria-label="Quick navigation"
      className="grid shrink-0 grid-cols-4 border-t border-[var(--border)] bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {(["assistant", "transactions", "dashboard"] as const).map((section) => {
        const item = navItems.find((item) => item.section === section)!;
        const Icon = item.icon;
        return (
          <Link
            key={section}
            href={`/${section}${query}`}
            aria-current={activeSection === section ? "page" : undefined}
            className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold ${activeSection === section ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--muted)]"}`}
          >
            <Icon className="h-5 w-5" />
            {section === "assistant" ? "Track" : item.label}
          </Link>
        );
      })}
      <button
        onClick={onMore}
        className="flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold text-[var(--muted)]"
        type="button"
      >
        <Menu className="h-5 w-5" />
        More
      </button>
    </nav>
  );
}
