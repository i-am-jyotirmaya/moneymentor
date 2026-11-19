// TODO(A2): replace with A2 HeroCard (gradient.hero + glow, elevation.hero).
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../ThemeProvider';
import { CountUp, inrWorklet } from './CountUp';
import { Icon, type IconName } from './Icon';

export type HeroPill = { icon: IconName; label: string; value: string; accessibilityLabel?: string };
export function heroBackground(stops: readonly string[], locations: readonly number[], angle: number, glow: string) {
  const linear = `linear-gradient(${angle}deg, ${stops.map((c, i) => `${c} ${Math.round(locations[i] * 100)}%`).join(', ')})`;
  return `radial-gradient(circle at 100% 0%, ${glow}8C 0%, ${glow}00 60%), ${linear}`;
}

export function HeroCard({ label, value, delta, pills = [], gauge, a11ySummary, testID }: {
  label: string; value: number; delta?: { text: string; direction: 'up' | 'down' | 'flat' }; pills?: HeroPill[]; gauge?: ReactNode; a11ySummary: string; testID?: string;
}) {
  const { color, elevation, fontScale, gradient, radius, type } = useTheme();
  const stacked = fontScale >= 1.3;
  return <View testID={testID} accessible accessibilityRole="summary" accessibilityLabel={a11ySummary}
    style={[{ borderRadius: radius.xl, padding: 24, gap: 14, backgroundColor: gradient.hero.colors[1],
      backgroundImage: heroBackground(gradient.hero.colors, gradient.hero.locations, gradient.hero.angle, gradient.heroGlow.color) }, elevation.hero]}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={[type.overline, { color: color.onHeroMuted }]}>{label}</Text>
        <CountUp value={value} format={v => { 'worklet'; return inrWorklet(v, 'always'); }} variant="displayXl" tone="onHero" />
        {delta ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name={delta.direction === 'down' ? { android: 'trending_down', ios: 'chart.line.downtrend.xyaxis' } : { android: 'trending_up', ios: 'chart.line.uptrend.xyaxis' }} size={18} color={color.onHero} />
          <Text style={[type.label, { color: color.onHero, flexShrink: 1 }]}>{delta.text}</Text>
        </View> : null}
      </View>
      {!stacked ? gauge : null}
    </View>
    <View style={{ flexDirection: stacked ? 'column' : 'row', gap: 10, alignItems: stacked ? 'stretch' : 'center' }}>
      {pills.map(p => <View key={p.label} accessibilityLabel={p.accessibilityLabel} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, minHeight: 44, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.14)', flexShrink: 1 }}>
        <Icon name={p.icon} size={18} color={color.onHero} />
        <Text style={[type.label, { color: color.onHero, flexShrink: 1 }]}>{p.label} <Text style={{ fontFamily: 'InterTight_700Bold' }}>{p.value}</Text></Text>
      </View>)}
    </View>
    {stacked && gauge ? <View style={{ alignSelf: 'flex-end', transform: [{ scale: 0.82 }] }}>{gauge}</View> : null}
  </View>;
}
