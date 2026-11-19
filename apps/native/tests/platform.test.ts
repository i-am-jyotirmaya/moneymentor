import { backAction } from '../src/lib/back-policy';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { withoutFontScale, withKeyboardResize } from '../plugins/with-platform';
import config from '../app.config';

test.each([
  [true, true, '/planning', 'pop'],
  [false, true, '/planning', 'assistant'],
  [false, true, '/assistant', 'exit'],
  [false, false, '/signup', 'home'],
  [false, false, '/', 'exit'],
] as const)('back policy %s %s %s', (stack, signedIn, path, expected) => {
  expect(backAction(stack, signedIn, path)).toBe(expected);
});
test('removing fontScale preserves other changes and is idempotent', () => {
  const result = withoutFontScale('keyboard|fontScale|orientation|fontScale');
  expect(result).toBe('keyboard|orientation');
  expect(withoutFontScale(result)).toBe(result);
  expect(withoutFontScale()).toBe('');
});
test('keyboard resize replaces conflicting adjustment modes without losing state flags', () => {
  expect(withKeyboardResize('stateHidden|adjustPan')).toBe('stateHidden|adjustResize');
  expect(withKeyboardResize('stateHidden|adjustResize')).toBe('stateHidden|adjustResize');
  expect(withKeyboardResize()).toBe('adjustResize');
});
test('platform configuration follows the system theme, resize and verified link declarations', () => {
  expect(config.userInterfaceStyle).toBe('automatic');
  expect(config.android?.softwareKeyboardLayoutMode).toBe('resize');
  expect(config.android?.intentFilters?.[0].autoVerify).toBe(true);
  expect(config.android?.intentFilters?.[0].data).toEqual([
    { scheme: 'https', host: 'mvp.spndrr.com', path: '/signup' },
    { scheme: 'https', host: 'mvp.spndrr.com', path: '/signup/' },
  ]);
  expect(config.ios?.associatedDomains).toContain('applinks:mvp.spndrr.com');
  expect(config.android?.adaptiveIcon).toMatchObject({ foregroundImage: './assets/adaptive-icon.png', monochromeImage: './assets/adaptive-icon-monochrome.png' });
});

test('dark mode is no longer forced off in MainActivity', () => {
  expect(readFileSync(join(__dirname, '..', 'plugins', 'with-platform.ts'), 'utf8')).not.toContain('MODE_NIGHT_NO');
});

test('light system chrome retains the Slice background colour', () => {
  expect(config.backgroundColor).toBe('#F3F5F9');
  expect(config.androidStatusBar).toMatchObject({ backgroundColor: '#F3F5F9', barStyle: 'dark-content' });
});
