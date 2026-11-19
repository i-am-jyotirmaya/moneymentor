function channels(hex: string) {
  const digits = hex.slice(1);
  return [0, 2, 4].map(offset => parseInt(digits.slice(offset, offset + 2), 16));
}

export function withAlpha(hex: string, alpha: number) {
  return `rgba(${channels(hex).join(', ')}, ${alpha})`;
}

export function mixHex(a: string, b: string, t: number) {
  const end = channels(b);
  const mixed = channels(a).map((start, index) =>
    Math.round(start + (end[index] - start) * t).toString(16).padStart(2, '0'),
  );
  return `#${mixed.join('')}`;
}
