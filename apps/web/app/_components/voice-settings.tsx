"use client";

import { useState, useSyncExternalStore } from "react";
import { getSpeechPreferences, saveSpeechPreferences, speechPreferencesChanged, voiceLanguages } from "@/lib/speech-preferences";
import type { SpeechPreferences } from "@/lib/speech-preferences";

function subscribe(callback: () => void) {
  window.addEventListener(speechPreferencesChanged, callback);
  window.addEventListener("storage", callback);
  return () => { window.removeEventListener(speechPreferencesChanged, callback); window.removeEventListener("storage", callback); };
}
const snapshot = () => JSON.stringify(getSpeechPreferences());
const serverSnapshot = () => '{"privacy":"local-only","language":"en-IN"}';

export function VoiceSettings() {
  const preferences = JSON.parse(useSyncExternalStore(subscribe, snapshot, serverSnapshot)) as SpeechPreferences;
  const [error, setError] = useState("");
  function save(next: SpeechPreferences) {
    try { saveSpeechPreferences(next); setError(""); }
    catch { setError("This device could not save your voice preference. On-device speech remains the default."); }
  }
  return (
    <article className="mt-4 rounded-lg border border-[var(--border)] bg-white p-5">
      <h3 className="font-semibold">Voice transcription</h3>
      <p className="mt-2 text-sm text-[var(--muted)]">Voice preferences apply to this device. On-device speech requires browser support and an installed language. Downloaded model support for the mobile app is coming later.</p>
      <label className="mt-4 block text-sm font-semibold">Speech processing
        <select aria-label="Speech processing" className="form-control mt-2" value={preferences.privacy}
          onChange={event => save({ ...preferences, privacy: event.target.value === "allow-system" ? "allow-system" : "local-only" })}>
          <option value="local-only">Keep audio on this device</option>
          <option value="allow-system">Allow system speech (may use cloud)</option>
        </select>
      </label>
      <p className="mt-2 text-xs text-[var(--muted)]">Allowing system speech lets your browser or device provider process audio, potentially remotely. Spndrr receives only your transcript.</p>
      <label className="mt-4 block text-sm font-semibold">Voice language
        <select aria-label="Voice language" className="form-control mt-2" value={preferences.language}
          onChange={event => save({ ...preferences, language: event.target.value })}>
          {voiceLanguages.map(language => <option key={language} value={language}>{({ "en-IN": "English (India)", "en-US": "English (US)", "hi-IN": "Hindi (India)" })[language]}</option>)}
        </select>
      </label>
      {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
    </article>
  );
}
