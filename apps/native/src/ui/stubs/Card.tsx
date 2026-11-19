// TODO(A2): replace with A2 Card.
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../ThemeProvider';

export function Card({ children, tone = 'surface', padding, style, testID }: { children: ReactNode; tone?: 'surface' | 'tonal'; padding?: number; style?: StyleProp<ViewStyle>; testID?: string }) {
  const { color, elevation, layout, radius, scheme } = useTheme();
  return <View testID={testID} style={[{
    backgroundColor: tone === 'tonal' ? color.surfaceTonal : color.surface, borderRadius: radius.xl, padding: padding ?? layout.cardPad, gap: 12,
  }, scheme === 'dark' ? { borderWidth: 1, borderColor: color.outline } : elevation.level1, style]}>{children}</View>;
}
