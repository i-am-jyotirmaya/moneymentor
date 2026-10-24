import Svg, { Path } from 'react-native-svg';
import { useTheme } from './theme';

const paths = {
  brand: 'M4.5 14.2c3.7-7.4 11.3-7.4 15 0M7.4 15.5c2.4-4.3 6.8-4.3 9.2 0M10 17h4',
  assistant: 'M6 4h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-7l-6 3v-3a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3ZM8 10h.01M12 10h.01M16 10h.01M8 14h8',
  dashboard: 'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z',
  goal: 'M5 21V3m0 1c6-4 8 4 14 0v10c-6 4-8-4-14 0',
  insights: 'M4 20h16M7 16v-5m5 5V5m5 11V8',
  more: 'M4 6h16M4 12h16M4 18h16',
  receipt: 'M5 3h14v18l-3-2-4 2-4-2-3 2ZM8 8h8M8 12h8M8 16h4',
  account: 'M3 7h18v13H3ZM3 10h18M15 15h3M6 4h12',
  category: 'M3 3h8l10 10-8 8L3 11ZM7 7h.01',
  people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8m6 10v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
  repeat: 'M3 7h15l-3-3m6 13H6l3 3M3 7v5m18 5v-5',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  chevron: 'm9 5 7 7-7 7',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5',
  moon: 'M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z',
  system: 'M3 4h18v13H3ZM8 21h8m-4-4v4',
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, size = 22, tint }: { name: IconName; size?: number; tint?: string }) {
  const { color } = useTheme();
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessible={false}>
    <Path d={paths[name]} stroke={tint ?? color.accent} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}
