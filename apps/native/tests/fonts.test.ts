import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { appFonts, fontFamilies } from '../src/ui/fonts';
import { type } from '../src/ui/theme';

test('all typography token families are bundled', () => {
  expect(fontFamilies).toEqual(Object.keys(appFonts));
  for (const { fontFamily } of Object.values(type)) {
    expect(appFonts).toHaveProperty(fontFamily);
  }
});

test('root layout loads fonts while holding the splash screen', () => {
  const source = readFileSync(resolve(__dirname, '../app/_layout.tsx'), 'utf8');
  expect(source).toContain('useFonts(appFonts)');
  expect(source).toContain('preventAutoHideAsync');
  expect(source).toContain('hideAsync');
});
