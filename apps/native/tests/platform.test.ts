import { backAction } from '../src/lib/back-policy';
import { forceLightActivity, withoutFontScale, withKeyboardResize } from '../plugins/with-platform';
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
test('platform configuration forces light, resize and verified link declarations', () => {
  expect(config.userInterfaceStyle).toBe('light');
  expect(config.android?.softwareKeyboardLayoutMode).toBe('resize');
  expect(config.android?.intentFilters?.[0].autoVerify).toBe(true);
  expect(config.android?.intentFilters?.[0].data).toEqual([
    { scheme: 'https', host: 'mvp.spndrr.com', path: '/signup' },
    { scheme: 'https', host: 'mvp.spndrr.com', path: '/signup/' },
  ]);
  expect(config.ios?.associatedDomains).toContain('applinks:mvp.spndrr.com');
  expect(config.android?.adaptiveIcon).toMatchObject({ foregroundImage: './assets/adaptive-icon.png', monochromeImage: './assets/adaptive-icon-monochrome.png' });
});

test('light activity modification preserves startup and is idempotent', () => {
  const source = 'override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(null) }';
  const result = forceLightActivity(source);
  expect(result).toContain('MODE_NIGHT_NO');
  expect(result).toContain('super.onCreate(null)');
  expect(forceLightActivity(result)).toBe(result);
  expect(() => forceLightActivity('unexpected template')).toThrow('onCreate not found');
});

test('light system chrome retains the Slice background colour', () => {
  expect(config.backgroundColor).toBe('#F3F5F9');
  expect(config.androidStatusBar).toMatchObject({ backgroundColor: '#F3F5F9', barStyle: 'dark-content' });
});
