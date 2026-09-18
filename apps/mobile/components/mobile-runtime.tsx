"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { useRouter } from "next/navigation";
import { configurePlatform } from "../../web/lib/platform";
import * as nativePlatform from "../lib/native-platform";
import { mobileLinkTarget } from "../lib/deep-links.mjs";

export function MobileRuntime() {
  const router = useRouter();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const updateConnection = () => setOffline(!navigator.onLine);
    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    const handles: Promise<{ remove: () => Promise<void> }>[] = [];
    let active = true;
    const resetPlatform = Capacitor.isNativePlatform() ? configurePlatform(nativePlatform) : undefined;
    if (Capacitor.isNativePlatform()) {
      const openLink = (url: string) => {
        const target = mobileLinkTarget(url, process.env.NEXT_PUBLIC_WEB_APP_URL);
        if (!active || !target) return;
        const link = new URL(target, "https://localhost");
        if (window.location.pathname.replace(/\/$/, "") === link.pathname.replace(/\/$/, "")) {
          // Updating the fragment emits hashchange so an open signup gate revalidates.
          window.location.hash = link.hash;
        } else {
          // Capacitor's local server is an SPA host; preserve Next's client routing.
          router.push(target);
        }
      };
      handles.push(App.addListener("appUrlOpen", ({ url }) => openLink(url)));
      void App.getLaunchUrl().then(result => {
        if (result) openLink(result.url);
      }).catch(() => { /* Normal launches need no URL. */ });
      if (Capacitor.getPlatform() === "android") {
        handles.push(App.addListener("backButton", ({ canGoBack }) => {
          // Let native dialogs and focused inputs close before navigating away.
          const dialog = document.querySelector<HTMLDialogElement>("dialog[open]");
          const closeMenu = document.querySelector<HTMLButtonElement>('[aria-label="Close menu"]');
          if (dialog) {
            dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
          } else if (closeMenu) {
            closeMenu.click();
          } else if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) {
            document.activeElement.blur();
          } else if (canGoBack) {
            window.history.back();
          } else {
            void App.minimizeApp();
          }
        }));
      }
    }
    return () => {
      active = false;
      resetPlatform?.();
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
      handles.forEach(handle => void handle.then(listener => listener.remove()).catch(() => {}));
    };
  }, [router]);

  return offline ? <div className="mobile-connection-status" role="status">You’re offline. Reconnect to load or save your finances.</div> : null;
}
