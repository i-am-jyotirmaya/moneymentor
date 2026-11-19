import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Platform, View } from 'react-native';
import { useTheme } from './ThemeProvider';
import type { ColorRole } from './theme';

export type IconName = SymbolViewProps['name'];

export function iconGlyphSize(box: number, fontScale: number) {
  return box / Math.max(fontScale, 1);
}

function filledSymbol<T extends string>(name: T): T {
  return (name.endsWith('.fill') ? name : `${name}.fill`) as T;
}

/** Internal renderer for calculated colors as well as themed icons. */
export function IconGlyph({ name, size, tintColor, accessibilityLabel }: {
  name: IconName; size: number; tintColor: string; accessibilityLabel?: string;
}) {
  const { fontScale } = useTheme();
  return (
    <View
      accessible={Boolean(accessibilityLabel)}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no-hide-descendants'}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <SymbolView name={name} size={Platform.OS === 'android' ? iconGlyphSize(size, fontScale) : size}
        tintColor={tintColor} style={{ width: size, height: size }} />
    </View>
  );
}

export function Icon({ name, size = 24, color = 'text', filled = false, accessibilityLabel }: {
  name: IconName; size?: number; color?: string; filled?: boolean; accessibilityLabel?: string;
}) {
  const theme = useTheme();
  // Android uses the outline glyph with the dock pill as the selected-state cue.
  if (filled && Platform.OS === 'ios') {
    if (typeof name === 'string') name = filledSymbol(name);
    else if (name.ios) name = { ...name, ios: filledSymbol(name.ios) };
  }
  return <IconGlyph name={name} size={size} tintColor={color in theme.color ? theme.color[color as ColorRole] : color} accessibilityLabel={accessibilityLabel} />;
}
