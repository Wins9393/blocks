import { describe, expect, it } from 'vitest';
import { isPrime, shapeFor } from './shape';
import { MAX_VALUE } from './constants';

describe('shapeFor', () => {
  it('utilise toujours exactement n cubes', () => {
    for (let n = 1; n <= 60; n++) {
      expect(shapeFor(n).cells).toHaveLength(n);
    }
  });

  it('ne produit jamais deux cubes au meme endroit', () => {
    for (let n = 1; n <= 60; n++) {
      const keys = new Set(shapeFor(n).cells.map((c) => `${c.x},${c.y}`));
      expect(keys.size).toBe(n);
    }
  });

  it('tient dans sa boite englobante', () => {
    for (let n = 1; n <= 60; n++) {
      const s = shapeFor(n);
      for (const c of s.cells) {
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.y).toBeGreaterThanOrEqual(0);
        expect(c.x).toBeLessThan(s.w);
        expect(c.y).toBeLessThan(s.h);
      }
    }
  });

  it('donne un rectangle plein aux nombres composes', () => {
    for (let n = 4; n <= 60; n++) {
      if (isPrime(n)) continue;
      const s = shapeFor(n);
      expect(s.w * s.h).toBe(n);
      expect(s.w).toBeLessThanOrEqual(s.h);
    }
  });

  it('donne une bosse (et donc un trou dans la boite) aux premiers >= 5', () => {
    for (let n = 5; n <= 60; n++) {
      if (!isPrime(n)) continue;
      const s = shapeFor(n);
      expect(s.w * s.h).toBeGreaterThan(n);
      expect(s.cells.filter((c) => c.y === 0)).toHaveLength(1);
    }
  });

  it('garde les petites formes reconnaissables', () => {
    expect(shapeFor(1)).toMatchObject({ w: 1, h: 1 });
    expect(shapeFor(2)).toMatchObject({ w: 1, h: 2 });
    expect(shapeFor(3)).toMatchObject({ w: 1, h: 3 });
    expect(shapeFor(4)).toMatchObject({ w: 2, h: 2 });
    expect(shapeFor(5)).toMatchObject({ w: 2, h: 3 });
    expect(shapeFor(6)).toMatchObject({ w: 2, h: 3 });
    expect(shapeFor(7)).toMatchObject({ w: 2, h: 4 });
    expect(shapeFor(9)).toMatchObject({ w: 3, h: 3 });
    expect(shapeFor(10)).toMatchObject({ w: 2, h: 5 });
  });

  it('pose les yeux sur la cellule la plus haute', () => {
    for (let n = 1; n <= MAX_VALUE; n++) {
      const s = shapeFor(n);
      const face = s.cells[s.faceIndex];
      const minY = Math.min(...s.cells.map((c) => c.y));
      expect(face.y).toBe(minY);
    }
  });
});
