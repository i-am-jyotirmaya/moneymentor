"use client";

import { AuthForm } from "../../../web/app/_components/auth-form";
import { AuthShell } from "../../../web/app/_components/auth-shell";
import { signInWithPasskey, usePasskeySupport } from "../../lib/passkeys";

export default function LoginPage() {
  const passkeys = usePasskeySupport();
  return (
    <AuthShell>
      <AuthForm mode="login" passkeySignIn={passkeys ? signInWithPasskey : undefined} />
    </AuthShell>
  );
}
