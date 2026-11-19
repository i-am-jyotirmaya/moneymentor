import { Skia, rect } from '@shopify/react-native-skia';

export function arcPath(cx: number, cy: number, radius: number, start: number, sweep: number) {
  const oval = rect(cx - radius, cy - radius, radius * 2, radius * 2);
  const builder = Skia.PathBuilder.Make();
  // Two connected halves keep a complete circle trimmable from twelve o'clock.
  if (sweep >= 360) {
    builder.arcToOval(oval, start, 180, true).arcToOval(oval, start + 180, 180, false);
  } else if (sweep > 0) {
    builder.addArc(oval, start, sweep);
  }
  return builder.build();
}
