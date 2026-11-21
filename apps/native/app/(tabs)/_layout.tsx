import { useDeviceLock } from '../../src/auth/device-lock';
import { PasskeyEnrollmentOffer } from '../../src/auth/passkey-enrollment-offer';
import { useSession } from '../../src/auth/session';
import { WorkspaceShell } from '../../src/workspace/shell';
export const unstable_settings = { anchor: 'assistant' };
export default function WorkspaceLayout() {
  const deviceLock = useDeviceLock();
  const { status, session } = useSession();
  const open = deviceLock === 'open' && status === 'authenticated';
  return <PasskeyEnrollmentOffer key={session?.user.id} enabled={open && !session?.requiresPrivacyConsent}>
    {open ? <WorkspaceShell /> : null}
  </PasskeyEnrollmentOffer>;
}
