import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StyleSheet } from 'react-native';
import { colors, styles } from '../src/ui/theme';
import { remainingKeyboardOverlap } from '../src/ui/AndroidKeyboardFrame';

const source = (path: string) => readFileSync(join(__dirname, '..', path), 'utf8');

test('Slice accent and shared form targets meet the mobile design tokens', () => {
  expect(colors.accent).toBe('#0B7A4E');
  for (const style of [styles.input, styles.button, styles.linkTarget]) {
    expect(StyleSheet.flatten(style)?.minWidth).toBeGreaterThanOrEqual(48);
    expect(StyleSheet.flatten(style)?.minHeight).toBeGreaterThanOrEqual(48);
  }
});

test('multiline placeholder remains a non-interactive single-line hint', () => {
  const auth = source('src/ui/AuthForm.tsx');
  expect(auth).toContain('pointerEvents="none"');
  expect(auth).toContain('numberOfLines={1} ellipsizeMode="tail"');
  expect(auth).toContain('accessibilityHint={accessibilityHint ?? placeholder}');
});

test('Android IME fallback pads only the residual overlap after native resize', () => {
  expect(remainingKeyboardOverlap(24, 756, null)).toBe(0); // Keyboard hidden.
  expect(remainingKeyboardOverlap(24, 456, 480)).toBe(0); // Native adjustResize succeeded.
  expect(remainingKeyboardOverlap(24, 756, 480)).toBe(300); // Entire keyboard overlaps viewport.
  expect(remainingKeyboardOverlap(24, 556, 480)).toBe(100); // Partial resize, pad only remaining overlap.
  expect(remainingKeyboardOverlap(24, 456.5, 480)).toBe(0); // Ignore sub-dp jitter.
});

test('initial, signup and workspace content loading use skeletons instead of spinners', () => {
  for (const path of ['app/index.tsx', 'app/(auth)/signup.tsx', 'src/workspace/ui.tsx']) {
    expect(source(path)).toContain('<Skeleton');
    expect(source(path)).not.toContain('ActivityIndicator');
  }
});
