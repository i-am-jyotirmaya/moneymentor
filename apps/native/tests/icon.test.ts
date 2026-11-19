import { iconGlyphSize } from '../src/workspace/ui';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('../src/workspace/connection', () => ({ useOffline: () => false }));

test.each([[1, 20], [2, 10], [0.85, 20]])('icon glyph compensates for Android font scale %s', (scale, expected) => {
  expect(iconGlyphSize(20, scale)).toBe(expected);
});
