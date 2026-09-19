import { SignupGate } from "../_components/signup-gate";
import { AuthShell } from "../_components/auth-shell";
export default function SignupPage() {
  return (
    <AuthShell>
      <SignupGate />
    </AuthShell>
  );
}
