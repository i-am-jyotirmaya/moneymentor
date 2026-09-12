"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, getRegistration, validateSignupInvitation } from "@/lib/api";
import { AuthForm } from "./auth-form";

type SignupState = { ready: true; invitation?: { token: string; name: string; email: string } };

export function SignupGate() {
  const router = useRouter();
  const [state, setState] = useState<SignupState | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    async function load() {
      const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
      try {
        if (token) {
          const invitation = await validateSignupInvitation(token);
          if (active) setState({ ready: true, invitation: { ...invitation, token } });
        } else {
          const settings = await getRegistration();
          if (!active) return;
          if (settings.mode === "Open") setState({ ready: true });
          else router.replace("/request-access");
        }
      } catch (caught) {
        if (!active) return;
        if (!token) router.replace("/request-access");
        else setError(caught instanceof ApiError && caught.status === 403
          ? "This signup link is invalid, expired, or already used. Contact support for a replacement link."
          : "We couldn’t verify your signup link. Please reload to try again or contact support.");
      }
    }
    void load();
    return () => { active = false; };
  }, [router]);

  if (state) return <AuthForm mode="signup" invitation={state.invitation} />;
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@spndrr.example";
  return <main className="auth-shell grid min-h-screen place-items-center px-5 text-[var(--ink)]">
    <section className="w-full max-w-md rounded-lg border border-[var(--border)] bg-white p-7">
      <h1 className="text-2xl font-semibold">{error ? "Signup link unavailable" : "Checking your access…"}</h1>
      {error && <>
        <p role="alert" className="mt-4 text-sm leading-6">{error}</p>
        <a className="mt-4 block font-semibold text-[var(--accent)] underline" href={`mailto:${supportEmail}`}>Contact support</a>
        <Link className="mt-4 block text-[var(--accent)] underline" href="/login">Sign in to an existing account</Link>
        <Link className="mt-4 block text-[var(--accent)] underline" href="/request-access">Request MVP access</Link>
      </>}
    </section>
  </main>;
}
