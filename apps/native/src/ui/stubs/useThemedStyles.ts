// TODO(A2): replace with A2's useThemedStyles (same signature); this is a local stand-in.
import { useMemo } from 'react';
import { StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import { useTheme, type ThemeValue } from '../ThemeProvider';

type Styles = Record<string, ViewStyle | TextStyle | ImageStyle>;
export function useThemedStyles<T extends Styles>(factory: (theme: ThemeValue) => T): T {
  const theme = useTheme();
  // Rebuild only when the theme flips (scheme / font scale); factories are module-level.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create(factory(theme)) as T, [theme]);
}
