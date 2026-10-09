"use client";
import { useEffect, useRef, useState } from "react";

export function VoiceTranscriptReview({ text, onSend, onCancel }: { text: string; onSend: (text: string) => void; onCancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(text);
  const sent = useRef(false);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog ref={dialog} onCancel={onCancel} aria-labelledby="voice-review-title"
    className="m-auto max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-xl border bg-white p-6 text-[var(--ink)] shadow-xl backdrop:bg-black/40">
    <h2 id="voice-review-title" className="text-lg font-semibold">Review your transcript</h2>
    <p className="mt-2 text-sm text-[var(--muted)]">Check the amount and words before sending. Nothing has been submitted to the assistant yet.</p>
    <label className="mt-4 block text-sm font-semibold">Transcript
      <textarea aria-label="Transcript" autoFocus className="form-control mt-2 min-h-28" value={draft} onChange={event => setDraft(event.target.value)} />
    </label>
    <div className="mt-4 flex gap-3">
      <button type="button" disabled={!draft.trim()} onClick={() => { if (!sent.current) { sent.current = true; onSend(draft); } }} className="rounded-lg bg-[var(--accent)] p-3 font-semibold text-white disabled:opacity-60">Send transcript</button>
      <button type="button" onClick={onCancel} className="rounded-lg border p-3">Discard transcript</button>
    </div>
  </dialog>;
}
