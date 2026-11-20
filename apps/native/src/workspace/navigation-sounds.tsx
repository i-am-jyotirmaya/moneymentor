import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

const preferenceKey = 'spndrr.navigation-sounds';
const cue = require('../../assets/navigation-cue.wav') as number;

const NavigationSoundsContext = createContext<{
  enabled: boolean | null;
  saveFailed: boolean;
  setEnabled: (value: boolean) => void;
} | null>(null);

export function NavigationSoundsProvider({ children, screen }: { children: ReactNode; screen: string | null }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const pendingWrite = useRef(Promise.resolve());

  useEffect(() => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
    let mounted = true;
    void SecureStore.getItemAsync(preferenceKey).then(
      stored => { if (mounted) setEnabled(stored !== 'off'); },
      () => { if (mounted) setEnabled(false); },
    );
    return () => { mounted = false; };
  }, []);

  const changePreference = useCallback((value: boolean) => {
    setEnabled(value);
    setSaveFailed(false);
    const write = pendingWrite.current.then(() => SecureStore.setItemAsync(preferenceKey, value ? 'on' : 'off'))
      .catch(() => { if (pendingWrite.current === write) setSaveFailed(true); });
    pendingWrite.current = write;
  }, []);

  return <NavigationSoundsContext.Provider value={{ enabled, saveFailed, setEnabled: changePreference }}>
    {enabled ? <NavigationCue screen={screen} /> : null}
    {children}
  </NavigationSoundsContext.Provider>;
}

export function useNavigationSounds() {
  const value = useContext(NavigationSoundsContext);
  if (!value) throw new Error('NavigationSoundsProvider is required.');
  return value;
}

function NavigationCue({ screen }: { screen: string | null }) {
  const player = useAudioPlayer(cue, { downloadFirst: true, allowsExternalPlayback: false });
  const [ready, setReady] = useState(false);
  const previousScreen = useRef(screen);

  useEffect(() => {
    let mounted = true;
    void setAudioModeAsync({
      playsInSilentMode: false,
      interruptionMode: 'mixWithOthers',
      shouldPlayInBackground: false,
    }).then(() => { if (mounted) setReady(true); }).catch(() => undefined);
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const previous = previousScreen.current;
    previousScreen.current = screen;
    if (!ready || !previous || !screen || previous === screen || AppState.currentState !== 'active') return;

    let current = true;
    void player.seekTo(0).then(() => {
      if (current && AppState.currentState === 'active') player.play();
    }).catch(() => undefined);
    return () => { current = false; };
  }, [player, ready, screen]);

  return null;
}
