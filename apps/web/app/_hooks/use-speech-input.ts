"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BackendTranscriptionProvider, LocalTranscriptionService, SpeechError, installBrowserLanguage } from "../../../../packages/spndrr-speech/src/index";
import type { SpeechPrivacy, TranscriptionResult } from "../../../../packages/spndrr-speech/src/index";
import { modelChanged } from "@/lib/speech/downloaded-model";
import { getTranscriptionProvider, isNativeSpeechPlatform } from "@/lib/platform";
import { getSpeechPreferences, speechPreferencesChanged } from "@/lib/speech-preferences";
import { getSpeechBackend, transcribeAudio, type SpeechBackendCapabilities } from "@/lib/api";

export function useSpeechInput(onFinal: (result: TranscriptionResult) => void, onError: (message: string) => void, scope: string) {
  const [isListening, setIsListening] = useState(false);
  const [voicePhase, setVoicePhase] = useState<"loading" | "recording" | "transcribing">("recording");
  const [partialTranscript, setPartialTranscript] = useState("");
  const [voicePrompt, setVoicePrompt] = useState<{ message: string; canInstall: boolean; native: boolean; backend?: SpeechBackendCapabilities } | null>(null);
  const [voiceReview, setVoiceReview] = useState<TranscriptionResult | null>(null);
  const [isInstallingVoice, setIsInstallingVoice] = useState(false);
  const [isBackendRecording, setIsBackendRecording] = useState(false);
  const active = useRef<LocalTranscriptionService | null>(null);
  const preflight = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const installation = useRef(false);
  const callbacks = useRef({ onFinal, onError });
  useEffect(() => { callbacks.current = { onFinal, onError }; }, [onFinal, onError]);

  const cancelVoiceInput = useCallback(() => {
    generation.current++;
    preflight.current?.abort(); preflight.current = null;
    const service = active.current;
    active.current = null;
    void service?.cancel().catch(() => {});
    setIsListening(false); setIsBackendRecording(false);
    setPartialTranscript(""); setVoicePrompt(null); setVoiceReview(null);
  }, []);

  useEffect(() => {
    const cancelWhenHidden = () => { if (document.visibilityState === "hidden") cancelVoiceInput(); };
    document.addEventListener("visibilitychange", cancelWhenHidden);
    const events = ["pagehide", "spndrr-speech-interrupt", speechPreferencesChanged, modelChanged, "storage"];
    events.forEach(event => window.addEventListener(event, cancelVoiceInput));
    return () => {
      cancelVoiceInput();
      document.removeEventListener("visibilitychange", cancelWhenHidden);
      events.forEach(event => window.removeEventListener(event, cancelVoiceInput));
    };
  }, [cancelVoiceInput, scope]);

  const requestBackendVoice = useCallback(async () => {
    if (active.current || preflight.current || installation.current || isNativeSpeechPlatform()) return;
    const token = ++generation.current;
    setVoicePrompt(null);
    const controller = new AbortController(); preflight.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    try {
      const backend = await getSpeechBackend(controller.signal);
      if (generation.current !== token) return;
      if (!backend.enabled) throw new Error("Backend transcription is not enabled on this server. Use browser speech or keep typing.");
      setVoicePrompt({ message: "Use backend transcription for this recording?", canInstall: false, native: false, backend });
    } catch (error) {
      if (generation.current === token) callbacks.current.onError(error instanceof Error && error.name !== "AbortError" ? error.message : "Could not check backend transcription. Try again or keep typing.");
    } finally { window.clearTimeout(timeout); if (preflight.current === controller) preflight.current = null; }
  }, []);

  const startVoiceInput = useCallback(async (override?: SpeechPrivacy, backend?: SpeechBackendCapabilities) => {
    if (active.current || preflight.current || installation.current) return;
    const preferences = getSpeechPreferences();
    const native = isNativeSpeechPlatform();
    if (!native && preferences.engine === "backend" && !override && !backend) { await requestBackendVoice(); return; }
    if (backend && native) return;
    const token = ++generation.current;
    const privacy = backend ? "allow-backend" : override ?? preferences.privacy;
    const engine = native || override ? "browser" : preferences.engine === "whisper" ? "whisper" : "browser";
    let service: LocalTranscriptionService | undefined;
    setVoicePhase(engine === "whisper" || backend ? "loading" : "recording");
    setVoicePrompt(null); setVoiceReview(null); setIsListening(true); setIsBackendRecording(!!backend);
    const timeout = window.setTimeout(() => {
      if (generation.current === token) { cancelVoiceInput(); callbacks.current.onError("Voice input timed out. Try again or keep typing."); }
    }, engine === "whisper" ? 210000 : backend ? 75000 : 45000);
    try {
      const provider = backend ? new BackendTranscriptionProvider({
        model: backend.model, workletUrl: "/speech/backend-pcm-worklet.js",
        upload: (wav, language, signal) => transcribeAudio(wav, language, backend.consentVersion, signal),
      }) : getTranscriptionProvider(privacy, engine);
      service = new LocalTranscriptionService(provider); active.current = service;
      const result = await service.transcribe({ language: preferences.language, privacy }, event => {
        if (generation.current !== token) return;
        if (event.type === "partial") setPartialTranscript(event.text);
        if (event.type === "recording" || event.type === "speech-start") setVoicePhase("recording");
        if (event.type === "speech-end") setVoicePhase("transcribing");
      });
      if (generation.current === token && result) {
        if (native) callbacks.current.onFinal(result);
        else setVoiceReview(result);
      }
    } catch (error) {
      if (generation.current !== token) return;
      const message = error instanceof Error ? error.message : "Speech could not start. Try again or keep typing.";
      if (error instanceof SpeechError && (error.code === "download-required" || privacy === "local-only" && ["unavailable", "privacy"].includes(error.code))) {
        setVoicePrompt({ message, native, canInstall: !native && engine === "browser" && error.code === "download-required" });
      } else callbacks.current.onError(message);
    } finally {
      window.clearTimeout(timeout);
      if (generation.current === token) { active.current = null; setIsListening(false); setIsBackendRecording(false); setPartialTranscript(""); }
    }
  }, [cancelVoiceInput, requestBackendVoice]);

  const installVoiceLanguage = useCallback(async () => {
    if (installation.current) return;
    installation.current = true;
    const token = generation.current; setIsInstallingVoice(true);
    try { await installBrowserLanguage(getSpeechPreferences().language); if (generation.current === token) setVoicePrompt(null); }
    catch (error) { if (generation.current === token) callbacks.current.onError(error instanceof Error ? error.message : "Speech download failed."); }
    finally { installation.current = false; setIsInstallingVoice(false); }
  }, []);

  return {
    isListening, voicePhase, partialTranscript, voicePrompt, voiceReview, isInstallingVoice, isBackendRecording,
    cancelVoiceInput, installVoiceLanguage, requestBackendVoice,
    finishVoiceInput: () => { void active.current?.finish(); },
    confirmVoiceReview: (text: string) => {
      if (!voiceReview || !text.trim()) return;
      const result = { ...voiceReview, text: text.trim() };
      setVoiceReview(null); callbacks.current.onFinal(result);
    },
    toggleVoiceInput: () => active.current || preflight.current ? cancelVoiceInput() : void startVoiceInput(),
    useSystemVoiceOnce: () => void startVoiceInput("allow-system"),
    useBackendVoiceOnce: () => { if (voicePrompt?.backend) void startVoiceInput("allow-backend", voicePrompt.backend); },
  };
}
