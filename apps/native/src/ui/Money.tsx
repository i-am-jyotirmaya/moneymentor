import { type StyleProp, type TextStyle } from 'react-native';
import { formatInr, spokenInr } from '../lib/format';
import { Text, type TextTone, type TextVariant } from './Text';

export function Money({
  value,
  sign = 'auto',
  compact = false,
  variant = 'number',
  tone,
  style,
}: {
  value: number;
  sign?: 'auto' | 'always' | 'never';
  compact?: boolean;
  variant?: TextVariant;
  tone?: TextTone;
  style?: StyleProp<TextStyle>;
}) {
  const options = { sign, compact };

  return (
    <Text
      numeric
      variant={variant}
      tone={tone ?? (value > 0 && sign === 'always' ? 'income' : 'text')}
      style={style}
      accessibilityLabel={spokenInr(value, options)}
    >
      {formatInr(value, options)}
    </Text>
  );
}
