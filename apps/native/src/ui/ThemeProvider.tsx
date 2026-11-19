import * as SystemUI from 'expo-system-ui';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StatusBar, useColorScheme, useWindowDimensions } from 'react-native';
import { darkTheme, layout, lightTheme, motion, radius, space, type, type Theme } from './theme';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ColorScheme = 'light' | 'dark';

export function statusBarStyleFor(scheme: ColorScheme) {
  return scheme === 'dark' ? 'light-content' : 'dark-content';
}

export function resolveScheme(
  preference: ThemePreference,
  system: string | null | undefined,
): ColorScheme {
  if (preference !== 'system') return preference;
  return system === 'dark' ? 'dark' : 'light';
}

export type ThemeTokens = Theme & {
  type: typeof type;
  space: typeof space;
  layout: typeof layout;
  radius: typeof radius;
  motion: typeof motion;
};

export type ThemeValue = ThemeTokens & {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  fontScale: number;
};

export function buildTheme(
  scheme: ColorScheme,
  fontScale = 1,
): Omit<ThemeValue, 'preference' | 'setPreference'> {
  const theme = scheme === 'dark' ? darkTheme : lightTheme;
  return { ...theme, type, space, layout, radius, motion, fontScale };
}

const ThemeContext = createContext<ThemeValue>({
  ...buildTheme('light'),
  preference: 'system',
  setPreference: () => {},
});

export function ThemeProvider({
  children,
  preference,
  onPreferenceChange,
}: {
  children: ReactNode;
  preference?: ThemePreference;
  onPreferenceChange?: (preference: ThemePreference) => void;
}) {
  const [internalPreference, setInternalPreference] = useState<ThemePreference>('system');
  const isControlled = preference !== undefined;
  const currentPreference = preference ?? internalPreference;
  const scheme = resolveScheme(currentPreference, useColorScheme());
  const { fontScale } = useWindowDimensions();

  const setPreference = useCallback((next: ThemePreference) => {
    if (!isControlled) setInternalPreference(next);
    onPreferenceChange?.(next);
  }, [isControlled, onPreferenceChange]);

  const value = useMemo(() => ({
    ...buildTheme(scheme, fontScale),
    preference: currentPreference,
    setPreference,
  }), [scheme, fontScale, currentPreference, setPreference]);

  const { bg } = value.color;
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(bg).catch(() => {});
  }, [scheme, bg]);

  return (
    <ThemeContext.Provider value={value}>
      {/* RN 0.88 is edge-to-edge: the bars are transparent, so only the icon style follows the theme. */}
      <StatusBar barStyle={statusBarStyleFor(scheme)} />
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}
