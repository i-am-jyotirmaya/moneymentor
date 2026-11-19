import { AuthForm } from "../_components/auth-form";
import { WebAuthShell } from "../_components/auth-shell";
export default function RequestAccessPage() {
  return (
    <WebAuthShell signup>
      <AuthForm mode="request" revamp />
    </WebAuthShell>
  );
}
