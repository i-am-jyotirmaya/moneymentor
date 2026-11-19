import { View } from 'react-native';
import type { Transaction } from '../api/models';
import { spokenInr } from '../lib/format';
import { transactionPresentation } from '../workspace/dashboard-data';
import { CategoryIcon } from './CategoryIcon';
import { Money } from './Money';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';

export function TxRow({ tx, onPress }: { tx: Transaction; onPress: () => void }) {
  const { space } = useTheme();
  const presentation = transactionPresentation(tx);
  const transfer = tx.type === 'Transfer' || presentation.sign === '↔ ';
  const credit = !transfer && presentation.sign === '+';
  const sign = transfer ? 'never' : credit ? 'always' : 'auto';
  const value = Math.abs(tx.amount) * (sign === 'auto' ? -1 : 1);
  const meta = [tx.categoryName ?? (transfer ? 'Transfer' : presentation.income ? 'Income' : null), tx.accountName]
    .filter(Boolean).join(' · ');
  const categoryKey = tx.categoryId ?? tx.categoryName ?? '';
  const category = Array.from(categoryKey).reduce((index, character) => (index * 31 + character.charCodeAt(0)) % 8, 0);
  const icon = transfer ? { ios: 'arrow.left.arrow.right', android: 'swap_horiz' } as const
    : credit ? { ios: 'arrow.down.left', android: 'south_west' } as const
    : { ios: 'receipt', android: 'receipt_long' } as const;

  return (
    <PressableScale onPress={onPress} accessibilityRole="button"
      accessibilityLabel={[presentation.label, meta, spokenInr(value, { sign })].filter(Boolean).join(', ')}
      contentStyle={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.s4, paddingVertical: space.s3 }}>
      <CategoryIcon category={category} kind={transfer ? 'transfer' : credit ? 'income' : 'cat'} icon={icon} />
      <View style={{ flex: 1 }}>
        <Text variant="label">{presentation.label}</Text>
        {meta ? <Text variant="caption" tone="text2">{meta}</Text> : null}
      </View>
      <Money value={value} sign={sign} tone={credit ? 'income' : 'text'} style={{ flexShrink: 1, textAlign: 'right' }} />
    </PressableScale>
  );
}
