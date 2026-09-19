import { Suspense } from "react";
import { AuthForm } from "../_components/auth-form";
import { AuthShell } from "../_components/auth-shell";
import { ServerRegistrationLink } from "../_components/server-registration-link";

export default function LoginPage() {
  return (
    <AuthShell>
      <AuthForm
        mode="login"
        registrationLink={
          <Suspense
            fallback={
              <span
                className="animate-pulse rounded-lg bg-[var(--border)] h-8 w-40"
                aria-label="Loading access options"
              />
            }
          >
            <ServerRegistrationLink />
          </Suspense>
        }
      />
    </AuthShell>
  );
}
