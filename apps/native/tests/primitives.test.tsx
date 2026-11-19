import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatInr } from '../src/lib/format';
import { badgeColors, type BadgeTone } from '../src/ui/Badge';
import { buttonColors, type ButtonVariant } from '../src/ui/Button';
import { categoryIconColors } from '../src/ui/CategoryIcon';
import { mixHex, withAlpha } from '../src/ui/color';
import { formatInrWorklet } from '../src/ui/countUpFormat';
import { heroLayout } from '../src/ui/HeroCard';
import { pressLayerColor } from '../src/ui/PressableScale';
import { darkTheme, lightTheme, type ColorRole } from '../src/ui/theme';
import { toastDuration } from '../src/ui/Toast';

describe.each([lightTheme, darkTheme])('$scheme primitives', theme => {
  const buttons: [ButtonVariant, ColorRole | null, ColorRole][] = [
    ['filled', 'primary', 'onPrimary'],
    ['tonal', 'primaryContainer', 'onPrimaryContainer'],
    ['outline', null, 'primaryText'],
    ['text', null, 'primaryText'],
    ['danger-text', null, 'negative'],
  ];
  test.each(buttons)('%s button uses theme colors', (variant, background, text) => {
    expect(buttonColors(theme, variant)).toEqual({
      background: background ? theme.color[background] : 'transparent',
      text: theme.color[text],
      border: variant === 'outline' ? theme.color.outlineStrong : 'transparent',
      pressed: variant === 'filled' ? theme.color.primaryPressed : undefined,
    });
  });

  const badges: [BadgeTone, ColorRole, ColorRole][] = [
    ['primary', 'primaryContainer', 'onPrimaryContainer'],
    ['income', 'incomeContainer', 'income'],
    ['negative', 'negativeContainer', 'negative'],
    ['warning', 'warningContainer', 'warning'],
    ['info', 'infoContainer', 'info'],
    ['dev', 'surfaceSunken', 'text2'],
  ];
  test.each(badges)('%s badge uses theme colors', (tone, background, text) => {
    expect(badgeColors(theme, tone)).toEqual({ background: theme.color[background], text: theme.color[text] });
  });

  test('press layers use scheme-specific opacity', () => {
    expect(pressLayerColor(theme, 'primary')).toBe(withAlpha(theme.color.primary, theme.scheme === 'light' ? 0.1 : 0.14));
    expect(pressLayerColor(theme, 'on-primary')).toBe(withAlpha(theme.color.onPrimary, 0.12));
    expect(pressLayerColor(theme, 'none')).toBe('transparent');
  });

  test('category tiles mix into the surface and clamp indexes', () => {
    const amount = theme.scheme === 'light' ? 0.1 : 0.16;
    expect(categoryIconColors(theme, 20)).toEqual({
      background: mixHex(theme.color.surface, theme.category[7], amount),
      glyph: theme.scheme === 'light' ? mixHex(theme.category[7], theme.color.text, 0.3) : theme.category[7],
    });
    expect(categoryIconColors(theme, -1)).toEqual(categoryIconColors(theme, 0));
    expect(categoryIconColors(theme, 0, 'income')).toEqual({ background: theme.color.incomeContainer, glyph: theme.color.income });
    expect(categoryIconColors(theme, 0, 'transfer')).toEqual({
      background: mixHex(theme.color.surface, theme.color.text2, amount), glyph: theme.color.text2,
    });
  });
});

test('toast duration depends on whether an action is present', () => {
  expect(toastDuration(false)).toBe(4000);
  expect(toastDuration(true)).toBe(6000);
});

test('hero stacks pills and moves the gauge at 1.3 font scale', () => {
  expect(heroLayout(1)).toEqual({ stacked: false, gaugePosition: 'top-right', gaugeScale: 1 });
  expect(heroLayout(1.3)).toEqual({ stacked: true, gaugePosition: 'bottom-right', gaugeScale: 0.82 });
});

test.each([0, 5, 999, 1000, 123456, -1240, 10000000])('worklet formats %i like formatInr', value => {
  for (const sign of ['auto', 'always', 'never'] as const) {
    expect(formatInrWorklet(value, sign)).toBe(formatInr(value, { sign }));
  }
});

test('color helpers convert channels and round mixed colors', () => {
  expect(withAlpha('#123456', 0.14)).toBe('rgba(18, 52, 86, 0.14)');
  expect(mixHex('#000000', '#FFFFFF', 0.5)).toBe('#808080');
  expect(mixHex('#123456', '#abcdef', 0)).toBe('#123456');
  expect(mixHex('#123456', '#abcdef', 1)).toBe('#abcdef');
});

const ui = join(__dirname, '../src/ui');
const sources = readdirSync(ui, { recursive: true, encoding: 'utf8' })
  .filter(file => /\.[jt]sx?$/.test(file) && file !== 'theme.ts');

test.each(sources)('%s uses theme colors and allows font scaling', file => {
  const source = readFileSync(join(ui, file), 'utf8');
  expect(source).not.toMatch(/#[\da-f]{6}\b/i);
  expect(source).not.toMatch(/allowFontScaling\s*=\s*\{\s*false\s*\}/);
});
