import { requireOptionalNativeModule } from 'expo';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

type SpeechModule = {
  recognize(locale: string): Promise<string | null>;
  stop(): Promise<void>;
  cancel(): Promise<void>;
};
const speech = Platform.OS === 'ios' || Platform.OS === 'android'
  ? requireOptionalNativeModule<SpeechModule>('SpndrrSpeech') : null;

export function useVoiceInput(onTranscript: (text: string) => void, onError: (message: string) => void, scope: string | null) {
  const [state, setState] = useState<'idle' | 'permission' | 'listening' | 'finishing'>('idle');
  const active = useRef(false);
  const generation = useRef(0);
  const cancel = useCallback(() => {
    generation.current++;
    active.current = false;
    setState('idle');
    void speech?.cancel().catch(() => undefined);
  }, []);
  useFocusEffect(useCallback(() => cancel, [cancel]));
  useEffect(() => cancel, [cancel, scope]);

  async function start() {
    if (active.current) return;
    if (!speech) { onError('Speech recognition is unavailable. Install the latest native build or type your message.'); return; }
    active.current = true;
    const id = ++generation.current;
    setState('permission');
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (id !== generation.current) return;
      if (!permission.granted) { onError('Microphone permission is required. You can enable it in Settings.'); return; }
      setState('listening');
      const transcript = (await speech.recognize('en-IN'))?.trim();
      if (id === generation.current && transcript) onTranscript(transcript.slice(0, 4000));
    } catch (error) {
      if (id === generation.current) onError(error instanceof Error ? error.message : 'Speech recognition failed. Please try again.');
    } finally {
      if (id === generation.current) { active.current = false; setState('idle'); }
    }
  }
  async function stop() {
    if (!speech || state !== 'listening') return;
    setState('finishing');
    try { await speech.stop(); } catch { cancel(); onError('Could not finish speech recognition. Please try again.'); }
  }
  return { state, start, stop, cancel };
}
