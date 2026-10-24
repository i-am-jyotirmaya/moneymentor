import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Appearance as NativeAppearance, useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type Appearance = 'system' | 'light' | 'dark';
const light = {
  background: '#f4f7f6', surface: '#ffffff', ink: '#102b26', muted: '#61736e',
  border: '#dce6e2', accent: '#0e8878', accentEnd: '#126f66', tint: '#e3f4ef',
  danger: '#9b1c1c', dangerTint: '#fff1f0', positive: '#087865',
  hero: '#102b26', heroEnd: '#195d50', onHero: '#ffffff', heroMuted: '#c9e5dc',
  onAccent: '#ffffff', shadow: 'rgba(16, 43, 38, 0.07)',
};
export type Palette = typeof light;
const dark: Palette = {
  background: '#0c1716', surface: '#152623', ink: '#edf7f3', muted: '#a5bcb4',
  border: '#2d4640', accent: '#74dbc1', accentEnd: '#a0e8d2', tint: '#203d35',
  danger: '#ffb4ad', dangerTint: '#442624', positive: '#87e1be',
  hero: '#173f35', heroEnd: '#246554', onHero: '#ffffff', heroMuted: '#d0e9e1',
  onAccent: '#092b23', shadow: 'rgba(0, 0, 0, 0.18)',
};
export const palettes = { light, dark };
export const motion = { spring: { damping: 22, stiffness: 260, mass: 0.8 }, feedbackMs: 140, enterMs: 220 };
export type AppearanceStorage = { get: () => Promise<string | null>; set: (value: string) => Promise<void> };
const storage: AppearanceStorage = {
  get: () => SecureStore.getItemAsync('spndrr-appearance-v1'),
  set: value => SecureStore.setItemAsync('spndrr-appearance-v1', value),
};
type Theme = { color: Palette; mode: 'light' | 'dark'; preference: Appearance; setPreference: (value: Appearance) => void; error: string | null };
const ThemeContext = createContext<Theme>({ color: light, mode: 'light', preference: 'system', setPreference: () => undefined, error: null });
export function ThemeProvider({ children, appearanceStorage = storage, initialPreference = 'system' }: {
  children: ReactNode; appearanceStorage?: AppearanceStorage; initialPreference?: Appearance;
}) {
  const system = useColorScheme();
  const [preference, setValue] = useState<Appearance>(initialPreference);
  const [error, setError] = useState<string | null>(null);
  const revision = useRef(0); const queue = useRef(Promise.resolve());
  useEffect(() => {
    let alive = true; const before = revision.current;
    void appearanceStorage.get().then(value => {
      if (alive && revision.current === before && (value === 'system' || value === 'light' || value === 'dark')) setValue(value);
    }).catch(() => { if (alive && revision.current === before) setError('Your saved appearance could not be loaded. Choose it again to save it.'); });
    return () => { alive = false; };
  }, [appearanceStorage]);
  useEffect(() => { NativeAppearance.setColorScheme(preference === 'system' ? 'unspecified' : preference); }, [preference]);
  const mode = preference === 'system' ? system === 'dark' ? 'dark' : 'light' : preference;
  const value = useMemo<Theme>(() => ({ color: palettes[mode], mode, preference, error, setPreference: next => {
    const current = ++revision.current; setValue(next); setError(null);
    queue.current = queue.current.catch(() => undefined).then(() => appearanceStorage.set(next)).catch(() => {
      if (revision.current === current) setError('Appearance changed for now, but could not be saved on this device. Try choosing it again.');
    });
  } }), [mode, preference, error, appearanceStorage]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export function useTheme() { return useContext(ThemeContext); }
