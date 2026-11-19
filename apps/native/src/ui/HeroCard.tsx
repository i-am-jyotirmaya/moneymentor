import type { ReactNode } from 'react';
import { View } from 'react-native';
import { withAlpha } from './color';
import { CountUp } from './CountUp';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';

export function heroLayout(fontScale: number) {
  const stacked = fontScale >= 1.3;
  return { stacked, gaugePosition: stacked ? 'bottom-right' : 'top-right', gaugeScale: stacked ? 0.82 : 1 } as const;
}

export type HeroPill = { icon: IconName; label: string; value: string; accessibilityLabel?: string };

export function heroBackground(stops: readonly string[], locations: readonly number[], angle: number, glow: string) {
  const linear = `linear-gradient(${angle}deg, ${stops.map((color, index) => `${color} ${Math.round(locations[index] * 100)}%`).join(', ')})`;
  return `radial-gradient(circle at 100% 0%, ${withAlpha(glow, 0x8c / 255)} 0%, ${withAlpha(glow, 0)} 60%), ${linear}`;
}

export function HeroCard({ label, value, delta, pills = [], gauge, a11ySummary, testID }: {
  label: string; value: number; delta?: { text: string; direction: 'up' | 'down' | 'flat' };
  pills?: HeroPill[]; gauge?: ReactNode; a11ySummary: string; testID?: string;
}) {
  const { gradient, elevation, radius, space, layout, fontScale, color } = useTheme();
  const { stacked, gaugeScale } = heroLayout(fontScale);
  const { hero, heroGlow } = gradient;
  const showGauge = gauge != null;
  const gaugeView = showGauge && <View style={{
    alignSelf: stacked ? 'flex-end' : 'flex-start', marginLeft: stacked ? 'auto' : 0,
    transformOrigin: stacked ? 'bottom right' : 'top right', transform: [{ scale: gaugeScale }],
  }}>{gauge}</View>;

  return (
    <View testID={testID} accessible accessibilityRole="summary" accessibilityLabel={a11ySummary}
      style={[elevation.hero, { borderRadius: radius.xl, backgroundColor: hero.colors[1],
        backgroundImage: heroBackground(hero.colors, hero.locations, hero.angle, heroGlow.color),
        padding: layout.cardPad, gap: space.s4, justifyContent: 'center' }]}>
      <View style={{ flexDirection: 'row', gap: space.s3 }}>
        <View style={{ flex: 1, gap: space.s2 }}>
          <Text variant="label" tone="onHeroMuted" style={{ textTransform: 'uppercase' }}>{label}</Text>
          <CountUp value={value} sign="always" variant="displayXl" tone="onHero" />
          {delta && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
              {delta.direction === 'up' && <Icon name={{ ios: 'arrow.up', android: 'arrow_upward' }} size={14} color="onHeroMuted" />}
              {delta.direction === 'down' && <Icon name={{ ios: 'arrow.down', android: 'arrow_downward' }} size={14} color="onHeroMuted" />}
              <Text variant="caption" tone="onHeroMuted" style={{ flexShrink: 1 }}>{delta.text}</Text>
            </View>
          )}
        </View>
        {!stacked && gaugeView}
      </View>
      {(pills.length > 0 || (stacked && showGauge)) && (
        <View style={{ flexDirection: stacked ? 'column' : 'row', alignItems: 'stretch', gap: space.s3 }}>
          {pills.length > 0 && (
            <View style={{ flexDirection: stacked ? 'column' : 'row', flexWrap: stacked ? 'nowrap' : 'wrap',
              alignItems: 'flex-start', flexShrink: 1, gap: space.s3 }}>
              {pills.map(pill => (
                <View key={pill.label} accessibilityLabel={pill.accessibilityLabel} style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
                  gap: space.s2, borderRadius: radius.pill, paddingHorizontal: space.s4, paddingVertical: space.s3,
                  backgroundColor: withAlpha(color.onHero, 0.14) }}>
                  <Icon name={pill.icon} size={16} color="onHeroMuted" />
                  <Text variant="labelS" tone="onHeroMuted">{pill.label}</Text>
                  <Text numeric variant="labelS" tone="onHero">{pill.value}</Text>
                </View>
              ))}
            </View>
          )}
          {stacked && gaugeView}
        </View>
      )}
    </View>
  );
}
