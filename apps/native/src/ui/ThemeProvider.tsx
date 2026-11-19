import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme, useWindowDimensions } from 'react-native';
import { darkTheme, layout, lightTheme, motion, radius, space, type, type Theme } from './theme';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ColorScheme = 'light' | 'dark';

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

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}
