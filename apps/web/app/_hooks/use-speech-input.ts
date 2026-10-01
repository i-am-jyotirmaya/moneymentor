"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LocalTranscriptionService, SpeechError, installBrowserLanguage } from "../../../../packages/spndrr-speech/src/index";
import type { SpeechPrivacy, TranscriptionResult } from "../../../../packages/spndrr-speech/src/index";
import { getTranscriptionProvider } from "@/lib/platform";
import { getSpeechPreferences, speechPreferencesChanged } from "@/lib/speech-preferences";

export function useSpeechInput(onFinal: (result: TranscriptionResult) => void, onError: (message: string) => void, scope: string) {
  const [isListening, setIsListening] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [voicePrompt, setVoicePrompt] = useState<{ message: string; canInstall: boolean } | null>(null);
  const [isInstallingVoice, setIsInstallingVoice] = useState(false);
  const active = useRef<LocalTranscriptionService | null>(null);
  const generation = useRef(0);
  const installation = useRef(false);
  const callbacks = useRef({ onFinal, onError });
  useEffect(() => { callbacks.current = { onFinal, onError }; }, [onFinal, onError]);

  const cancelVoiceInput = useCallback(() => {
    generation.current++;
    const service = active.current;
    active.current = null;
    void service?.cancel().catch(() => {});
    setIsListening(false);
    setPartialTranscript("");
    setVoicePrompt(null);
  }, []);

  useEffect(() => {
    const cancelWhenHidden = () => { if (document.visibilityState === "hidden") cancelVoiceInput(); };
    document.addEventListener("visibilitychange", cancelWhenHidden);
    window.addEventListener("pagehide", cancelVoiceInput);
    window.addEventListener("spndrr-speech-interrupt", cancelVoiceInput);
    window.addEventListener(speechPreferencesChanged, cancelVoiceInput);
    window.addEventListener("storage", cancelVoiceInput);
    return () => {
      cancelVoiceInput();
      document.removeEventListener("visibilitychange", cancelWhenHidden);
      window.removeEventListener("pagehide", cancelVoiceInput);
      window.removeEventListener("spndrr-speech-interrupt", cancelVoiceInput);
      window.removeEventListener(speechPreferencesChanged, cancelVoiceInput);
      window.removeEventListener("storage", cancelVoiceInput);
    };
  }, [cancelVoiceInput, scope]);

  const startVoiceInput = useCallback(async (override?: SpeechPrivacy) => {
    if (active.current || installation.current) return;
    const token = ++generation.current;
    const preferences = getSpeechPreferences();
    const privacy = override ?? preferences.privacy;
    const service = new LocalTranscriptionService(getTranscriptionProvider(privacy));
    active.current = service;
    setVoicePrompt(null);
    setIsListening(true);
    const timeout = window.setTimeout(() => {
      if (active.current === service) {
        cancelVoiceInput();
        callbacks.current.onError("Voice input timed out. Try again or keep typing.");
      }
    }, 45000);
    try {
      const result = await service.transcribe({ language: preferences.language, privacy }, event => {
        if (generation.current === token && event.type === "partial") setPartialTranscript(event.text);
      });
      if (generation.current === token && result) callbacks.current.onFinal(result);
    } catch (error) {
      if (generation.current !== token) return;
      const message = error instanceof Error ? error.message : "Speech could not start. Try again or keep typing.";
      if (privacy === "local-only" && error instanceof SpeechError && ["unavailable", "download-required", "privacy"].includes(error.code)) {
        setVoicePrompt({ message, canInstall: error.code === "download-required" });
      } else callbacks.current.onError(message);
    } finally {
      window.clearTimeout(timeout);
      if (active.current === service) {
        active.current = null;
        setIsListening(false);
        setPartialTranscript("");
      }
    }
  }, [cancelVoiceInput]);

  const installVoiceLanguage = useCallback(async () => {
    if (installation.current) return;
    installation.current = true;
    const token = generation.current;
    setIsInstallingVoice(true);
    try {
      await installBrowserLanguage(getSpeechPreferences().language);
      if (generation.current === token) setVoicePrompt(null);
    } catch (error) {
      if (generation.current === token) callbacks.current.onError(error instanceof Error ? error.message : "Speech download failed.");
    } finally {
      installation.current = false;
      setIsInstallingVoice(false);
    }
  }, []);

  return {
    isListening, partialTranscript, voicePrompt, isInstallingVoice, cancelVoiceInput, installVoiceLanguage,
    toggleVoiceInput: () => active.current ? cancelVoiceInput() : void startVoiceInput(),
    useSystemVoiceOnce: () => void startVoiceInput("allow-system"),
  };
}
