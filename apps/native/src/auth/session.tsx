import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { createFinanceClient } from "../api";
import type { FinanceClient } from "../api/client";

const SessionContext = createContext<{
  client: FinanceClient;
  passkeyOfferAccountId: string | null;
  setPasskeyOfferAccountId: (accountId: string | null) => void;
} | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => createFinanceClient());
  const [passkeyOfferAccountId, setPasskeyOfferAccountId] = useState<string | null>(null);
  return <SessionContext.Provider value={{ client, passkeyOfferAccountId, setPasskeyOfferAccountId }}>{children}</SessionContext.Provider>;
}
export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("SessionProvider is required.");
  const { client } = context;
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  return { ...context, ...state };
}
