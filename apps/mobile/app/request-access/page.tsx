import { AuthShell } from "../../../web/app/_components/auth-shell";
import { AuthForm } from "../../../web/app/_components/auth-form";
import { InvitationLinkForm } from "../../components/invitation-link-form";

export default function RequestAccessPage() {
  return (
    <AuthShell><div>
      <AuthForm mode="request" />
      <InvitationLinkForm />
    </div></AuthShell>
  );
}
