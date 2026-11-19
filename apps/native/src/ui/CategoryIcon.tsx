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

const glyphs: Record<CategoryIconKind, IconName> = {
  cat: { android: 'shopping_bag', ios: 'bag' },
  income: { android: 'payments', ios: 'banknote' },
  transfer: { android: 'swap_horiz', ios: 'arrow.left.arrow.right' },
};

export function categoryIndex(name: string | null | undefined) {
  if (!name) return 7;
  let hash = 0;
  for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % 7;
}

export function CategoryIcon({ category, kind = 'cat', size = 44, icon = glyphs[kind] }: {
  category: number | string | null | undefined; kind?: CategoryIconKind; size?: number; icon?: IconName;
}) {
  const theme = useTheme();
  const colors = categoryIconColors(theme, typeof category === 'number' ? category : categoryIndex(category), kind);
  return (
    <View style={{ width: size, height: size, borderRadius: theme.radius.m, alignItems: 'center',
      justifyContent: 'center', backgroundColor: colors.background }}>
      <IconGlyph name={icon} size={Math.round(size * 0.5)} tintColor={colors.glyph} />
    </View>
  );
}
