"use client";

import { DownloadedVoiceModel } from "./downloaded-voice-model";
import { getSpeechPreferences, saveSpeechPreferences } from "@/lib/speech-preferences";
import type { SpeechBackendCapabilities } from "@/lib/api";
import { useEffect, useRef } from "react";

export function VoicePrivacyDialog({ message, canInstall, installing, onInstall, onUseSystem, onClose, native, backend, onRequestBackend, onUseBackend }: {
  native: boolean;
  backend?: SpeechBackendCapabilities;
  onRequestBackend: () => void;
  onUseBackend: () => void;
  message: string;
  canInstall: boolean;
  installing: boolean;
  onInstall: () => void;
  onUseSystem: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog ref={dialog} aria-labelledby="voice-privacy-title" onCancel={onClose}
      className="m-auto max-h-[90dvh] max-w-md overflow-y-auto rounded-xl border border-[var(--border)] bg-white p-6 text-[var(--ink)] shadow-xl backdrop:bg-black/40">
      <h2 id="voice-privacy-title" className="text-lg font-semibold">Voice input</h2>
      <p className="mt-3 text-sm">{message}</p>
      {backend ? <p className="mt-3 text-sm">{backend.disclosure} You can review the transcript before sending it.</p> : <p className="mt-3 text-sm text-[var(--muted)]">System speech may send audio to your browser or device provider. Allow it for this recording, or keep typing. Spndrr sends only the transcript to its assistant.</p>}
      {canInstall ? <button type="button" disabled={installing} onClick={onInstall}
        className="mt-4 w-full rounded-lg bg-[var(--accent)] p-3 font-semibold text-white disabled:opacity-60">
        {installing ? "Downloading language…" : "Download on-device language"}
      </button> : null}
      {!native && !backend ? <DownloadedVoiceModel onReady={() => { saveSpeechPreferences({ ...getSpeechPreferences(), engine: "whisper" }); onClose(); }} /> : null}
      {backend ? <button type="button" onClick={onUseBackend} className="mt-3 w-full rounded-lg bg-[var(--accent)] p-3 font-semibold text-white">Allow backend transcription once</button> : <button type="button" disabled={installing} onClick={onUseSystem}
        className="mt-3 w-full rounded-lg border border-[var(--border)] p-3 font-semibold disabled:opacity-60">Use system speech once</button>}
      {!native && !backend ? <button type="button" onClick={onRequestBackend} className="mt-3 w-full rounded-lg border p-3 font-semibold">Try backend transcription</button> : null}
      <button type="button" onClick={onClose} className="mt-3 w-full p-2 text-sm font-semibold">Keep typing</button>
    </dialog>
  );
}
