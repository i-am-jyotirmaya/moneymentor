export type CountUpSign = 'auto' | 'always' | 'never';

export function formatInrWorklet(value: number, sign: CountUpSign = 'auto') {
  'worklet';
  const prefix = value < 0 && sign !== 'never' ? '−' : value > 0 && sign === 'always' ? '+' : '';
  const digits = String(Math.round(Math.abs(value)));
  let grouped = digits.slice(-3);
  for (let end = digits.length - 3; end > 0; end -= 2) {
    grouped = digits.slice(Math.max(0, end - 2), end) + ',' + grouped;
  }
  return prefix + '₹' + grouped;
}
