"use client";

import { ApiError, getRegistration, validateSignupInvitation } from "@/lib/api";
import { useEffect, useState } from "react";
import { AuthForm } from "./auth-form";
import { AuthShell, WebAuthShell } from "./auth-shell";
import styles from "./auth.module.css";
import { SectionSkeleton } from "./loading-ui";
import {
  ProgressLink as Link,
  useProgressRouter as useRouter,
} from "./navigation-progress";
import { useSpndrrWeb } from "./web-design";

type SignupState = {
  ready: true;
  invitation?: { token: string; name: string; email: string };
};

export function SignupGate() {
  const revamp = useSpndrrWeb();
  const content = <SignupContent revamp={revamp} />;
  return revamp ? (
    <WebAuthShell signup>{content}</WebAuthShell>
  ) : (
    <AuthShell>{content}</AuthShell>
  );
}

function SignupContent({ revamp }: { revamp: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<SignupState | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let version = 0;
    async function load() {
      const requestVersion = ++version;
      const isCurrent = () => active && requestVersion === version;
      setState(null);
      setError(null);
      const token = new URLSearchParams(window.location.hash.slice(1)).get(
        "token",
      );
      try {
        if (token) {
          const invitation = await validateSignupInvitation(token);
          if (isCurrent())
            setState({ ready: true, invitation: { ...invitation, token } });
        } else {
          const settings = await getRegistration();
          if (!isCurrent()) return;
          if (settings.mode === "Open") setState({ ready: true });
          else router.replace("/request-access");
        }
      } catch (caught) {
        if (!isCurrent()) return;
        if (!token) router.replace("/request-access");
        else
          setError(
            caught instanceof ApiError && caught.status === 403
              ? "This signup link is invalid, expired, or already used. Contact support for a replacement link."
              : "We couldn’t verify your signup link. Please reload to try again or contact support.",
          );
      }
    }
    void load();
    const onHashChange = () => {
      void load();
    };
    window.addEventListener("hashchange", onHashChange);
    return () => {
      active = false;
      window.removeEventListener("hashchange", onHashChange);
    };
  }, [router]);

  if (state)
    return <AuthForm mode="signup" invitation={state.invitation} revamp={revamp} />;
  if (!error)
    return (
      <div className={revamp ? styles.panel : "mx-auto w-full max-w-xl p-6"}>
        <SectionSkeleton />
      </div>
    );
  const supportEmail =
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@spndrr.example";
  return (
    <div className={revamp ? styles.panel : "grid place-items-center px-5 text-[var(--ink)]"}>
      <section className={revamp ? styles.linkError : "w-full max-w-md rounded-lg border border-[var(--border)] bg-white p-7"}>
        <h1 className="text-2xl font-semibold">Signup link unavailable</h1>
        {error && (
          <>
            <p role="alert" className="mt-4 text-sm leading-6">
              {error}
            </p>
            <a
              className="mt-4 block font-semibold text-[var(--accent)] underline"
              href={`mailto:${supportEmail}`}
            >
              Contact support
            </a>
            <Link
              className="mt-4 block text-[var(--accent)] underline"
              href="/login"
            >
              Sign in to an existing account
            </Link>
            <Link
              className="mt-4 block text-[var(--accent)] underline"
              href="/request-access"
            >
              Request MVP access
            </Link>
          </>
        )}
      </section>
    </div>
  );
}
