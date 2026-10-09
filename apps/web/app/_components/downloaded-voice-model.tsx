"use client";

import { useEffect, useSyncExternalStore } from "react";
import { cancelModelDownload, deleteDownloadedModel, installDownloadedModel, modelDownloadServerSnapshot, modelDownloadSnapshot, refreshDownloadedModel, subscribeModelDownload } from "@/lib/speech/downloaded-model";
import { whisperModelBytes } from "../../../../packages/spndrr-speech/src/catalog";

export function DownloadedVoiceModel({ onReady }: { onReady: () => void }) {
  const state = useSyncExternalStore(subscribeModelDownload, modelDownloadSnapshot, modelDownloadServerSnapshot);
  useEffect(() => { void refreshDownloadedModel(); }, []);
  return <div className="mt-4 rounded-lg border border-[var(--border)] p-4">
    <h4 className="text-sm font-semibold">Whisper Tiny · Experimental</h4>
    <p className="mt-2 text-xs text-[var(--muted)]">Accuracy varies and expense amounts can be wrong. Prefer browser speech or backend transcription if this model is inaccurate. Download once: {(whisperModelBytes / 1048576).toFixed(0)} MiB model plus local runtime. Audio stays on this device. Wait for Recording, speak your sentence, then pause for two seconds. Transcription may take several seconds; the model stays ready briefly for your next recording. A device with 4 GB of memory is recommended.</p>
    <p role="status" className="mt-3 text-sm">{state.message}</p>
    {state.busy && state.total > 0 ? <>
      <progress aria-label="Speech model download" className="mt-2 w-full" max={state.total} value={state.bytes} />
      <p className="text-xs text-[var(--muted)]">{(state.bytes / 1048576).toFixed(1)} / {(state.total / 1048576).toFixed(1)} MiB</p>
    </> : null}
    <div className="mt-3 flex flex-wrap gap-3">
      {state.busy ? <button type="button" onClick={cancelModelDownload} className="rounded-lg border px-3 py-2 text-sm">Pause download</button> : <>
        {state.installed ? <button type="button" onClick={onReady} className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white">Use Whisper Tiny</button> : null}
        <button type="button" onClick={() => { void installDownloadedModel().then(installed => { if (installed) onReady(); }); }}
          className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white">{state.installed ? "Reinstall / verify Whisper Tiny" : "Download / resume Whisper Tiny"}</button>
        <button type="button" onClick={() => void deleteDownloadedModel()} className="rounded-lg border px-3 py-2 text-sm">Delete model files</button>
      </>}
    </div>
    <p className="mt-2 text-xs text-[var(--muted)]">Downloads come from Hugging Face and this app. Browser storage may be cleared or evicted; resume or reinstall if needed.</p>
    {state.error ? <p role="alert" className="mt-2 text-sm text-red-700">{state.error}</p> : null}
  </div>;
}
