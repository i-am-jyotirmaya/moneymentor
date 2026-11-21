import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = (path: string) => readFileSync(join(__dirname, '..', path), 'utf8');
const root = 'modules/spndrr-speech';

test('Android recognition stays in Spndrr instead of launching a speech activity', () => {
  const android = source(`${root}/android/src/main/java/com/spndrr/speech/SpndrrSpeechModule.kt`);
  expect(android).toContain('SpeechRecognizer.createSpeechRecognizer');
  expect(android).toContain('service.startListening(');
  expect(android).toContain('recognizer?.stopListening()');
  expect(android).not.toMatch(/\b(?:startActivity|startActivityForResult|registerForActivityResult)\s*\(/);
});

test('iOS recognition uses an audio engine instead of presenting a dictation controller', () => {
  const ios = source(`${root}/ios/SpndrrSpeechModule.swift`);
  expect(ios).toContain('AVAudioEngine()');
  expect(ios).toContain('SFSpeechAudioBufferRecognitionRequest()');
  expect(ios).toContain('recognizer.recognitionTask(');
  expect(ios).not.toMatch(/\b(?:present|presentViewController)\s*\(/);
});

test('Spndrr owns the listening UI and cancellation', () => {
  const assistant = source('app/(tabs)/assistant.tsx');
  expect(assistant).toContain('Listening… Tap stop when finished.');
  expect(assistant).toContain('Stop voice input');
  expect(assistant).toContain('onPress={voice.cancel}');
});
