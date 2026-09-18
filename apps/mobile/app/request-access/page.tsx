import { AuthForm } from "../../../web/app/_components/auth-form";
import { InvitationLinkForm } from "../../components/invitation-link-form";

export default function RequestAccessPage() {
  return <><AuthForm mode="request" /><InvitationLinkForm /></>;
}
