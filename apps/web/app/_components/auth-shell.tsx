import Link from "next/link";
import styles from "./auth.module.css";
import { BrandLogo } from "./brand-logo";

export function WebAuthShell({
  children,
  signup = false,
}: {
  children: React.ReactNode;
  signup?: boolean;
}) {
  return (
    <main className={styles.shell}>
      <div className={styles.layout}>
        <div className={styles.intro}>
          <svg aria-hidden="true" className={styles.slice} viewBox="0 0 88 88">
            <path d="M41 6 A41 41 0 1 0 82 47 L41 47 Z M47 0 A41 41 0 0 1 88 41 L47 41 Z" />
          </svg>
          <Link className={styles.brand} href="/login">
            <picture>
              <source media="(prefers-color-scheme: dark)" srcSet="/brand/cobalt-slice/spndrr-logo-dark.svg" />
              <BrandLogo revamp />
            </picture>
          </Link>
          <p className={styles.promise}>
            {signup ? "Start tracking in plain words." : "Know where every rupee goes."}
          </p>
          {!signup && (
            <p className={styles.description}>
              Type what you spent. Spndrr sorts it, charts it and tells you when
              something drifts.
            </p>
          )}
        </div>
        {children}
      </div>
    </main>
  );
}

// Static public content stays in the server component graph.
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-shell min-h-screen px-5 py-6 text-[var(--ink)] sm:px-8 lg:px-10">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,460px)]">
        <section className="hidden lg:block">
          <Link
            className="inline-flex items-center gap-3 rounded-lg text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            href="/login"
          >
            <BrandLogo />
          </Link>

          <div className="mt-16 max-w-xl">
            <h1 className="text-5xl font-semibold leading-tight tracking-normal text-[var(--ink)]">
              A calm place to tell your money what happened.
            </h1>
            <p className="mt-5 max-w-lg text-lg font-medium leading-8 text-[var(--muted)]">
              Sign in, type naturally, and let Spndrr turn quick notes into
              clear finance drafts before anything is saved.
            </p>
          </div>

          <div className="mt-12 grid max-w-xl grid-cols-3 gap-3">
            {["Natural input", "Draft first", "Private by default"].map(
              (item) => (
                <div
                  className="rounded-lg border border-[var(--border)] bg-white p-4 text-sm font-semibold text-[var(--ink)] shadow-sm"
                  key={item}
                >
                  {item}
                </div>
              ),
            )}
          </div>
        </section>
        {children}
      </div>
    </main>
  );
}
