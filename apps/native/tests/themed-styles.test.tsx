import { type ReactNode } from 'react';
import { useColorScheme, useWindowDimensions } from 'react-native';
import { buildTheme, ThemeProvider, type ColorScheme, type ThemeValue } from '../src/ui/ThemeProvider';
import { createThemedStyles, useThemedStyles } from '../src/ui/useThemedStyles';

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

const makeStyles = (theme: ThemeValue) => ({
  card: { backgroundColor: theme.color.surface },
  label: { fontSize: 16 * theme.fontScale },
});

function themeFor(scheme: ColorScheme, fontScale = 1): ThemeValue {
  return { ...buildTheme(scheme, fontScale), preference: 'system', setPreference: () => {} };
}

test('caches styles by factory, scheme and font scale', () => {
  const lightTheme = themeFor('light');
  const darkTheme = themeFor('dark');
  const light = createThemedStyles(makeStyles, lightTheme);
  const dark = createThemedStyles(makeStyles, darkTheme);

  expect(light.card.backgroundColor).toBe(lightTheme.color.surface);
  expect(dark.card.backgroundColor).toBe(darkTheme.color.surface);
  expect(dark.card.backgroundColor).not.toBe(light.card.backgroundColor);
  expect(dark).not.toBe(light);
  expect(createThemedStyles(makeStyles, themeFor('light'))).toBe(light);

  const scaled = createThemedStyles(makeStyles, themeFor('light', 1.5));
  expect(scaled).not.toBe(light);
  expect(scaled.label.fontSize).toBe(24);
  expect(createThemedStyles(makeStyles, themeFor('light', 1.5))).toBe(scaled);
});

function StyleProbe() {
  const styles = useThemedStyles(makeStyles);
  return <span>{styles.card.backgroundColor}</span>;
}

test.each(['light', 'dark'] as const)('uses %s system tokens through ThemeProvider', (scheme) => {
  jest.mocked(useColorScheme).mockReturnValue(scheme);
  jest.mocked(useWindowDimensions).mockReturnValue({
    width: 400,
    height: 800,
    scale: 2,
    fontScale: 1,
  });

  expect(renderToStaticMarkup(<ThemeProvider><StyleProbe /></ThemeProvider>))
    .toBe(`<span>${buildTheme(scheme).color.surface}</span>`);
});
