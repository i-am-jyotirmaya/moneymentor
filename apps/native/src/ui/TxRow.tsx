import { View } from 'react-native';
import type { Transaction } from '../api/models';
import { spokenInr } from '../lib/format';
import { transactionPresentation } from '../workspace/dashboard-data';
import { CategoryIcon, type CategoryIconKind } from './CategoryIcon';
import { Money } from './Money';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';

export { CategoryIcon, categoryIndex } from './CategoryIcon';

export function txKind(tx: Pick<Transaction, 'type'>): CategoryIconKind {
  return tx.type === 'Income' ? 'income' : tx.type === 'Transfer' ? 'transfer' : 'cat';
}

export function signedAmount(tx: Transaction) {
  const { sign } = transactionPresentation(tx);
  return sign.startsWith('↔') ? 0 : sign === '+' ? Math.abs(tx.amount) : -Math.abs(tx.amount);
}

export function TxRow({ tx, onPress, testID }: { tx: Transaction; onPress?: () => void; testID?: string }) {
  const { space } = useTheme();
  const { label } = transactionPresentation(tx);
  const kind = txKind(tx);
  const value = signedAmount(tx);
  const amount = Math.abs(tx.amount);
  const meta = [kind === 'transfer' ? 'Transfer' : tx.categoryName ?? 'Uncategorized',
    tx.accountName ?? tx.paymentChannel].filter(Boolean).join(' · ');
  const spoken = kind === 'transfer' ? `transfer ${amount}` : spokenInr(value, { sign: 'always' });

  const body = (
    <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.s4, paddingVertical: space.s3 }}>
      <CategoryIcon category={tx.categoryName} kind={kind} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="label" numberOfLines={2}>{label}</Text>
        <Text variant="caption" tone="text2" numberOfLines={2}>{meta}</Text>
      </View>
      {kind === 'transfer'
        ? <Text variant="label" tone="text2" accessibilityLabel={spoken}>↔ {amount.toLocaleString('en-IN')}</Text>
        : <Money value={value} sign="always" tone={value > 0 ? 'income' : 'text'} style={{ flexShrink: 1, textAlign: 'right' }} />}
    </View>
  );

  return onPress ? (
    <PressableScale testID={testID} onPress={onPress} accessibilityRole="button"
      accessibilityLabel={[label, meta, spoken].filter(Boolean).join(', ')} accessibilityHint="Opens the transaction editor">
      {body}
    </PressableScale>
  ) : <View testID={testID}>{body}</View>;
}
