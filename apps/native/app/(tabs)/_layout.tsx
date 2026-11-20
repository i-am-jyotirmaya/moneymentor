import { useDeviceLock } from '../../src/auth/device-lock';
import { useSession } from '../../src/auth/session';
import { WorkspaceShell } from '../../src/workspace/shell';
export const unstable_settings = { anchor: 'assistant' };
export default function WorkspaceLayout() {
  const deviceLock = useDeviceLock();
  const { status } = useSession();
  return deviceLock === 'open' && status === 'authenticated' ? <WorkspaceShell /> : null;
}
