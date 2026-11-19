// Kept free of Reanimated imports so it can be unit-tested; the 'worklet' directive lets CountUp run it on the UI thread.
/** Indian-grouped rupees with U+2212 and an optional +, usable on the UI thread. */
export function inrWorklet(value: number, sign: 'auto' | 'always' = 'auto') {
  'worklet';
  const rounded = Math.round(Math.abs(value));
  const digits = String(rounded);
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  const body = rest ? `${rest},${last3}` : last3;
  const prefix = value < 0 && rounded !== 0 ? '−' : value > 0 && sign === 'always' ? '+' : '';
  return `${prefix}₹${body}`;
}
