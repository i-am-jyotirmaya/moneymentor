"use client";

import { ApiError, createUser, login, requestMvpAccess } from "@/lib/api";
import { saveAuthSession } from "@/lib/auth-session";
import { CircleAlert, Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";
import { FormEvent, useState } from "react";
import styles from "./auth.module.css";
import { BrandLogo } from "./brand-logo";
import { ArrowRightIcon } from "./icons";
import {
  ProgressLink as Link,
  useProgressRouter as useRouter,
} from "./navigation-progress";
import { PrivacyPolicyLink } from "./privacy-policy-link";
import { RegistrationLink } from "./registration-link";

type AuthMode = "login" | "signup" | "request";

type AuthFormProps = {
  mode: AuthMode;
  registrationLink?: React.ReactNode;
  invitation?: { token: string; name: string; email: string };
  revamp?: boolean;
};

export function AuthForm({
  mode,
  invitation,
  registrationLink,
  revamp = false,
}: AuthFormProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(invitation?.name ?? "");
  const [email, setEmail] = useState(invitation?.email ?? "");
  const [reason, setReason] = useState("");
  const [requestSent, setRequestSent] = useState(false);
  const [password, setPassword] = useState("");
  const [acceptPrivacyPolicy, setAcceptPrivacyPolicy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSignup = mode === "signup";
  const isRequest = mode === "request";
  const Heading = revamp ? "h1" : "h2";

  async function submitCredentials() {
    if (isSubmitting) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      if (isRequest) {
        await requestMvpAccess({
          name: displayName.trim(),
          email: email.trim(),
          reason: reason.trim() || undefined,
        });
        setRequestSent(true);
        return;
      }
      const session = isSignup
        ? await createUser({
            invitationToken: invitation?.token,
            displayName: displayName.trim(),
            email: email.trim(),
            password,
            privacyPolicyVersion: "2026-07-26-ai-planning.1",
            acceptPrivacyPolicy,
          })
        : await login({
            email: email.trim(),
            password,
          });

      saveAuthSession(session);
      if (invitation) window.history.replaceState(null, "", "/signup");
      router.push("/");
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setError(caughtError.errors.join(" "));
      } else {
        setError("Could not connect to Spndrr. Please try again in a moment.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitCredentials();
  }

  return (
    <section className={revamp ? styles.panel : "mx-auto w-full max-w-md rounded-lg border border-[var(--border)] bg-white p-5 shadow-[0_24px_80px_rgba(16,43,38,0.12)] sm:p-7"}>
      {!revamp && (
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link
            className="inline-flex items-center gap-3 rounded-lg text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] lg:hidden"
            href="/login"
          >
            <BrandLogo />
          </Link>
          <span className="hidden text-sm font-semibold text-[var(--muted)] lg:block">
            {isRequest
              ? "MVP access"
              : isSignup
                ? "Create account"
                : "Welcome back"}
          </span>
        </div>
      )}

      <div className={revamp ? styles.heading : "mb-7"}>
        <Heading className={revamp ? styles.title : "text-3xl font-semibold tracking-normal text-[var(--ink)]"}>
          {isRequest
            ? "Request MVP access"
            : isSignup
              ? "Create your account"
              : "Sign in"}
        </Heading>
        {(!revamp || isRequest) && (
          <p className={revamp ? styles.help : "mt-2 text-sm font-medium leading-6 text-[var(--muted)]"}>
            {isRequest
              ? "Spndrr is currently available by approval. Tell us a little about yourself to request access."
              : isSignup
                ? "Start with the assistant input, then build the rest around real data."
                : "Continue to your Spndrr workspace."}
          </p>
        )}
      </div>

      {requestSent ? (
        <p
          role="status"
          className={revamp ? styles.notice : "rounded-lg bg-[var(--accent-soft)] p-4 text-sm leading-6"}
        >
          Your request has been received. We’ll email you if access is approved.
        </p>
      ) : (
        <form className={revamp ? styles.form : "space-y-4"} method="post" onSubmit={handleSubmit}>
          {isSignup || isRequest ? (
            <Field
              autoComplete="name"
              label="Display name"
              onChange={setDisplayName}
              placeholder="Aarav Shah"
              value={displayName}
              maxLength={128}
              revamp={revamp}
              id="auth-display-name"
            />
          ) : null}

          <Field
            autoComplete={revamp && !isRequest ? "username" : "email"}
            label="Email"
            onChange={setEmail}
            placeholder="name@example.com"
            type="email"
            value={email}
            readOnly={!!invitation}
            maxLength={256}
            revamp={revamp}
            id="auth-email"
          />

          {!isRequest && (
            <Field
              autoComplete={isSignup ? "new-password" : "current-password"}
              label="Password"
              onChange={setPassword}
              placeholder={revamp ? undefined : "At least 8 characters"}
              type="password"
              value={password}
              revamp={revamp}
              id={isSignup ? "auth-new-password" : "auth-current-password"}
              newPassword={isSignup}
            />
          )}

          {isRequest && (
            <label className={revamp ? styles.field : "block space-y-2 text-sm font-semibold"}>
              <span>Why would you like access? (optional)</span>
              <textarea
                className={revamp ? styles.reason : "min-h-24 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-base outline-none focus:border-[var(--accent)]"}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={1000}
              />
            </label>
          )}
          {isRequest && (
            <p className={revamp ? styles.help : "text-sm text-[var(--muted)]"}>
              We’ll use these details to review your request and contact you
              about access.{" "}
              <Link className="underline" href="/privacy">
                Privacy policy
              </Link>
            </p>
          )}

          {isSignup ? (
            <label className={revamp ? styles.consent : "flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm font-medium leading-6 text-[var(--muted)]"}>
              <input
                checked={acceptPrivacyPolicy}
                className={revamp ? styles.checkbox : "mt-1 h-4 w-4 accent-[var(--accent)]"}
                onChange={(event) =>
                  setAcceptPrivacyPolicy(event.target.checked)
                }
                required
                type="checkbox"
              />
              <span>
                I accept the{" "}
                <PrivacyPolicyLink className={revamp ? styles.policyLink : "font-bold text-[var(--accent)] underline"}>
                  beta privacy policy
                </PrivacyPolicyLink>{" "}
                (version 2026-07-26-ai-planning.1).
              </span>
            </label>
          ) : null}

          {error ? (
            <p
              role="alert"
              className={revamp ? styles.error : "rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-sm font-medium leading-6 text-[var(--danger)]"}
            >
              {revamp && <CircleAlert aria-hidden="true" size={18} />}
              {error}
            </p>
          ) : null}

          <button
            className={revamp ? styles.submit : "inline-flex h-13 w-full items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-5 text-sm font-bold text-white shadow-[0_14px_35px_rgba(16,43,38,0.22)] transition hover:-translate-y-0.5 hover:bg-[#173d36] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-65"}
            disabled={isSubmitting}
            type="submit"
          >
            <span>
              {isSubmitting
                ? "Working..."
                : isRequest
                  ? "Request MVP access"
                  : isSignup
                    ? "Create account"
                    : "Sign in"}
            </span>
            {!revamp && <ArrowRightIcon className="h-4 w-4" />}
          </button>
        </form>
      )}

      <div className={revamp ? styles.footer : "mt-6 flex justify-center text-sm font-semibold"}>
        {isSignup || isRequest ? (
          <Link
            className="rounded-lg px-3 py-2 text-[var(--accent)] outline-none transition hover:bg-[var(--accent-soft)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            href="/login"
          >
            I already have an account
          </Link>
        ) : (
          (registrationLink ?? (
            <RegistrationLink className="rounded-lg px-3 py-2 text-[var(--accent)] outline-none transition hover:bg-[var(--accent-soft)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]" />
          ))
        )}
      </div>
      {revamp && mode === "login" && (
        <p className={styles.policy}>
          <Link className={styles.policyLink} href="/privacy">
            Privacy policy
          </Link>
        </p>
      )}
    </section>
  );
}

type FieldProps = {
  id: string;
  autoComplete: string;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "email" | "password";
  value: string;
  readOnly?: boolean;
  maxLength?: number;
  revamp?: boolean;
  newPassword?: boolean;
};

function Field({
  id,
  autoComplete,
  label,
  onChange,
  placeholder,
  type = "text",
  value,
  readOnly,
  maxLength,
  revamp,
  newPassword,
}: FieldProps) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  if (revamp) {
    const isPassword = type === "password";
    const Icon = isPassword ? LockKeyhole : type === "email" ? Mail : UserRound;
    const hintId = `${id}-hint`;

    return (
      <div className={styles.field}>
        <label htmlFor={id}>{label}</label>
        <div className={styles.inputRow}>
          <Icon aria-hidden="true" size={19} className={styles.fieldIcon} />
          {/* Credentials are sent only to the API by submitCredentials. Omit name so
              a native submission before hydration cannot send them to this page. */}
          <input
            aria-describedby={newPassword ? hintId : undefined}
            autoComplete={autoComplete}
            className={`${styles.input} ${isPassword ? styles.password : ""}`}
            enterKeyHint={isPassword ? "done" : undefined}
            id={id}
            maxLength={maxLength}
            minLength={newPassword ? 8 : undefined}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            readOnly={readOnly}
            required
            spellCheck={type === "email" ? false : undefined}
            type={passwordVisible ? "text" : type}
            value={value}
          />
          {isPassword && (
            <button
              aria-controls={id}
              aria-label="Show password"
              aria-pressed={passwordVisible}
              className={styles.reveal}
              onClick={() => setPasswordVisible((visible) => !visible)}
              type="button"
            >
              {passwordVisible ? <EyeOff aria-hidden="true" size={20} /> : <Eye aria-hidden="true" size={20} />}
            </button>
          )}
        </div>
        {newPassword && (
          <p className={styles.help} id={hintId}>
            Use at least 8 characters, including uppercase and lowercase letters and a number.
          </p>
        )}
      </div>
    );
  }

  return (
    <label className="block space-y-2 text-sm font-semibold text-[var(--ink)]">
      <span>{label}</span>
      <input
        autoComplete={autoComplete}
        readOnly={readOnly}
        maxLength={maxLength}
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
