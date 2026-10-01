"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { filterDropdownRows, flattenDropdownOptions, type DropdownOption, type DropdownRow } from "./dropdown-options";

export type { DropdownOption } from "./dropdown-options";

export type DropdownProps = {
  label: string;
  options: readonly DropdownOption[];
  value: string | null;
  onChange: (value: string, option: DropdownOption) => void;
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  searchLabel?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  noResultsMessage?: string;
  className?: string;
  triggerClassName?: string;
  panelClassName?: string;
  maxPanelHeight?: number;
  renderOption?: (option: DropdownOption, state: { depth: number; selected: boolean }) => ReactNode;
  renderValue?: (option: DropdownOption, path: string) => ReactNode;
};

export function Dropdown({
  label, options, value, onChange, placeholder = "Choose an option", disabled = false,
  searchable = false, searchLabel = `Search ${label.toLowerCase()}`,
  searchPlaceholder = "Search options", emptyMessage = "No options available.",
  noResultsMessage = "No matching options.", className = "", triggerClassName = "",
  panelClassName = "", maxPanelHeight = 320, renderOption, renderValue,
}: DropdownProps) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const typeAhead = useRef({ text: "", time: 0 });
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [activeValue, setActiveValue] = useState<string | null>(null);
  const [wasDisabled, setWasDisabled] = useState(disabled);
  if (wasDisabled !== disabled) {
    setWasDisabled(disabled);
    if (disabled) { setHost(null); setQuery(""); }
  }
  const open = host !== null && !disabled;
  const rows = flattenDropdownOptions(options);
  const filtered = filterDropdownRows(rows, searchable && open ? query : "");
  const enabled = filtered.filter((row) => row.selectable && !row.disabled);
  const selected = rows.find((row) => row.selectable && row.option.value === value);
  const active = enabled.find((row) => row.option.value === activeValue) ?? enabled[0];
  const optionId = (row: DropdownRow) => `${id}-option-${rows.findIndex((item) => item.option.value === row.option.value)}`;

  function close(restoreFocus = false) {
    setHost(null);
    setQuery("");
    if (restoreFocus) triggerRef.current?.focus();
  }

  function show(last = false) {
    if (disabled) return;
    typeAhead.current = { text: "", time: 0 };
    setQuery("");
    const enabledRows = rows.filter((row) => row.selectable && !row.disabled);
    const current = enabledRows.find((row) => row.option.value === value);
    setActiveValue((current ?? (last ? enabledRows.at(-1) : enabledRows[0]))?.option.value ?? null);
    // A modal makes the rest of the document inert; keep the portal inside it.
    setHost(triggerRef.current?.closest("dialog") ?? document.body);
  }

  function select(row: DropdownRow) {
    if (!row.selectable || row.disabled) return;
    onChange(row.option.value, row.option);
    close(true);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === "Tab") {
      // Start Tab navigation at the trigger so the next form field receives focus.
      close(true);
      return;
    }
    const inSearch = event.target === searchRef.current;
    if ((event.key === "Home" || event.key === "End") && inSearch) return;
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (!open) {
        show(event.key === "ArrowUp" || event.key === "End");
        return;
      }
      const index = enabled.findIndex((row) => row === active);
      const next = event.key === "Home" ? 0 : event.key === "End" ? enabled.length - 1 :
        (index + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) % enabled.length;
      setActiveValue(enabled[next]?.option.value ?? null);
    } else if (open && (event.key === "Enter" || (event.key === " " && !inSearch))) {
      event.preventDefault();
      if (active) select(active);
    } else if (!searchable && event.key.length === 1 && event.key !== " " &&
      !event.altKey && !event.ctrlKey && !event.metaKey) {
      const key = event.key.toLocaleLowerCase();
      const now = event.timeStamp;
      const previous = now - typeAhead.current.time < 700 ? typeAhead.current.text : "";
      const repeated = previous === key;
      const text = repeated ? key : previous + key;
      typeAhead.current = { text, time: now };
      const items = rows.filter((row) => row.selectable && !row.disabled);
      const current = items.findIndex((row) => row.option.value === (open ? active?.option.value : value));
      const ordered = repeated ? [...items.slice(current + 1), ...items.slice(0, current + 1)] : items;
      const match = ordered.find((row) => row.option.label.toLocaleLowerCase().startsWith(text));
      if (match) {
        event.preventDefault();
        if (open) setActiveValue(match.option.value);
        else onChange(match.option.value, match.option);
      }
    }
  }

  useLayoutEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const trigger = triggerRef.current;
    if (!panel || !trigger) return;
    // Popover puts the panel above clipping/scroll containers and the modal.
    panel.showPopover?.();
    function position() {
      if (!panel || !trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewport = window.visualViewport;
      const topEdge = (viewport?.offsetTop ?? 0) + 8;
      const bottomEdge = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - 8;
      const leftEdge = (viewport?.offsetLeft ?? 0) + 8;
      const rightEdge = (viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth) - 8;
      const width = Math.min(Math.max(rect.width, 220), rightEdge - leftEdge);
      panel.style.width = `${Math.max(0, width)}px`;
      const below = Math.max(0, bottomEdge - rect.bottom - 6);
      const above = Math.max(0, rect.top - topEdge - 6);
      const desired = Math.min(maxPanelHeight, panel.scrollHeight);
      const upward = below < desired && above > below;
      const height = Math.max(0, Math.min(maxPanelHeight, upward ? above : below));
      panel.style.maxHeight = `${height}px`;
      panel.style.left = `${Math.max(leftEdge, Math.min(rect.left, rightEdge - width))}px`;
      panel.style.top = `${upward ? Math.max(topEdge, rect.top - Math.min(panel.scrollHeight, height) - 6) : rect.bottom + 6}px`;
    }
    position();
    (searchable ? searchRef.current : listRef.current)?.focus({ preventScroll: true });
    const observer = new ResizeObserver(position);
    observer.observe(trigger);
    observer.observe(panel);
    window.addEventListener("resize", position);
    document.addEventListener("scroll", position, true);
    window.visualViewport?.addEventListener("resize", position);
    window.visualViewport?.addEventListener("scroll", position);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      document.removeEventListener("scroll", position, true);
      window.visualViewport?.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("scroll", position);
    };
  }, [open, searchable, maxPanelHeight]);

  useEffect(() => {
    if (!open) return;
    function outside(event: Event) {
      const target = event.target as Node | null;
      if (target && !panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setHost(null);
        setQuery("");
      }
    }
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", outside);
    };
  }, [open]);

  useEffect(() => {
    if (open && active) document.getElementById(`${id}-option-${rows.findIndex((item) => item.option.value === active.option.value)}`)?.scrollIntoView({ block: "nearest" });
  });

  const panel = open ? (
    <div
      className={`z-50 m-0 flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-white p-1.5 text-[var(--ink)] shadow-xl shadow-slate-950/15 ${panelClassName}`}
      onKeyDown={handleKeyDown}
      popover="manual"
      ref={panelRef}
      style={{ position: "fixed", maxHeight: maxPanelHeight }}
    >
      {searchable ? (
        <div className="relative mb-1.5 shrink-0 border-b border-[var(--border)] pb-1.5">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[var(--muted)]" />
          <input
            aria-activedescendant={active ? optionId(active) : undefined}
            aria-controls={`${id}-list`}
            aria-label={searchLabel}
            className="h-10 w-full rounded-lg bg-[var(--surface)] pr-3 pl-9 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
            onChange={(event) => { setQuery(event.target.value); setActiveValue(null); }}
            placeholder={searchPlaceholder}
            ref={searchRef}
            type="search"
            value={query}
          />
        </div>
      ) : null}
      <div
        aria-activedescendant={active ? optionId(active) : undefined}
        aria-label={`${label} options`}
        className="min-h-0 overflow-y-auto overscroll-contain outline-none"
        id={`${id}-list`}
        ref={listRef}
        role="listbox"
        tabIndex={-1}
      >
        {filtered.map((row) => row.selectable ? (
          <div
            aria-disabled={row.disabled || undefined}
            aria-label={row.path}
            aria-selected={row.option.value === value}
            className={`flex min-h-10 items-center gap-2 rounded-lg py-2 pr-3 text-sm ${row.disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer"} ${row === active ? "bg-[var(--surface)] ring-1 ring-inset ring-[var(--border)]" : ""} ${row.option.value === value ? "font-semibold text-[var(--accent)]" : ""}`}
            id={optionId(row)}
            key={row.option.value}
            onClick={() => select(row)}
            onPointerMove={() => { if (!row.disabled) setActiveValue(row.option.value); }}
            onPointerDown={(event) => event.preventDefault()}
            role="option"
            style={{ paddingLeft: 12 + row.depth * 16 }}
          >
            <div className="min-w-0 flex-1">
              {renderOption ? renderOption(row.option, { depth: row.depth, selected: row.option.value === value }) : (
                <>
                  <span className="block break-words">{row.option.label}</span>
                  {row.option.description ? <span className="block text-xs text-[var(--muted)]">{row.option.description}</span> : null}
                </>
              )}
            </div>
            {row.option.value === value ? <Check aria-hidden="true" className="h-4 w-4 shrink-0" /> : null}
          </div>
        ) : (
          <div className="pt-3 pb-1 text-xs font-bold text-[var(--muted)]" key={row.option.value} role="presentation" style={{ paddingLeft: 12 + row.depth * 16 }}>
            {row.option.label}
          </div>
        ))}
        {filtered.every((row) => !row.selectable) ? <p className="px-3 py-5 text-sm text-[var(--muted)]" role="status">{rows.some((row) => row.selectable) ? noResultsMessage : emptyMessage}</p> : null}
      </div>
    </div>
  ) : null;

  return (
    <div className={`space-y-2 ${className}`}>
      <label className="block text-sm font-semibold" htmlFor={`${id}-trigger`}>{label}</label>
      <button
        aria-controls={open ? `${id}-list` : undefined}
        aria-describedby={`${id}-value`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={label}
        className={`form-control flex items-center justify-between gap-3 text-left disabled:cursor-not-allowed disabled:opacity-50 ${triggerClassName}`}
        disabled={disabled}
        id={`${id}-trigger`}
        onClick={() => open ? close(true) : show()}
        onKeyDown={handleKeyDown}
        ref={triggerRef}
        role="combobox"
        type="button"
      >
        <span className="min-w-0 flex-1 truncate" id={`${id}-value`}>{selected ? (renderValue?.(selected.option, selected.path) ?? selected.path) : placeholder}</span>
        <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-[var(--muted)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {panel && host ? createPortal(panel, host) : null}
    </div>
  );
}
