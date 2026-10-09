"use client";

import { inspectBrowserSpeech } from "../../../../packages/spndrr-speech/src/index";
import { isNativeSpeechPlatform } from "@/lib/platform";
import { DownloadedVoiceModel } from "./downloaded-voice-model";
import { useState, useSyncExternalStore } from "react";
import { getSpeechPreferences, saveSpeechPreferences, speechPreferencesChanged, voiceLanguages } from "@/lib/speech-preferences";
import type { SpeechPreferences } from "@/lib/speech-preferences";

function subscribe(callback: () => void) {
  window.addEventListener(speechPreferencesChanged, callback);
  window.addEventListener("storage", callback);
  return () => { window.removeEventListener(speechPreferencesChanged, callback); window.removeEventListener("storage", callback); };
}
const snapshot = () => JSON.stringify(getSpeechPreferences());
const serverSnapshot = () => '{"privacy":"local-only","language":"en-IN","engine":"browser"}';

export function VoiceSettings() {
  const preferences = JSON.parse(useSyncExternalStore(subscribe, snapshot, serverSnapshot)) as SpeechPreferences;
  const native = isNativeSpeechPlatform();
  const [browserStatus, setBrowserStatus] = useState("");
  const [checkingBrowser, setCheckingBrowser] = useState(false);
  const [error, setError] = useState("");
  function save(next: SpeechPreferences) {
    try { saveSpeechPreferences(next); setError(""); setBrowserStatus(""); }
    catch { setError("This device could not save your voice preference. On-device speech remains the default."); }
  }
  return (
    <article className="mt-4 rounded-lg border border-[var(--border)] bg-white p-5">
      <h3 className="font-semibold">Voice transcription</h3>
      <p className="mt-2 text-sm text-[var(--muted)]">Voice preferences apply to this device. Native apps use device speech. Browsers can use built-in speech, or explicitly upload a recording to the backend. Browser transcripts are reviewed before sending.</p>
      <label className="mt-4 block text-sm font-semibold">Browser / device privacy
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
      {!native ? <label className="mt-4 block text-sm font-semibold">Speech engine
        <select aria-label="Speech engine" className="form-control mt-2" value={preferences.engine}
          onChange={event => save({ ...preferences, engine: event.target.value === "backend" ? "backend" : event.target.value === "whisper" ? "whisper" : "browser" })}>
          <option value="browser">Browser / device speech</option>
          <option value="backend">Backend transcription (ask before upload)</option>
          <option value="whisper">Downloaded Whisper Tiny (experimental, local)</option>
        </select>
      </label> : <p className="mt-4 text-sm">Device speech is used in this app. For keyboard dictation, tap the microphone on your keyboard in the text box.</p>}
      {!native ? <div className="mt-4">
        <button type="button" disabled={checkingBrowser} className="rounded-lg border px-3 py-2 text-sm" onClick={() => {
          setCheckingBrowser(true);
          void inspectBrowserSpeech(preferences.language).then(status => setBrowserStatus(
            !status.system ? "Built-in speech is unavailable. Choose backend transcription or keep typing." :
            status.local === "available" ? "On-device speech is available for this language. Test a phrase and check the amount in transcript review." :
            status.local === "downloadable" || status.local === "downloading" ? "This language needs an on-device download. Start voice input to install it explicitly." :
            "On-device speech is unavailable for this language. You can allow system speech, choose backend transcription, or keep typing."
          )).catch(() => setBrowserStatus("This browser could not check speech support. Try voice input or keep typing.")).finally(() => setCheckingBrowser(false));
        }}>{checkingBrowser ? "Checking browser…" : "Check browser speech support"}</button>
        {browserStatus ? <p role="status" className="mt-2 text-sm">{browserStatus}</p> : null}
        <p className="mt-2 text-xs text-[var(--muted)]">This checks capabilities without opening the microphone. Availability does not guarantee accuracy. Backend speech always asks for audio upload permission separately.</p>
      </div> : null}
      {!native ? <DownloadedVoiceModel onReady={() => save({ ...getSpeechPreferences(), engine: "whisper" })} /> : null}
      {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
    </article>
  );
}
