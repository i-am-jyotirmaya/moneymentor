import { View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { Button } from './Button';
import type { FeedbackAction } from './EmptyState';
import { Icon, type IconName } from './Icon';
import { timing } from './motion';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';

export type BannerTone = 'warning' | 'info' | 'negative';

export function Banner({ tone, icon, title, body, action }: {
  tone: BannerTone; icon: IconName; title: string; body?: string; action?: FeedbackAction;
}) {
  const { color, radius, space } = useTheme();
  const reduced = useReducedMotion();
  const enter = timing('base');
  return (
    <Animated.View accessibilityRole={tone === 'negative' ? 'alert' : 'summary'}
      entering={reduced ? undefined : FadeIn.duration(enter.duration).easing(enter.easing).reduceMotion(enter.reduceMotion)}
      style={{ flexDirection: 'row', gap: space.s3, padding: space.s4, borderRadius: radius.l,
        backgroundColor: color[`${tone}Container`] }}>
      <Icon name={icon} size={20} color={tone} />
      <View style={{ flex: 1, gap: space.s2 }}>
        <Text variant="label">{title}</Text>
        {body && <Text variant="body">{body}</Text>}
        {action && <Button {...action} variant="text" size="m" />}
      </View>
    </Animated.View>
  );
}
