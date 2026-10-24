import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { formatMoney, type CategorySpendSummary } from '@spndrr/finance-core';
import { Card, useStyles, useReducedMotion } from './primitives';
import { useTheme, motion } from './theme';

export function MetricTile({ label, amount, currency, detail }: { label: string; amount: number; currency: string; detail?: string }) {
  const styles = useStyles();

  return <Card><Text style={styles.caption}>{label}</Text><Text style={[styles.heading, { fontVariant: ['tabular-nums'] }]}>{formatMoney(amount, currency)}</Text>
    {detail ? <Text style={styles.caption}>{detail}</Text> : null}
  </Card>;
}
export function Progress({ value, label, animate = true }: { value: number; label: string; animate?: boolean }) {
  const { color } = useTheme();

  const reduced = useReducedMotion();
  const ratio = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  const width = useSharedValue(0);
  useEffect(() => {
    width.set(animate && !reduced ? withTiming(ratio, { duration: motion.enterMs, reduceMotion: ReduceMotion.System }) : ratio);
  }, [animate, ratio, reduced, width]);
  const animated = useAnimatedStyle(() => ({ width: `${width.get() * 100}%` as `${number}%` }));
  return <View accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}
    style={{ height: 10, backgroundColor: color.tint, borderRadius: 8, overflow: 'hidden' }}>
    <Animated.View style={[{ height: '100%', backgroundColor: color.accent, borderRadius: 8 }, animated]} />
  </View>;
}

/** Server amounts stay authoritative; ratios below are only visual encodings. */
export function CategoryChart({ categories, currency, animate = true }: { categories: CategorySpendSummary[]; currency: string; animate?: boolean }) {
  const styles = useStyles();
  const { color } = useTheme();

  const [selected, setSelected] = useState<string | null>(null);
  const largest = Math.max(1, ...categories.map(category => Math.abs(category.amount)));
  return <Card><Text accessibilityRole="header" style={styles.heading}>Where it went</Text>
    {!categories.length ? <Text style={styles.caption}>Category totals appear after your first expense.</Text> : categories.map((category, index) => {
      const key = `${category.parentCategoryName ?? ''}/${category.name}/${index}`;
      return <View key={key} style={{ gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${category.name}, ${formatMoney(category.amount, currency)}, ${category.amount < 0 ? 'net refund' : category.tone}`}
          accessibilityState={{ expanded: selected === key }} onPress={() => setSelected(previous => previous === key ? null : key)} style={{ minHeight: 52, justifyContent: 'center', gap: 8 }}>
          <View style={[styles.row, { justifyContent: 'space-between' }]}><Text style={styles.body}>{category.name}</Text><Text style={styles.body}>{formatMoney(category.amount, currency)}</Text></View>
          <Progress value={Math.abs(category.amount) / largest} label={`${category.name} relative amount`} animate={animate} />
        </Pressable>
        {selected === key ? <View style={{ padding: 12, backgroundColor: color.tint, borderRadius: 12, gap: 8 }}>
          <Text style={styles.caption}>{category.parentCategoryName ? `${category.parentCategoryName} · ` : ''}{category.amount < 0 ? 'Net refund this period' : category.tone}</Text>
          {category.note ? <Text style={styles.body}>{category.note}</Text> : null}
          {category.budget !== null ? <Text style={styles.caption}>Budget: {formatMoney(category.budget, currency)}</Text> : null}
        </View> : null}
      </View>;
    })}
  </Card>;
}

export function FinancialSkeleton() {
  const { color } = useTheme();

  return <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading financial summary" style={{ gap: 18 }}>
    {[132, 92, 220].map((height, index) => <View key={index} style={{ height, borderRadius: 24, backgroundColor: color.tint }} />)}
  </View>;
}
