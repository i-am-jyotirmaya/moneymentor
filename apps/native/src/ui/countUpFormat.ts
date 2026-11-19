export type CountUpSign = 'auto' | 'always' | 'never';

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

export function formatInrWorklet(value: number, sign: CountUpSign = 'auto') {
  'worklet';
  return sign === 'never' ? inrWorklet(Math.abs(value)) : inrWorklet(value, sign);
}
