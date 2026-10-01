"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LocalTranscriptionService, SpeechError, installBrowserLanguage } from "../../../../packages/spndrr-speech/src/index";
import type { SpeechPrivacy, TranscriptionResult } from "../../../../packages/spndrr-speech/src/index";
import { modelChanged } from "@/lib/speech/downloaded-model";
import { getTranscriptionProvider } from "@/lib/platform";
import { getSpeechPreferences, speechPreferencesChanged } from "@/lib/speech-preferences";

export function useSpeechInput(onFinal: (result: TranscriptionResult) => void, onError: (message: string) => void, scope: string) {
  const [isListening, setIsListening] = useState(false);
  const [voicePhase, setVoicePhase] = useState<"loading" | "recording" | "transcribing">("recording");
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
    window.addEventListener(modelChanged, cancelVoiceInput);
    window.addEventListener("storage", cancelVoiceInput);
    return () => {
      cancelVoiceInput();
      document.removeEventListener("visibilitychange", cancelWhenHidden);
      window.removeEventListener("pagehide", cancelVoiceInput);
      window.removeEventListener("spndrr-speech-interrupt", cancelVoiceInput);
      window.removeEventListener(speechPreferencesChanged, cancelVoiceInput);
      window.removeEventListener(modelChanged, cancelVoiceInput);
      window.removeEventListener("storage", cancelVoiceInput);
    };
  }, [cancelVoiceInput, scope]);

  const startVoiceInput = useCallback(async (override?: SpeechPrivacy) => {
    if (active.current || installation.current) return;
    const token = ++generation.current;
    const preferences = getSpeechPreferences();
    const privacy = override ?? preferences.privacy;
    let service: LocalTranscriptionService | undefined;
    setVoicePhase(preferences.engine === "whisper" && !override ? "loading" : "recording");
    setVoicePrompt(null);
    setIsListening(true);
    const timeout = window.setTimeout(() => {
      if (generation.current === token) {
        cancelVoiceInput();
        callbacks.current.onError("Voice input timed out. Try again or keep typing.");
      }
    }, preferences.engine === "whisper" && !override ? 210000 : 45000);
    try {
      service = new LocalTranscriptionService(getTranscriptionProvider(privacy, override ? "browser" : preferences.engine));
      active.current = service;
      const result = await service.transcribe({ language: preferences.language, privacy }, event => {
        if (generation.current !== token) return;
        if (event.type === "partial") setPartialTranscript(event.text);
        if (event.type === "recording" || event.type === "speech-start") setVoicePhase("recording");
        if (event.type === "speech-end") setVoicePhase("transcribing");
      });
      if (generation.current === token && result) callbacks.current.onFinal(result);
    } catch (error) {
      if (generation.current !== token) return;
      const message = error instanceof Error ? error.message : "Speech could not start. Try again or keep typing.";
      if (error instanceof SpeechError && (error.code === "download-required" || privacy === "local-only" && ["unavailable", "privacy"].includes(error.code))) {
        setVoicePrompt({ message, canInstall: preferences.engine === "browser" && error.code === "download-required" });
      } else callbacks.current.onError(message);
    } finally {
      window.clearTimeout(timeout);
      if (generation.current === token) {
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
    isListening, voicePhase, partialTranscript, voicePrompt, isInstallingVoice, cancelVoiceInput, installVoiceLanguage,
    toggleVoiceInput: () => active.current ? cancelVoiceInput() : void startVoiceInput(),
    useSystemVoiceOnce: () => void startVoiceInput("allow-system"),
  };
}
