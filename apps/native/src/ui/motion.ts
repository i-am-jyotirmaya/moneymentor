// src/ui/motion.ts  (foundation: ForgeDev)
import { Easing, ReduceMotion } from 'react-native-reanimated';
import { motion as M } from './theme';
export const ease = {
  standard:   Easing.bezier(0.2, 0, 0, 1),        // most UI state changes
  decelerate: Easing.bezier(0.05, 0.7, 0.1, 1),   // things entering / count-up / chart draw
  accelerate: Easing.bezier(0.3, 0, 0.8, 0.15),   // things leaving
  linear:     Easing.linear,                      // shimmer only
};
export const dur = M.duration;                    // instant 90 · fast 150 · base 220 · slow 320 · sheet 360 · chart 700 · countUp 900 · shimmer 1300
export const spring = {
  press:     { ...M.spring.press,     reduceMotion: ReduceMotion.System }, // damping 18, stiffness 420, mass 0.6
  indicator: { ...M.spring.indicator, reduceMotion: ReduceMotion.System }, // 22 / 320 / 0.8
  sheet:     { ...M.spring.sheet,     reduceMotion: ReduceMotion.System }, // 28 / 280 / 1  (critically damped-ish, no bounce past the top)
  pop:       { ...M.spring.pop,       reduceMotion: ReduceMotion.System }, // 14 / 260 / 0.7 (small overshoot, success ticks only)
};
export const timing = (key: keyof typeof dur, e: keyof typeof ease = 'standard') =>
  ({ duration: dur[key], easing: ease[e], reduceMotion: ReduceMotion.System });

export const pressScale = M.pressScale;
export const pressScaleSmall = M.pressScaleSmall;
