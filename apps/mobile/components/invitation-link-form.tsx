"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { mobileLinkTarget } from "../lib/deep-links.mjs";

export function InvitationLinkForm() {
  const router = useRouter();
  const [link, setLink] = useState("");
  const [error, setError] = useState("");

  function openInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = mobileLinkTarget(link.trim(), process.env.NEXT_PUBLIC_WEB_APP_URL);
    if (!target?.startsWith("/signup/#token=")) {
      setError("Paste the complete approved signup link from your Spndrr email.");
      return;
    }
    router.push(target);
  }

  return <section className="mx-auto max-w-md px-5 py-6 text-[var(--ink)]">
    <details><summary className="cursor-pointer font-semibold">Already approved? Open your invitation</summary>
      <form className="mt-4 space-y-3" onSubmit={openInvitation}>
        <label className="block space-y-2 text-sm font-semibold">
          <span>Approved signup link</span>
          <input className="form-control" type="url" required autoComplete="off" autoCapitalize="none" spellCheck={false}
            value={link} onChange={event => setLink(event.target.value)} />
        </label>
        {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
        <button className="rounded-lg bg-[var(--accent)] px-4 py-3 font-semibold text-white" type="submit">Open invitation</button>
      </form>
    </details>
  </section>;
}
