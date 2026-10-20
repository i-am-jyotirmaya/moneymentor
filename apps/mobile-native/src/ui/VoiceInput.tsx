import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Text, View } from 'react-native';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { Button, ErrorNotice, styles } from './primitives';

export function VoiceInput({ text, disabled, onTranscript, onBusyChange }: {
  text: string; disabled: boolean; onTranscript: (value: string) => void; onBusyChange: (busy: boolean) => void;
}) {
  const [phase, setPhase] = useState<'idle' | 'requesting' | 'listening' | 'stopping'>('idle');
  const [preview, setPreview] = useState(''); const [error, setError] = useState<string | null>(null); const [denied, setDenied] = useState(false);
  const alive = useRef(true); const active = useRef(false); const prefix = useRef('');
  const finish = () => { active.current = false; if (alive.current) { setPhase('idle'); onBusyChange(false); } };
  const cancel = () => { active.current = false; ExpoSpeechRecognitionModule.abort(); finish(); setPreview(''); };
  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => {
      if (next !== 'active') { active.current = false; ExpoSpeechRecognitionModule.abort(); setPhase('idle'); onBusyChange(false); }
    });
    return () => { alive.current = false; active.current = false; subscription.remove(); ExpoSpeechRecognitionModule.abort(); };
  }, [onBusyChange]);
  useSpeechRecognitionEvent('start', () => { if (active.current) setPhase('listening'); else ExpoSpeechRecognitionModule.abort(); });
  useSpeechRecognitionEvent('end', finish);
  useSpeechRecognitionEvent('result', event => {
    if (!active.current || !alive.current) return;
    const transcript = event.results[0]?.transcript ?? '';
    setPreview(transcript);
    if (event.isFinal) {
      const next = `${prefix.current}${prefix.current ? ' ' : ''}${transcript}`;
      if (next.length > 4000) { setError('That dictation is too long. Try a shorter phrase.'); cancel(); }
      else onTranscript(next);
    }
  });
  useSpeechRecognitionEvent('error', event => {
    if (!alive.current || !active.current) return;
    if (event.error !== 'aborted') setError(event.error === 'not-allowed' ? 'Microphone or speech permission is unavailable. You can enable it in Settings.'
      : event.error === 'no-speech' ? 'No speech was heard. Try again when you are ready.' : 'Dictation could not finish. You can type or try again.');
    finish();
  });
  const recognize = async (onDevice: boolean) => {
    if (disabled || active.current || !alive.current) return;
    active.current = true; prefix.current = text.trim(); setError(null); setPreview(''); setPhase('requesting'); onBusyChange(true);
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!active.current || !alive.current) return;
      if (!permission.granted) { setDenied(true); setError('Microphone or speech permission was denied. You can still type your message.'); finish(); return; }
      setDenied(false);
      ExpoSpeechRecognitionModule.start({ lang: 'en-IN', interimResults: true, continuous: false, requiresOnDeviceRecognition: onDevice });
    } catch { setError('Dictation is unavailable. You can type instead.'); finish(); }
  };
  const begin = () => {
    if (disabled || active.current) return;
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) { setError('Speech recognition is not available on this device. You can type instead.'); return; }
    if (ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) void recognize(true);
    else Alert.alert('Use your system speech service?', 'Your speech provider may process audio online. Review the text before sending it to Spndrr.', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Use dictation', onPress: () => { void recognize(false); } },
    ]);
  };
  return <View style={{ gap: 10 }}>
    {phase === 'idle' ? <Button title="Use voice" secondary disabled={disabled} onPress={begin} /> : <>
      <Text accessibilityLiveRegion="polite" style={styles.caption}>{phase === 'requesting' ? 'Checking speech permissions…' : phase === 'stopping' ? 'Finishing dictation…' : 'Listening…'}</Text>
      <Button title="Finish dictation" secondary disabled={phase !== 'listening'} onPress={() => { setPhase('stopping'); ExpoSpeechRecognitionModule.stop(); }} />
      <Button title="Cancel dictation" secondary onPress={cancel} />
    </>}
    {preview ? <Text accessibilityLiveRegion="polite" style={styles.caption}>{preview}</Text> : null}
    {error ? <ErrorNotice message={error} /> : null}
    {denied ? <Button title="Open speech permissions" secondary onPress={() => { void Linking.openSettings(); }} /> : null}
  </View>;
}
