"use client";

import { X } from "lucide-react";
import { ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { opensDocumentsInApp } from "@/lib/platform";
import { ProgressLink as Link } from "./navigation-progress";
import { PrivacyPolicyContent } from "./privacy-policy-content";

type PrivacyPolicyLinkProps = {
  children: ReactNode;
  className?: string;
};

// Browsers open the policy in a new tab. Native shells show it in a sheet over the
// current screen, so a half-filled form underneath stays mounted.
export function PrivacyPolicyLink({ children, className }: PrivacyPolicyLinkProps) {
  const [open, setOpen] = useState(false);
  const linkRef = useRef<HTMLAnchorElement | null>(null);
  return (
    <>
      <Link
        className={className}
        href="/privacy"
        onClick={(event) => {
          if (!opensDocumentsInApp()) return;
          event.preventDefault();
          setOpen(true);
        }}
        ref={linkRef}
        target="_blank"
      >
        {children}
      </Link>
      {open ? (
        <PrivacyPolicySheet onClose={() => setOpen(false)} returnFocusTo={linkRef} />
      ) : null}
    </>
  );
}

function PrivacyPolicySheet({
  onClose,
  returnFocusTo,
}: {
  onClose: () => void;
  returnFocusTo: React.RefObject<HTMLAnchorElement | null>;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = returnFocusTo.current;
    if (dialog && !dialog.open) dialog.showModal();
    closeRef.current?.focus();
    return () => {
      if (dialog?.open) dialog.close();
      opener?.focus();
    };
  }, [returnFocusTo]);

  // Portal to <body>: the signup link sits inside the consent checkbox's <label>,
  // and clicks inside the sheet must not toggle it.
  return createPortal(
    <dialog
      aria-labelledby={titleId}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none bg-[var(--background)] p-0 text-[var(--ink)]"
      // Escape and the Android back button (via the mobile runtime) both send "cancel".
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      ref={dialogRef}
    >
      <div className="flex h-full flex-col">
        <header className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] bg-white px-2 pb-1 pt-[max(env(safe-area-inset-top),0.25rem)]">
          <button
            aria-label="Close privacy policy"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-lg"
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
          <p className="text-lg font-semibold" id={titleId}>
            Privacy policy
          </p>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
          <article className="mx-auto max-w-3xl">
            <PrivacyPolicyContent headingLevel={2} />
          </article>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
