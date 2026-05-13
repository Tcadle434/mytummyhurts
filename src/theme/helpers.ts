export function withAlpha(hex: string, alpha: number) {
  const normalized = hex.replace('#', '');
  const expanded = normalized.length === 3
    ? normalized
        .split('')
        .map((char) => `${char}${char}`)
        .join('')
    : normalized;

  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
