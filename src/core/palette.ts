/**
 * Palette maison, volontairement désordonnée : deux nombres voisins ne se
 * suivent jamais dans le cercle chromatique, ce qui les rend faciles à
 * distinguer d'un coup d'œil.
 */
const COLORS = [
  '#F4C95D', // 1  miel
  '#5FA8D3', // 2  ciel
  '#E4715E', // 3  corail
  '#6BBF59', // 4  pomme
  '#9B7EDE', // 5  lavande
  '#F2A365', // 6  abricot
  '#3FBFB0', // 7  turquoise
  '#E36588', // 8  framboise
  '#C77DFF', // 9  mauve
  '#8AC926', // 10 citron
  '#F5B841', // 11 ambre
  '#4D9DE0', // 12 bleu franc
  '#EF7B45', // 13 mandarine
  '#7BC4A4', // 14 menthe
  '#D96BA0', // 15 rose
  '#7D8CC4', // 16 ardoise
  '#2EC4B6', // 17 emeraude
  '#E8825A', // 18 brique
  '#A06CD5', // 19 amethyste
  '#5C93E0', // 20 bleuet
];

export function colorFor(value: number): string {
  return COLORS[(Math.max(1, value) - 1) % COLORS.length];
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

export function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** amount > 0 éclaircit, amount < 0 assombrit. */
export function shade(hex: string, amount: number): string {
  const [r, g, b] = parseHex(hex);
  const t = amount > 0 ? 255 : 0;
  const p = Math.abs(amount);
  const mix = (c: number) => clamp255(c + (t - c) * p);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
