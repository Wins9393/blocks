import { describe, expect, it } from 'vitest';
import { ShakeDetector, partitionByCut, segmentHitsBox, sideOfCut, sliceFromPath } from './gestures';
import type { Sample } from './gestures';

function feed(d: ShakeDetector, samples: Sample[]): number {
  let peels = 0;
  d.reset(samples[0]);
  for (const s of samples.slice(1)) if (d.push(s)) peels++;
  return peels;
}

/** Trace un aller-retour : n demi-cycles d'amplitude `amp` en `stepMs` chacun. */
function oscillation(halfCycles: number, amp: number, stepMs: number): Sample[] {
  const out: Sample[] = [{ x: 0, y: 200, t: 0 }];
  let t = 0;
  let target = amp;
  for (let c = 0; c < halfCycles; c++) {
    const from = out[out.length - 1].x;
    for (let i = 1; i <= 4; i++) {
      t += stepMs / 4;
      out.push({ x: from + ((target - from) * i) / 4, y: 200, t });
    }
    target = target === amp ? 0 : amp;
  }
  return out;
}

describe('ShakeDetector', () => {
  it('ignore un deplacement lent et rectiligne', () => {
    const path: Sample[] = [];
    for (let i = 0; i <= 30; i++) path.push({ x: i * 10, y: 100, t: i * 40 });
    expect(feed(new ShakeDetector(), path)).toBe(0);
  });

  it('ignore des allers-retours trop courts', () => {
    expect(feed(new ShakeDetector(), oscillation(8, 12, 90))).toBe(0);
  });

  it('ignore des allers-retours trop lents', () => {
    expect(feed(new ShakeDetector(), oscillation(8, 80, 900))).toBe(0);
  });

  it('declenche sur une vraie secousse ample et rapide', () => {
    expect(feed(new ShakeDetector(), oscillation(8, 90, 110))).toBeGreaterThan(0);
  });

  it('detache une unite a la fois, pas dix', () => {
    const peels = feed(new ShakeDetector(), oscillation(8, 90, 110));
    expect(peels).toBeLessThanOrEqual(4);
  });

  it('fonctionne aussi sur l axe vertical', () => {
    const horizontal = oscillation(8, 90, 110);
    const vertical = horizontal.map((s) => ({ x: s.y, y: s.x, t: s.t }));
    expect(feed(new ShakeDetector(), vertical)).toBeGreaterThan(0);
  });
});

describe('sliceFromPath', () => {
  const fast = (n: number): Sample[] =>
    Array.from({ length: n }, (_, i) => ({ x: i * 20, y: 100, t: i * 8 }));

  it('refuse un trait trop court', () => {
    expect(sliceFromPath(fast(2))).toBeNull();
  });

  it('refuse un trait trop lent', () => {
    const slow = fast(10).map((s) => ({ ...s, t: s.t * 40 }));
    expect(sliceFromPath(slow)).toBeNull();
  });

  it('refuse un trait sinueux', () => {
    const wiggly = fast(20).map((s, i) => ({ ...s, y: 100 + (i % 2 ? 120 : -120) }));
    expect(sliceFromPath(wiggly)).toBeNull();
  });

  it('accepte un trait franc', () => {
    const cut = sliceFromPath(fast(10));
    expect(cut).not.toBeNull();
    expect(cut!.ax).toBe(0);
    expect(cut!.bx).toBe(180);
  });
});

describe('geometrie de coupe', () => {
  const cut = { ax: 0, ay: 0, bx: 100, by: 0 };

  it('separe bien les deux cotes', () => {
    expect(sideOfCut(cut, 50, 10)).toBe(1);
    expect(sideOfCut(cut, 50, -10)).toBe(-1);
  });

  it('ne coupe que ce que le segment traverse vraiment', () => {
    expect(segmentHitsBox(cut, { x: 40, y: -10 }, { x: 60, y: 10 })).toBe(true);
    expect(segmentHitsBox(cut, { x: 400, y: -10 }, { x: 460, y: 10 })).toBe(false);
    expect(segmentHitsBox(cut, { x: 40, y: 200 }, { x: 60, y: 260 })).toBe(false);
  });
});

describe('partitionByCut', () => {
  const grid = Array.from({ length: 9 }, (_, i) => ({ x: (i % 3) * 36, y: Math.floor(i / 3) * 36 }));

  it('ne perd jamais un cube, meme pile sur la ligne', () => {
    for (let y = -20; y <= 100; y += 4) {
      const [plus, minus] = partitionByCut({ ax: -500, ay: y, bx: 500, by: y }, grid);
      expect(plus.length + minus.length).toBe(grid.length);
    }
  });

  it('separe bien un 3 x 3 en deux tiers', () => {
    const [plus, minus] = partitionByCut({ ax: -500, ay: 18, bx: 500, by: 18 }, grid);
    expect(plus).toHaveLength(6);
    expect(minus).toHaveLength(3);
  });

  it('ne separe rien quand la ligne passe a cote', () => {
    const [plus, minus] = partitionByCut({ ax: -500, ay: 500, bx: 500, by: 500 }, grid);
    expect(minus).toHaveLength(9);
    expect(plus).toHaveLength(0);
  });
});
