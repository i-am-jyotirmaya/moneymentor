import { AuthForm } from "../../../web/app/_components/auth-form";
import { AuthShell } from "../../../web/app/_components/auth-shell";
// Native export has no server at runtime; registration remains a browser fetch.
export default function LoginPage() {
  return (
    <AuthShell>
      <AuthForm mode="login" />
    </AuthShell>
  );
}
