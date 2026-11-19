import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useTheme, type ThemeValue } from './ThemeProvider';

type NamedStyles = Parameters<typeof StyleSheet.create>[0];

const stylesByFactory = new WeakMap<object, Map<string, object>>();

export function createThemedStyles<T extends NamedStyles>(
  factory: (t: ThemeValue) => T,
  theme: ThemeValue,
): T {
  let stylesByTheme = stylesByFactory.get(factory);
  if (!stylesByTheme) {
    stylesByTheme = new Map();
    stylesByFactory.set(factory, stylesByTheme);
  }

  const key = `${theme.scheme}:${theme.fontScale}`;
  // Each factory key stores only styles returned by that factory.
  const cached = stylesByTheme.get(key) as T | undefined;
  if (cached) return cached;

  const styles = StyleSheet.create(factory(theme));
  stylesByTheme.set(key, styles);
  return styles;
}

/**
 * Define the factory at module scope:
 * `const makeStyles = (t: ThemeValue) => ({ card: { backgroundColor: t.color.surface } })`.
 * Inside the component, use `const s = useThemedStyles(makeStyles)`.
 * Factories should depend only on tokens and font scale. The legacy `colors` and
 * `styles` exports stay light and are deprecated.
 */
export function useThemedStyles<T extends NamedStyles>(
  factory: (t: ThemeValue) => T,
): T {
  const theme = useTheme();
  const { scheme, fontScale } = theme;
  // The factory cache and hook memo both key on scheme and font scale.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => createThemedStyles(factory, theme), [factory, scheme, fontScale]);
}
