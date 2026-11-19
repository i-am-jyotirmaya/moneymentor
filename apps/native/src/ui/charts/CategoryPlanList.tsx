import { Pressable, View } from 'react-native';
import { formatInr } from '../../lib/format';
import { Icon } from '../Icon';
import { Text } from '../Text';
import { useTheme } from '../ThemeProvider';
import { categoryColors, type DonutSlice } from './chartMath';

export function PlanNote({ amount, budget }: Pick<DonutSlice, 'amount' | 'budget'>) {
  if (budget == null) return null;
  const difference = budget - amount;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {difference < 0 && <Icon name={{ ios: 'exclamationmark.circle', android: 'error' }} size={14} color="negative" />}
      <Text numeric variant="caption" tone={difference < 0 ? 'negative' : 'text2'}>
        {difference < 0 ? `${formatInr(-difference)} over plan` : `${formatInr(difference)} left of plan`}
      </Text>
    </View>
  );
}

export function CategoryPlanList({ rows, onPressRow }: {
  rows: readonly DonutSlice[]; onPressRow: (id: string) => void;
}) {
  const { category, color } = useTheme();
  const colors = categoryColors(rows);
  const max = Math.max(1, ...rows.map(row => row.amount));
  return (
    <View style={{ gap: 8 }}>
      {rows.map(row => {
        const fill = category[colors.get(row.id)!];
        const budget = row.budget;
        const scale = budget == null ? max : Math.max(row.amount, budget, 1);
        const within = budget == null ? row.amount : Math.min(budget, row.amount);
        const overflow = budget == null ? 0 : Math.max(0, row.amount - budget);
        return (
          <Pressable key={row.id} accessibilityRole="button" accessibilityHint="Shows transactions"
            onPress={() => onPressRow(row.id)} style={{ minHeight: 48, justifyContent: 'center', gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: fill }} />
              <Text variant="label" style={{ flex: 1 }}>{row.name}</Text>
              <Text variant="number" numeric>{formatInr(row.amount)}</Text>
            </View>
            <View style={{ flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: color.chartTrack }}>
              <View style={{ width: `${Math.max(0, 100 * within / scale)}%`, backgroundColor: fill }} />
              {overflow > 0 && <View style={{ width: `${100 * overflow / scale}%`, backgroundColor: color.negative }} />}
            </View>
            <PlanNote amount={row.amount} budget={budget} />
          </Pressable>
        );
      })}
    </View>
  );
}
