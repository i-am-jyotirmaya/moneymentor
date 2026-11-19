import { View } from 'react-native';
import { IconGlyph, type IconName } from './Icon';
import { mixHex } from './color';
import { useTheme } from './ThemeProvider';
import type { Theme } from './theme';

export type CategoryIconKind = 'cat' | 'income' | 'transfer';

export function categoryIconColors({ color, category, scheme }: Theme, index: number, kind: CategoryIconKind = 'cat') {
  if (kind === 'income') return { background: color.incomeContainer, glyph: color.income };
  const categoryColor = category[Math.min(7, Math.max(0, Math.trunc(index) || 0))];
  const source = kind === 'transfer' ? color.text2 : categoryColor;
  return {
    background: mixHex(color.surface, source, scheme === 'dark' ? 0.16 : 0.1),
    glyph: kind === 'transfer' || scheme === 'dark' ? source : mixHex(source, color.text, 0.3),
  };
}

export function CategoryIcon({ category, kind = 'cat', size = 44, icon }: {
  category: number; kind?: CategoryIconKind; size?: number; icon: IconName;
}) {
  const theme = useTheme();
  const colors = categoryIconColors(theme, category, kind);
  return (
    <View style={{ width: size, height: size, borderRadius: theme.radius.m, alignItems: 'center',
      justifyContent: 'center', backgroundColor: colors.background }}>
      <IconGlyph name={icon} size={Math.round(size * 20 / 44)} tintColor={colors.glyph} />
    </View>
  );
}
