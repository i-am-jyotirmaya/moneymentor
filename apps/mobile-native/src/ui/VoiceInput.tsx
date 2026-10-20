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
  const generation = useRef(0); const permissionPending = useRef(false); const started = useRef(false);
  const draining = useRef(false); const [settling, setSettling] = useState(false);
  const finish = () => { active.current = false; if (alive.current) { setPhase('idle'); onBusyChange(false); } };
  const cancel = () => {
    active.current = false; generation.current++;
    // Do not start another native session before the old stream ends. Its late
    // result events carry no session identifier and must never enter a new draft.
    draining.current = started.current; setSettling(started.current || permissionPending.current);
    if (started.current) ExpoSpeechRecognitionModule.abort();
    finish(); setPreview('');
  };
  useEffect(() => {
    alive.current = true;
    const subscription = AppState.addEventListener('change', next => {
      // iOS marks its own permission dialog inactive. Only an actual background
      // transition should cancel that request; an existing recording stops on
      // either interruption.
      if (next === 'background' || (next === 'inactive' && started.current)) {
        active.current = false; generation.current++; draining.current = started.current;
        setSettling(started.current || permissionPending.current); setPreview('');
        if (started.current) ExpoSpeechRecognitionModule.abort();
        setPhase('idle'); onBusyChange(false);
      }
    });
    return () => { alive.current = false; active.current = false; generation.current++; subscription.remove(); if (started.current) ExpoSpeechRecognitionModule.abort(); };
  }, [onBusyChange]);
  useSpeechRecognitionEvent('start', () => { if (active.current) setPhase('listening'); else ExpoSpeechRecognitionModule.abort(); });
  useSpeechRecognitionEvent('end', () => {
    started.current = false; draining.current = false;
    if (alive.current) setSettling(permissionPending.current);
    finish();
  });
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
    draining.current = started.current; setSettling(started.current); finish();
  });
  const recognize = async (onDevice: boolean) => {
    if (disabled || active.current || draining.current || permissionPending.current || !alive.current) return;
    const request = ++generation.current; permissionPending.current = true;
    active.current = true; prefix.current = text.trim(); setError(null); setPreview(''); setPhase('requesting'); onBusyChange(true);
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (request !== generation.current || !active.current || !alive.current) return;
      if (!permission.granted) { setDenied(true); setError('Microphone or speech permission was denied. You can still type your message.'); finish(); return; }
      setDenied(false);
      started.current = true;
      ExpoSpeechRecognitionModule.start({ lang: 'en-IN', interimResults: true, continuous: false, requiresOnDeviceRecognition: onDevice });
    } catch {
      if (request === generation.current && alive.current) {
        started.current = false; setError('Dictation is unavailable. You can type instead.'); finish();
      }
    } finally {
      permissionPending.current = false;
      if (alive.current) setSettling(draining.current);
    }
  };
  const begin = () => {
    if (disabled || active.current || draining.current || permissionPending.current) return;
    try {
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) { setError('Speech recognition is not available on this device. You can type instead.'); return; }
      if (ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) void recognize(true);
      else Alert.alert('Use your system speech service?', 'Your speech provider may process audio online. Review the text before sending it to Spndrr.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Use dictation', onPress: () => { void recognize(false); } },
      ]);
    } catch { setError('Speech recognition is not available on this device. You can type instead.'); }
  };
  return <View style={{ gap: 10 }}>
    {phase === 'idle' ? <Button title="Use voice" secondary disabled={disabled || settling} onPress={begin} /> : <>
      <Text accessibilityLiveRegion="polite" style={styles.caption}>{phase === 'requesting' ? 'Checking speech permissions…' : phase === 'stopping' ? 'Finishing dictation…' : 'Listening…'}</Text>
      <Button title="Finish dictation" secondary disabled={phase !== 'listening'} onPress={() => { setPhase('stopping'); ExpoSpeechRecognitionModule.stop(); }} />
      <Button title="Cancel dictation" secondary onPress={cancel} />
    </>}
    {settling ? <Text style={styles.caption}>Finishing the previous dictation. You can keep typing.</Text> : null}
    {preview ? <Text accessibilityLiveRegion="polite" style={styles.caption}>{preview}</Text> : null}
    {error ? <ErrorNotice message={error} /> : null}
    {denied ? <Button title="Open speech permissions" secondary onPress={() => { void Linking.openSettings().catch(() => setError('Open your device Settings to change microphone and speech permissions.')); }} /> : null}
  </View>;
}
