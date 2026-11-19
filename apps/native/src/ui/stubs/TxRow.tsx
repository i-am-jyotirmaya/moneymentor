// TODO(A2): replace with A2 TxRow + CategoryIcon.
import { Text, View } from 'react-native';
import type { Transaction } from '../../api/models';
import { transactionPresentation } from '../../workspace/dashboard-data';
import { Money } from '../Money';
import { useTheme } from '../ThemeProvider';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';

/** Stable category → palette index (0..6; 7 is "Other"). */
export function categoryIndex(name: string | null | undefined) {
  if (!name) return 7;
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % 7;
}
export function txKind(tx: Pick<Transaction, 'type'>): 'cat' | 'income' | 'transfer' {
  return tx.type === 'Income' ? 'income' : tx.type === 'Transfer' ? 'transfer' : 'cat';
}
const glyph: Record<'cat' | 'income' | 'transfer', IconName> = {
  cat: { android: 'shopping_bag', ios: 'bag' },
  income: { android: 'payments', ios: 'banknote' },
  transfer: { android: 'swap_horiz', ios: 'arrow.left.arrow.right' },
};

export function CategoryIcon({ category, kind, size = 44 }: { category: string | null | undefined; kind: 'cat' | 'income' | 'transfer'; size?: number }) {
  const { category: palette, color, radius, scheme } = useTheme();
  const hue = kind === 'income' ? color.income : kind === 'transfer' ? color.text2 : palette[categoryIndex(category)];
  return <View style={{ width: size, height: size, borderRadius: radius.m, alignItems: 'center', justifyContent: 'center', backgroundColor: `${hue}${scheme === 'dark' ? '29' : '1A'}` }}>
    <Icon name={glyph[kind]} size={Math.round(size * 0.5)} color={hue} />
  </View>;
}

/** Signed amount for display: income +, transfers neutral, spend −. */
export function signedAmount(tx: Transaction) {
  const p = transactionPresentation(tx);
  return p.sign.startsWith('↔') ? 0 : p.sign === '+' ? Math.abs(tx.amount) : -Math.abs(tx.amount);
}

export function TxRow({ tx, onPress, testID }: { tx: Transaction; onPress?: () => void; testID?: string }) {
  const { color, type } = useTheme();
  const display = transactionPresentation(tx);
  const kind = txKind(tx);
  const meta = [kind === 'transfer' ? 'Transfer' : tx.categoryName ?? 'Uncategorized', tx.accountName ?? tx.paymentChannel ?? null].filter(Boolean).join(' · ');
  const amount = signedAmount(tx);
  const body = <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingVertical: 8 }}>
    <CategoryIcon category={tx.categoryName} kind={kind} />
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text numberOfLines={2} style={[type.label, { color: color.text }]}>{display.label}</Text>
      <Text numberOfLines={2} style={[type.caption, { color: color.text2 }]}>{meta}</Text>
    </View>
    {kind === 'transfer'
      ? <Text style={[type.label, { color: color.text2 }]} accessibilityLabel={`transfer ${Math.abs(tx.amount)}`}>↔ {Math.abs(tx.amount).toLocaleString('en-IN')}</Text>
      : <Money value={amount} sign="always" variant="number" tone={amount > 0 ? 'income' : 'text'} />}
  </View>;
  return onPress
    ? <PressableScale testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${display.label}, ${meta}`} accessibilityHint="Opens the transaction editor">{body}</PressableScale>
    : <View testID={testID}>{body}</View>;
}
