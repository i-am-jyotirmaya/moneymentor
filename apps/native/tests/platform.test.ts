import { backAction } from '../src/lib/back-policy';
import { forceLightActivity, withFontScale } from '../plugins/with-platform';
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
test('fontScale preserves existing changes and is idempotent', () => {
  const result = withFontScale('keyboard|orientation');
  expect(result).toBe('keyboard|orientation|fontScale');
  expect(withFontScale(result)).toBe(result);
  expect(withFontScale()).toBe('fontScale');
});
test('platform configuration forces light, resize and verified link declarations', () => {
  expect(config.userInterfaceStyle).toBe('light');
  expect(config.android?.softwareKeyboardLayoutMode).toBe('resize');
  expect(config.android?.intentFilters?.[0].autoVerify).toBe(true);
  expect(config.ios?.associatedDomains).toContain('applinks:mvp.spndrr.com');
});

test('light activity modification preserves startup and is idempotent', () => {
  const source = 'override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(null) }';
  const result = forceLightActivity(source);
  expect(result).toContain('MODE_NIGHT_NO');
  expect(result).toContain('super.onCreate(null)');
  expect(forceLightActivity(result)).toBe(result);
  expect(() => forceLightActivity('unexpected template')).toThrow('onCreate not found');
});
