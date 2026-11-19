// B3: the pre-revamp `colors` / `styles` / `ws` shapes, rebuilt from the live theme so older
// forms (planning editors, household members, accounts, privacy flows) are dark-correct without
// rewriting every field at once. New UI should use A2 primitives and `useThemedStyles` directly.
import type { TextStyle, ViewStyle } from 'react-native';
import { useTheme, type ThemeValue } from '../ui/ThemeProvider';
import { useThemedStyles } from '../ui/useThemedStyles';

export function legacyColors({ color }: Pick<ThemeValue, 'color'>) {
  return {
    background: color.bg, ink: color.text, muted: color.text2, muted2: color.text3,
    surface: color.surfaceSunken, border: color.outline, accent: color.primaryText,
    accentSoft: color.primaryContainer, danger: color.negative, dangerBg: color.negativeContainer, dangerBorder: color.negative,
  };
}
export type LegacyColors = ReturnType<typeof legacyColors>;

const cardSurface = (t: ThemeValue): ViewStyle => t.scheme === 'dark'
  ? { backgroundColor: t.color.surface, borderWidth: 1, borderColor: t.color.outline }
  : { backgroundColor: t.color.surface, ...t.elevation.level1 };

export const makeLegacyStyles = (t: ThemeValue) => ({
  page: { flexGrow: 1, padding: t.layout.gutter, justifyContent: 'center', backgroundColor: t.color.bg } as ViewStyle,
  card: { width: '100%', maxWidth: 460, alignSelf: 'center', ...cardSurface(t), borderRadius: t.radius.xl, padding: t.layout.cardPad, gap: 16 } as ViewStyle,
  title: { ...t.type.headline, color: t.color.text } as TextStyle,
  text: { ...t.type.body, color: t.color.text2 } as TextStyle,
  label: { ...t.type.label, color: t.color.text } as TextStyle,
  field: { gap: 8 } as ViewStyle,
  input: { ...t.type.body, minWidth: 48, minHeight: 56, borderWidth: 1, borderColor: t.color.outlineStrong, borderRadius: t.radius.m, paddingHorizontal: 16, paddingVertical: 12, color: t.color.text, backgroundColor: t.scheme === 'dark' ? t.color.surfaceSunken : t.color.surface } as TextStyle,
  button: { minWidth: 48, minHeight: 56, borderRadius: t.radius.l, paddingHorizontal: 20, paddingVertical: 14, backgroundColor: t.color.primary, alignItems: 'center', justifyContent: 'center' } as ViewStyle,
  buttonText: { ...t.type.label, color: t.color.onPrimary, textAlign: 'center' } as TextStyle,
  link: { ...t.type.label, color: t.color.primaryText } as TextStyle,
  linkTarget: { minWidth: 48, minHeight: 48, justifyContent: 'center', paddingVertical: 10 } as ViewStyle,
  error: { ...t.type.body, color: t.color.negative, backgroundColor: t.color.negativeContainer, borderRadius: t.radius.m, padding: 12 } as TextStyle,
});

export const makeLegacyWs = (t: ThemeValue) => ({
  fill: { flex: 1, backgroundColor: t.color.bg } as ViewStyle,
  content: { padding: t.layout.gutter, gap: 16 } as ViewStyle,
  card: { ...cardSurface(t), borderRadius: t.radius.xl, padding: t.layout.cardPad, gap: 12 } as ViewStyle,
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' } as ViewStyle,
  heading: { ...t.type.title, color: t.color.text } as TextStyle,
  small: { ...t.type.caption, color: t.color.text2 } as TextStyle,
  item: { padding: 12, borderRadius: t.radius.l, backgroundColor: t.color.surfaceSunken, gap: 8 } as ViewStyle,
  action: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, flexShrink: 1, minHeight: 48, minWidth: 48, paddingVertical: 12, paddingHorizontal: 16, justifyContent: 'center', borderRadius: t.radius.l } as ViewStyle,
  selected: { backgroundColor: t.color.primaryContainer } as ViewStyle,
  scrim: { flex: 1, backgroundColor: t.color.scrim, justifyContent: 'flex-end' } as ViewStyle,
  sheet: { backgroundColor: t.color.surfaceRaised, borderTopLeftRadius: t.radius.xl, borderTopRightRadius: t.radius.xl } as ViewStyle,
});

/** Themed drop-in for `import { colors, styles } from '../ui/theme'` and `ws`. */
export function useLegacy() {
  const theme = useTheme();
  const styles = useThemedStyles(makeLegacyStyles);
  const ws = useThemedStyles(makeLegacyWs);
  return { styles, ws, colors: legacyColors(theme) };
}
