import { isLoaded } from 'expo-font';
import { Text as NativeText, type TextProps, type TextStyle } from 'react-native';
import { useTheme, type ThemeValue } from './ThemeProvider';
import { type type } from './theme';

export type TextTone = 'text' | 'text2' | 'text3' | 'primaryText' | 'income' | 'negative' | 'warning' | 'onHero' | 'onHeroMuted';
export type TextVariant = keyof typeof type;

export function defaultMaxFontSizeMultiplier(variant: TextVariant): number {
  return variant === 'displayXl' || variant === 'display' || variant === 'numberL' ? 1.5 : 2;
}

export function textStyleFor(
  theme: Pick<ThemeValue, 'type' | 'color'>,
  variant: TextVariant,
  tone: TextTone = 'text',
  numeric = false,
): TextStyle {
  const { fontFamily, ...typography } = theme.type[variant];
  const color = theme.color[tone];

  if (numeric) {
    // The generated tokens encode weight in the family name.
    const weight = Number(fontFamily.split('_')[1].slice(0, 3));
    return {
      ...typography,
      color,
      fontFamily: weight >= 600 ? 'InterTight_700Bold' : 'InterTight_600SemiBold',
      fontVariant: ['tabular-nums', 'lining-nums'],
    };
  }

  return { ...typography, color, fontFamily };
}

export function Text({
  variant = 'body',
  tone = 'text',
  numeric = false,
  maxFontSizeMultiplier,
  style,
  ...rest
}: TextProps & { variant?: TextVariant; tone?: TextTone; numeric?: boolean }) {
  const theme = useTheme();
  const { fontFamily, ...typography } = textStyleFor(theme, variant, tone, numeric);

  return (
    <NativeText
      {...rest}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? defaultMaxFontSizeMultiplier(variant)}
      style={[typography, fontFamily && isLoaded(fontFamily) ? { fontFamily } : undefined, style]}
    />
  );
}
