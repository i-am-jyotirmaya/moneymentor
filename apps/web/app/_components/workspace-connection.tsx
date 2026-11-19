"use client";

import { WifiOff } from "lucide-react";
import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function WorkspaceConnection() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  return (
    <div role="status" aria-label="Browser connection">
      {!online ? <div className="workspace-offline">
        <WifiOff aria-hidden="true" size={18} />
        <p><strong>You’re offline.</strong> Reconnect to refresh your data.</p>
      </div> : null}
    </div>
  );
}
