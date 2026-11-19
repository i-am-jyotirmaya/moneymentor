import { useSyncExternalStore } from 'react';
import { useSession } from '../auth/session';
export function useOffline() {
  const { client } = useSession();
  return useSyncExternalStore(client.subscribeConnection, client.getOffline, client.getOffline);
}
