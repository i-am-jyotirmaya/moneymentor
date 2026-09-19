import "server-only";
import { RegistrationLink } from "./registration-link";

export async function ServerRegistrationLink() {
  let isOpen: boolean | undefined;
  try {
    const base =
      process.env.API_BASE_URL ??
      process.env.NEXT_PUBLIC_API_BASE_URL ??
      "http://localhost:5267";
    const response = await fetch(
      `${base.replace(/\/$/, "")}/api/auth/registration`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      },
    );
    if (response.ok) isOpen = (await response.json()).mode === "Open";
  } catch {
    /* Fail closed when registration settings are unavailable. */
  }
  return (
    <RegistrationLink
      className="rounded-lg px-3 py-2 text-[var(--accent)] outline-none transition hover:bg-[var(--accent-soft)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      initialIsOpen={isOpen}
    />
  );
}
