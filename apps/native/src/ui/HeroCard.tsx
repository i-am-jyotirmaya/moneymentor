import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { withAlpha } from './color';
import { CountUp } from './CountUp';
import { Icon, type IconName } from './Icon';
import { dur } from './motion';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';
import { gradientPoints } from './theme';

export function heroLayout(fontScale: number) {
  const stacked = fontScale >= 1.3;
  return { stacked, gaugePosition: stacked ? 'bottom-right' : 'top-right', gaugeScale: stacked ? 0.82 : 1 } as const;
}

export function HeroCard({ label, value, delta, pills = [], gauge, variant = 'default' }: {
  label: string; value: number; delta?: { text: string; direction: 'up' | 'down' | 'flat' | 'neutral' };
  pills?: { icon: IconName; label: string; value: number | string }[];
  gauge?: ReactNode; variant?: 'default' | 'empty';
}) {
  const { gradient, elevation, radius, space, layout, fontScale, color } = useTheme();
  const { stacked, gaugeScale } = heroLayout(fontScale);
  const { hero, heroGlow } = gradient;
  const showGauge = variant === 'default' && gauge != null;
  const gaugeView = showGauge && <View style={{
    alignSelf: stacked ? 'flex-end' : 'flex-start', marginLeft: stacked ? 'auto' : 0,
    transformOrigin: stacked ? 'bottom right' : 'top right', transform: [{ scale: gaugeScale }],
  }}>{gauge}</View>;

  return (
    <View style={[elevation.hero, { borderRadius: radius.xl, backgroundColor: hero.colors[0] }]}>
      <LinearGradient colors={[hero.colors[0], hero.colors[1], hero.colors[2]]}
        locations={[hero.locations[0], hero.locations[1], hero.locations[2]]} {...gradientPoints(hero.angle)}
        style={{ borderRadius: radius.xl, overflow: 'hidden', padding: layout.cardPad, gap: space.s4, justifyContent: 'center' }}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={{ position: 'absolute', width: heroGlow.radius * 200, height: heroGlow.radius * 200,
            top: -heroGlow.radius * 100, right: -heroGlow.radius * 100, borderRadius: heroGlow.radius * 100,
            experimental_backgroundImage: `radial-gradient(circle, ${withAlpha(heroGlow.color, heroGlow.opacity)}, transparent 70%)` }} />
        </View>
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
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: space.s3 }}>
            {pills.length > 0 && (
              <View style={{ flexDirection: stacked ? 'column' : 'row', flexWrap: stacked ? 'nowrap' : 'wrap',
                alignItems: 'flex-start', flexShrink: 1, gap: space.s3 }}>
                {pills.map(pill => (
                  <View key={pill.label} style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
                    gap: space.s2, borderRadius: radius.pill, paddingHorizontal: space.s4, paddingVertical: space.s3,
                    backgroundColor: withAlpha(color.onHero, 0.12) }}>
                    <Icon name={pill.icon} size={16} color="onHeroMuted" />
                    <Text variant="labelS" tone="onHeroMuted">{pill.label}</Text>
                    {typeof pill.value === 'number'
                      ? <CountUp value={pill.value} variant="labelS" tone="onHero" duration={dur.slow} delay={120} />
                      : <Text numeric variant="labelS" tone="onHero">{pill.value}</Text>}
                  </View>
                ))}
              </View>
            )}
            {stacked && gaugeView}
          </View>
        )}
      </LinearGradient>
    </View>
  );
}
