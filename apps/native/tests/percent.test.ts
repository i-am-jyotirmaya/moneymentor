import { formatPercent, spokenPercent } from '../src/lib/format';

test.each<[number, Parameters<typeof formatPercent>[1], string]>([
  [96.5, undefined, '96.5%'],
  [97, undefined, '97%'],
  [96.96, undefined, '97%'],
  [0, { sign: 'always' }, '0%'],
  [-0.01, undefined, '0%'],
  [-8, undefined, '−8%'],
  [-8, { sign: 'always' }, '−8%'],
  [-8, { sign: 'never' }, '8%'],
  [8, { sign: 'always' }, '+8%'],
])('formats %s with %j as %s', (value, options, expected) => {
  expect(formatPercent(value, options)).toBe(expected);
});

test('reads rounded percentages aloud', () => {
  expect(spokenPercent(96.5)).toBe('96.5 percent');
  expect(spokenPercent(-7.99)).toBe('minus 8 percent');
});
