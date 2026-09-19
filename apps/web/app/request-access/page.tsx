import { AuthForm } from "../_components/auth-form";
import { AuthShell } from "../_components/auth-shell";
export default function RequestAccessPage() {
  return (
    <AuthShell>
      <AuthForm mode="request" />
    </AuthShell>
  );
}
