"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useSyncExternalStore } from "react";

export function validMonth(value: string | null) {
  return value && /^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(value)
    ? value
    : undefined;
}

export function validPage(value: string | null) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 && page <= 100000 ? page : 1;
}

export function useWorkspaceUrl() {
  const pathname = usePathname();
  const params = useSearchParams();
  const updateQuery = useCallback(
    (values: Record<string, string | null>, hash?: string) => {
      const url = new URL(window.location.href);
      for (const [key, value] of Object.entries(values)) {
        if (value === null) url.searchParams.delete(key);
        else url.searchParams.set(key, value);
      }
      if (hash !== undefined) url.hash = hash;
      if (url.href !== window.location.href) {
        // Next integrates the native History API with useSearchParams. Filters do
        // not need a server round trip, and Back/Forward still restore the view.
        window.history.pushState(
          null,
          "",
          url.pathname + url.search + url.hash,
        );
        window.dispatchEvent(new Event("workspace:hashchange"));
      }
    },
    [],
  );
  return { pathname, params, updateQuery };
}

function subscribeHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  window.addEventListener("popstate", callback);
  window.addEventListener("workspace:hashchange", callback);
  return () => {
    window.removeEventListener("hashchange", callback);
    window.removeEventListener("popstate", callback);
    window.removeEventListener("workspace:hashchange", callback);
  };
}
export function useUrlHash() {
  return useSyncExternalStore(
    subscribeHash,
    () => window.location.hash,
    () => "",
  );
}

function subscribeViewport(callback: () => void) {
  const media = window.matchMedia("(min-width: 1024px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
export function useDesktopViewport() {
  return useSyncExternalStore(
    subscribeViewport,
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => false,
  );
}
