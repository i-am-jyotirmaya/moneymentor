import { type ReactNode } from 'react';
import { StyleSheet, useColorScheme, useWindowDimensions } from 'react-native';
import {
  buildTheme,
  resolveScheme,
  ThemeProvider,
  useTheme,
  type ThemePreference,
} from '../src/ui/ThemeProvider';
import { colors, darkTheme, lightTheme, styles } from '../src/ui/theme';

const { renderToStaticMarkup } = jest.requireActual<{
  renderToStaticMarkup: (node: ReactNode) => string;
}>('react-dom/server.node');

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));

test('legacy colors map to the light theme roles', () => {
  const { color } = lightTheme;
  expect(colors).toEqual({
    background: color.bg,
    ink: color.text,
    muted: color.text2,
    muted2: color.text3,
    surface: color.surfaceSunken,
    border: color.outline,
    accent: color.primary,
    accentSoft: color.primaryContainer,
    danger: color.negative,
    dangerBg: color.negativeContainer,
    dangerBorder: color.negative,
  });
  expect(colors.accent).toBe('#2944D4');
});

test('legacy styles retain their keys and minimum touch target sizes', () => {
  expect(Object.keys(styles)).toEqual([
    'page', 'card', 'title', 'text', 'label', 'field', 'input', 'button',
    'buttonText', 'link', 'linkTarget', 'error',
  ]);
  for (const style of [styles.input, styles.button, styles.linkTarget]) {
    expect(StyleSheet.flatten(style)?.minWidth).toBeGreaterThanOrEqual(48);
    expect(StyleSheet.flatten(style)?.minHeight).toBeGreaterThanOrEqual(48);
  }
});

test.each<[ThemePreference, string | null | undefined, 'light' | 'dark']>([
  ['system', 'dark', 'dark'],
  ['system', 'light', 'light'],
  ['system', null, 'light'],
  ['system', undefined, 'light'],
  ['system', 'unknown', 'light'],
  ['light', 'dark', 'light'],
  ['dark', 'light', 'dark'],
])('resolves %s preference with %s system scheme to %s', (preference, system, expected) => {
  expect(resolveScheme(preference, system)).toBe(expected);
});

test('buildTheme uses dark tokens and defaults font scale to one', () => {
  expect(buildTheme('dark').color.bg).toBe(darkTheme.color.bg);
  expect(buildTheme('dark').fontScale).toBe(1);
});

function ThemeProbe() {
  const { scheme, preference, fontScale } = useTheme();
  return <span>{`${scheme}/${preference}/${fontScale}`}</span>;
}

test('ThemeProvider follows the system scheme and font scale unless preference overrides the scheme', () => {
  jest.mocked(useColorScheme).mockReturnValue('dark');
  jest.mocked(useWindowDimensions).mockReturnValue({
    width: 400,
    height: 800,
    scale: 2,
    fontScale: 1.5,
  });

  expect(renderToStaticMarkup(<ThemeProvider><ThemeProbe /></ThemeProvider>))
    .toBe('<span>dark/system/1.5</span>');
  expect(renderToStaticMarkup(<ThemeProvider preference="light"><ThemeProbe /></ThemeProvider>))
    .toBe('<span>light/light/1.5</span>');
});

test('useTheme defaults to light tokens outside a provider', () => {
  expect(renderToStaticMarkup(<ThemeProbe />)).toBe('<span>light/system/1</span>');
});
