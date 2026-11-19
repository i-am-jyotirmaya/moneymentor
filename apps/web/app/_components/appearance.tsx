"use client";

import { useEffect, useState } from "react";

type Appearance = "system" | "light" | "dark";
export const appearanceKey = "spndrr-appearance";

function readAppearance(): Appearance {
  try {
    const value = localStorage.getItem(appearanceKey);
    if (value === "light" || value === "dark") return value;
  } catch {
    // The current tab can still change appearance with storage disabled.
  }
  return "system";
}

function applyAppearance(preference: Appearance) {
  const root = document.documentElement;
  if (preference === "system") delete root.dataset.appearance;
  else root.dataset.appearance = preference;

  const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  if (meta) meta.content = preference === "system" ? "light dark" : preference;

  // Older browsers use the resolved palette in the shared stylesheet.
  if (!CSS.supports("color", "light-dark(white, black)")) {
    root.dataset.theme = preference === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : preference;
  }
}

export function AppearanceSync() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => applyAppearance(readAppearance());
    const onStorage = (event: StorageEvent) => {
      if (event.key === appearanceKey || event.key === null) sync();
    };
    sync();
    media.addEventListener("change", sync);
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return null;
}

export function AppearanceControl() {
  const [preference, setPreference] = useState<Appearance>("system");
  useEffect(() => {
    const sync = () => setPreference(readAppearance());
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  return (
    <label className="grid gap-2 text-sm font-semibold">
      Appearance
      <select
        className="form-control"
        value={preference}
        onChange={(event) => {
          const next = event.target.value as Appearance;
          setPreference(next);
          applyAppearance(next);
          try {
            if (next === "system") localStorage.removeItem(appearanceKey);
            else localStorage.setItem(appearanceKey, next);
          } catch {
            // Keep the change applied for this page when storage is unavailable.
          }
        }}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
