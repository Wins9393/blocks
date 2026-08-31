import { describe, expect, it } from 'vitest';
import { isPrime, rectanglesFor, shapeFor } from './shape';
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

describe('rectanglesFor', () => {
  it('pave exactement la forme, sans trou ni recouvrement', () => {
    for (let n = 1; n <= MAX_VALUE; n++) {
      const shape = shapeFor(n);
      const couverture = new Map<string, number>();
      for (const r of rectanglesFor(n)) {
        // Retour aux coordonnées entières de la grille.
        const x0 = r.x - (r.w - 1) / 2 + (shape.w - 1) / 2;
        const y0 = r.y - (r.h - 1) / 2 + (shape.h - 1) / 2;
        expect(Number.isInteger(x0)).toBe(true);
        expect(Number.isInteger(y0)).toBe(true);
        for (let j = 0; j < r.h; j++) {
          for (let i = 0; i < r.w; i++) {
            const k = `${x0 + i},${y0 + j}`;
            couverture.set(k, (couverture.get(k) ?? 0) + 1);
          }
        }
      }
      const attendu = new Set(shape.cells.map((c) => `${c.x},${c.y}`));
      expect(couverture.size).toBe(n);
      for (const [k, fois] of couverture) {
        expect(attendu.has(k)).toBe(true);
        expect(fois).toBe(1);
      }
    }
  });

  it('reste très économe : une ou deux pièces pour toutes les formes jouables', () => {
    for (let n = 1; n <= MAX_VALUE; n++) {
      expect(rectanglesFor(n).length).toBeLessThanOrEqual(2);
    }
  });

  it('donne une seule pièce aux rectangles pleins', () => {
    for (const n of [1, 2, 3, 4, 6, 8, 9, 10, 12, 16, 20]) {
      expect(rectanglesFor(n)).toHaveLength(1);
    }
  });
});
