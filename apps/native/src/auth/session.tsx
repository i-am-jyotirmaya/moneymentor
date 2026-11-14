import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { createFinanceClient } from "../api";
import type { FinanceClient } from "../api/client";

const SessionContext = createContext<FinanceClient | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => createFinanceClient());
  return <SessionContext.Provider value={client}>{children}</SessionContext.Provider>;
}
export function useSession() {
  const client = useContext(SessionContext);
  if (!client) throw new Error("SessionProvider is required.");
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  return { client, ...state };
}
