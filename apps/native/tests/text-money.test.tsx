import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type ReactNode } from 'react';
import { formatInr, spokenInr } from '../src/lib/format';
import { Money } from '../src/ui/Money';
import { defaultMaxFontSizeMultiplier, textStyleFor } from '../src/ui/Text';
import { buildTheme } from '../src/ui/ThemeProvider';

const { renderToStaticMarkup } = jest.requireActual<{
  renderToStaticMarkup: (node: ReactNode) => string;
}>('react-dom/server.node');

test.each<[number, Parameters<typeof formatInr>[1], string]>([
  [123456, undefined, '₹1,23,456'],
  [-1240, undefined, '−₹1,240'],
  [500, { sign: 'always' }, '+₹500'],
  [0, { sign: 'always' }, '₹0'],
  [-5, { sign: 'never' }, '₹5'],
  [1234.5, undefined, '₹1,234.5'],
  [1250000, { compact: true }, '₹12.5L'],
  [23000000, { compact: true }, '₹2.3Cr'],
  [1500, { compact: true }, '₹1.5K'],
  [-1500, { compact: true }, '−₹1.5K'],
  [1000, { compact: true, sign: 'always' }, '+₹1K'],
])('formats %s with options %j as %s', (value, options, expected) => {
  const formatted = formatInr(value, options);
  expect(formatted).toBe(expected);
  expect(formatted).not.toContain('-');
});

test('reads signed amounts aloud', () => {
  expect(spokenInr(-1240)).toBe('minus ₹1,240');
  expect(spokenInr(500, { sign: 'always' })).toBe('plus ₹500');
  expect(spokenInr(500)).toBe('₹500');
});

test('large text variants have a lower default font scale cap', () => {
  expect(defaultMaxFontSizeMultiplier('displayXl')).toBe(1.5);
  expect(defaultMaxFontSizeMultiplier('display')).toBe(1.5);
  expect(defaultMaxFontSizeMultiplier('numberL')).toBe(1.5);
  expect(defaultMaxFontSizeMultiplier('body')).toBe(2);
});

test('numeric text uses Inter Tight with tabular and lining figures', () => {
  const theme = buildTheme('light');
  expect(textStyleFor(theme, 'number', 'text', true)).toMatchObject({
    fontFamily: 'InterTight_700Bold',
    fontVariant: ['tabular-nums', 'lining-nums'],
  });
  expect(textStyleFor(theme, 'body', 'text', true).fontFamily).toBe('InterTight_600SemiBold');
});

test('text tone resolves to the active theme color', () => {
  const theme = buildTheme('dark');
  expect(textStyleFor(theme, 'body', 'warning')).toEqual({
    ...theme.type.body,
    color: theme.color.warning,
  });
});

test('Money renders the amount and its spoken label', () => {
  const markup = renderToStaticMarkup(<Money value={-1240} />);
  expect(markup).toContain('−₹1,240');
  expect(markup).toContain('minus ₹1,240');
});

test('Text leaves font scaling enabled by default', () => {
  const source = readFileSync(resolve(__dirname, '../src/ui/Text.tsx'), 'utf8');
  expect(source).not.toContain('allowFontScaling={false}');
});
