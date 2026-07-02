"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, MouseEvent, useState } from "react";
import { ApiError, createUser, login } from "@/lib/api";
import { saveAuthSession } from "@/lib/auth-session";
import { ArrowRightIcon, BrandMarkIcon } from "./icons";

type AuthMode = "login" | "signup";

type AuthFormProps = {
  mode: AuthMode;
};

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSignup = mode === "signup";

  async function submitCredentials() {
    if (isSubmitting) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const session = isSignup
        ? await createUser({
            displayName: displayName.trim(),
            email: email.trim(),
            password,
          })
        : await login({
            email: email.trim(),
            password,
          });

      saveAuthSession(session);
      router.push("/");
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setError(caughtError.errors.join(" "));
      } else {
        setError("Could not reach MoneyMentor API. Check that the backend is running.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitCredentials();
  }

  function handleSubmitClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (!event.currentTarget.form?.reportValidity()) {
      return;
    }

    void submitCredentials();
  }

  return (
    <main className="auth-shell min-h-screen px-5 py-6 text-[var(--ink)] sm:px-8 lg:px-10">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,460px)]">
        <section className="hidden lg:block">
          <Link
            className="inline-flex items-center gap-3 rounded-lg text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            href="/login"
          >
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--ink)] text-white">
              <BrandMarkIcon className="h-6 w-6" />
            </span>
            <span className="text-lg font-semibold">MoneyMentor</span>
          </Link>

          <div className="mt-16 max-w-xl">
            <h1 className="text-5xl font-semibold leading-tight tracking-normal text-[var(--ink)]">
              A calm place to tell your money what happened.
            </h1>
            <p className="mt-5 max-w-lg text-lg font-medium leading-8 text-[var(--muted)]">
              Sign in, type naturally, and let MoneyMentor turn quick notes into
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

        <section className="mx-auto w-full max-w-md rounded-lg border border-[var(--border)] bg-white p-5 shadow-[0_24px_80px_rgba(16,43,38,0.12)] sm:p-7">
          <div className="mb-8 flex items-center justify-between gap-4">
            <Link
              className="inline-flex items-center gap-3 rounded-lg text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] lg:hidden"
              href="/login"
            >
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--ink)] text-white">
                <BrandMarkIcon className="h-6 w-6" />
              </span>
              <span className="text-lg font-semibold">MoneyMentor</span>
            </Link>
            <span className="hidden text-sm font-semibold text-[var(--muted)] lg:block">
              {isSignup ? "Create account" : "Welcome back"}
            </span>
          </div>

          <div className="mb-7">
            <h2 className="text-3xl font-semibold tracking-normal text-[var(--ink)]">
              {isSignup ? "Create your account" : "Sign in"}
            </h2>
            <p className="mt-2 text-sm font-medium leading-6 text-[var(--muted)]">
              {isSignup
                ? "Start with the assistant input, then build the rest around real data."
                : "Continue to your MoneyMentor workspace."}
            </p>
          </div>

          <form className="space-y-4" method="post" onSubmit={handleSubmit}>
            {isSignup ? (
              <Field
                autoComplete="name"
                label="Display name"
                onChange={setDisplayName}
                placeholder="Aarav Shah"
                value={displayName}
              />
            ) : null}

            <Field
              autoComplete="email"
              label="Email"
              onChange={setEmail}
              placeholder="name@example.com"
              type="email"
              value={email}
            />

            <Field
              autoComplete={isSignup ? "new-password" : "current-password"}
              label="Password"
              onChange={setPassword}
              placeholder="At least 8 characters"
              type="password"
              value={password}
            />

            {error ? (
              <p className="rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-sm font-medium leading-6 text-[var(--danger)]">
                {error}
              </p>
            ) : null}

            <button
              className="inline-flex h-13 w-full items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-5 text-sm font-bold text-white shadow-[0_14px_35px_rgba(16,43,38,0.22)] transition hover:-translate-y-0.5 hover:bg-[#173d36] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-65"
              disabled={isSubmitting}
              onClick={handleSubmitClick}
              type="button"
            >
              <span>{isSubmitting ? "Working..." : isSignup ? "Create account" : "Sign in"}</span>
              <ArrowRightIcon className="h-4 w-4" />
            </button>
          </form>

          <div className="mt-6 flex justify-center text-sm font-semibold">
            {isSignup ? (
              <Link
                className="rounded-lg px-3 py-2 text-[var(--accent)] outline-none transition hover:bg-[var(--accent-soft)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                href="/login"
              >
                I already have an account
              </Link>
            ) : (
              <Link
                className="rounded-lg px-3 py-2 text-[var(--accent)] outline-none transition hover:bg-[var(--accent-soft)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                href="/signup"
              >
                Create a new account
              </Link>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

type FieldProps = {
  autoComplete: string;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  value: string;
};

function Field({
  autoComplete,
  label,
  onChange,
  placeholder,
  type = "text",
  value,
}: FieldProps) {
  return (
    <label className="block space-y-2 text-sm font-semibold text-[var(--ink)]">
      <span>{label}</span>
      <input
        autoComplete={autoComplete}
        className="h-13 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-base font-medium text-[var(--ink)] outline-none transition placeholder:text-[var(--muted-2)] focus:border-[var(--accent)] focus:bg-white focus:ring-4 focus:ring-[var(--accent-ring)]"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required
        type={type}
        value={value}
      />
    </label>
  );
}
