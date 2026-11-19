import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTheme } from './ThemeProvider';

export function Card({ children, tone = 'surface', padding }: {
  children: ReactNode; tone?: 'surface' | 'tonal'; padding?: number;
}) {
  const { color, radius, elevation, layout, scheme } = useTheme();
  return (
    <View style={[{ backgroundColor: tone === 'tonal' ? color.surfaceTonal : color.surface,
      borderRadius: radius.xl, padding: padding ?? layout.cardPad },
      scheme === 'light' ? elevation.level1 : { borderWidth: 1, borderColor: color.outline }]}>
      {children}
    </View>
  );
}
