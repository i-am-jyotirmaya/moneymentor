import type { SpeechPrivacy } from "../../../packages/spndrr-speech/src/index";

const key = "spndrr.speech.preferences.v1";
export const speechPreferencesChanged = "spndrr-speech-preferences";
export interface SpeechPreferences { privacy: SpeechPrivacy; language: string; engine: "browser" | "whisper" | "backend" }
export const voiceLanguages = ["en-IN", "en-US", "hi-IN"] as const;
export function getSpeechPreferences(): SpeechPreferences {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null") as Partial<SpeechPreferences> | null;
    return {
      engine: saved?.engine === "backend" ? "backend" : saved?.engine === "whisper" ? "whisper" : "browser",
      privacy: saved?.privacy === "allow-system" ? "allow-system" : "local-only",
      language: voiceLanguages.includes(saved?.language as typeof voiceLanguages[number]) ? saved!.language! : "en-IN",
    };
  } catch { return { privacy: "local-only", language: "en-IN", engine: "browser" }; }
}
export function saveSpeechPreferences(preferences: SpeechPreferences) {
  localStorage.setItem(key, JSON.stringify(preferences));
  window.dispatchEvent(new Event(speechPreferencesChanged));
}
