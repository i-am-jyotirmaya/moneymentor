import { useState, type ReactNode } from 'react';
import { TextInput, View } from 'react-native';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { Text, defaultMaxFontSizeMultiplier, textStyleFor } from './Text';
import { useTheme } from './ThemeProvider';

export function TextField({ label, value, onChangeText, error, helper, leading, trailing, secure = false }: {
  label: string; value: string; onChangeText: (value: string) => void; error?: string; helper?: string;
  leading?: ReactNode; trailing?: ReactNode; secure?: boolean;
}) {
  const theme = useTheme();
  const { color, space, radius } = theme;
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  return (
    <View style={{ gap: space.s2 }}>
      <Text variant="label" accessible={false}>{label}</Text>
      <View style={{ minHeight: 56, borderRadius: radius.m, borderWidth: focused ? 2 : 1,
        borderColor: error ? color.negative : focused ? color.primary : color.outlineStrong,
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.s4, gap: space.s2 }}>
        {leading}
        <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          secureTextEntry={secure && !revealed} maxFontSizeMultiplier={defaultMaxFontSizeMultiplier('body')}
          style={[textStyleFor(theme, 'body'), { flex: 1, paddingVertical: space.s3 }]} />
        {secure ? <IconButton label={revealed ? 'Hide password' : 'Show password'}
          icon={revealed ? { ios: 'eye.slash', android: 'visibility_off' } : { ios: 'eye', android: 'visibility' }}
          onPress={() => setRevealed(current => !current)} /> : trailing}
      </View>
      {(error || helper) && (
        <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
          {error && <Icon name={{ ios: 'exclamationmark.circle', android: 'error' }} size={16} color="negative" />}
          <Text variant="caption" tone={error ? 'negative' : 'text2'} style={{ flexShrink: 1 }}>{error || helper}</Text>
        </View>
      )}
    </View>
  );
}
