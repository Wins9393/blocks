import { describe, expect, it } from 'vitest';
import { MAX_VALUE, UNIT } from '../core/constants';
import { centeredCells, shapeFor } from '../core/shape';
import { SLOTS, slotFor } from '../core/wardrobe';
import { Forge } from './mesh';
import type { Maille } from './mesh';
import { SLOTS_OBJETS, objet3D } from './objets3d';
import { mailleBloc } from './relief';

function forge(dessine?: (f: Forge) => void): Maille {
  const f = new Forge();
  dessine?.(f);
  return f.fini();
}

/**
 * Une maille qui tient debout : des nombres finis, des normales orientées.
 * On parcourt sans assertion et on ne se plaint qu'une fois — un `expect` par
 * sommet, sur cent blocs, fait durer le test dix secondes.
 */
function defaut(m: Maille): string | null {
  if (m.nb % 3 !== 0) return `sommets non multiples de 3 (${m.nb})`;
  for (let i = 0; i < m.pos.length; i++) {
    if (!Number.isFinite(m.pos[i])) return `position ${i} = ${m.pos[i]}`;
  }
  for (let i = 0; i < m.nor.length; i += 3) {
    const l = Math.hypot(m.nor[i], m.nor[i + 1], m.nor[i + 2]);
    if (!Number.isFinite(l) || l < 0.001) return `normale nulle au sommet ${i / 3}`;
  }
  return null;
}

function verifie(m: Maille, quoi: string) {
  expect(defaut(m), quoi).toBe(null);
}

/** Le point est-il dans le triangle, vu de face ? */
function dansTriangle(
  p: [number, number],
  a: [number, number],
  b: [number, number],
  c: [number, number],
): boolean {
  const cote = (u: [number, number], v: [number, number], w: [number, number]) =>
    (u[0] - w[0]) * (v[1] - w[1]) - (v[0] - w[0]) * (u[1] - w[1]);
  const d1 = cote(p, a, b);
  const d2 = cote(p, b, c);
  const d3 = cote(p, c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

describe('les objets en volume', () => {
  it('modélise toutes les pièces des emplacements repris en volume', () => {
    // La promesse est simple : si une pièce sort du dessin, elle doit exister
    // en volume. Une pièce oubliée disparaîtrait purement et simplement de la
    // tête du personnage dès qu'on bascule.
    for (const slot of SLOTS_OBJETS) {
      for (const piece of slotFor(slot).pieces) {
        if (piece.id === 'rien') continue;
        const objet = objet3D(slot, piece.id);
        expect(objet, `${slot}:${piece.id} n'a pas de volume`).toBeDefined();
        const corps = forge(objet?.corps);
        const mobile = forge(objet?.mobile);
        const verre = forge(objet?.verre);
        expect(
          corps.nb + mobile.nb + verre.nb,
          `${slot}:${piece.id} ne produit aucun triangle`,
        ).toBeGreaterThan(0);
        verifie(corps, `${slot}:${piece.id} corps`);
        verifie(mobile, `${slot}:${piece.id} mobile`);
        verifie(verre, `${slot}:${piece.id} verre`);
      }
    }
  });

  it('ne modélise que des objets, jamais de la pilosité', () => {
    // Cheveux, sourcils, bouches, moustaches, joues et yeux restent dessinés :
    // c'est le partage qui rend l'affaire tenable.
    const dessines = SLOTS.map((s) => s.key).filter((k) => !SLOTS_OBJETS.includes(k as never));
    expect(dessines.sort()).toEqual(['brows', 'cheeks', 'eyes', 'hair', 'mouth', 'stache']);
  });

  it('laisse le regard passer à travers les montures', () => {
    // Une monture fermée doit être un anneau, pas une plaque : extrudée de
    // travers, elle bouchait l'œil — et le regard qui suit le doigt avec.
    // Le cache-œil est le seul à couvrir, et c'est son métier.
    const U = UNIT;
    const oeil: Array<[number, number]> = [
      [-U * 0.21, -U * 0.07],
      [U * 0.21, -U * 0.07],
    ];
    for (const piece of slotFor('glasses').pieces) {
      if (piece.id === 'rien' || piece.id === 'cache') continue;
      const m = forge(objet3D('glasses', piece.id)?.corps);
      for (const [px, py] of oeil) {
        let couvert = 0;
        for (let i = 0; i < m.nb; i += 3) {
          const p = (k: number): [number, number] => [m.pos[(i + k) * 3], m.pos[(i + k) * 3 + 1]];
          if (dansTriangle([px, py], p(0), p(1), p(2))) couvert++;
        }
        expect(couvert, `glasses:${piece.id} bouche l'œil`).toBe(0);
      }
    }
  });

  it('donne une pièce mobile à celles qui bougent', () => {
    for (const [slot, id] of [
      ['hat', 'helice'],
      ['hat', 'aureole'],
    ] as const) {
      const objet = objet3D(slot, id);
      expect(Boolean(objet?.mobile || objet?.flotte), `${slot}:${id}`).toBe(true);
    }
  });
});

/** La maille d'un bloc de nombre : une seule teinte, un seul modèle. */
function maille(v: number) {
  const shape = shapeFor(v);
  return mailleBloc(
    shape,
    shape.cells.map(() => [0.5, 0.5, 0.5] as [number, number, number]),
    shape.cells.map(() => 0),
  );
}

describe('le grain des matières', () => {
  it('tient au cube, pas au bloc', () => {
    // C'est l'invariant de Q13 : le repère du grain est celui du cube. Calé
    // sur le bloc, la veine glisserait d'un cran chaque fois qu'une soudure
    // déplace le centre de masse — un saut visible sur tout un mur.
    const shape = shapeFor(4);
    const m = mailleBloc(
      shape,
      shape.cells.map(() => [0.5, 0.5, 0.5] as [number, number, number]),
      shape.cells.map(() => 0),
      shape.cells.map(() => 1),
      shape.cells.map((_, i) => i / 4),
    );
    let posMax = 0;
    let localMax = 0;
    for (let i = 0; i < m.nb; i++) {
      posMax = Math.max(posMax, Math.abs(m.pos[i * 3]), Math.abs(m.pos[i * 3 + 1]));
      localMax = Math.max(localMax, Math.abs(m.local[i * 3]), Math.abs(m.local[i * 3 + 1]));
    }
    // Le bloc s'étend sur deux cubes, chaque cube sur un seul.
    expect(posMax).toBeGreaterThan(UNIT * 0.9);
    expect(localMax).toBeLessThanOrEqual(UNIT / 2 + 0.001);
  });

  it('donne à chaque cube son grain et sa graine', () => {
    const shape = shapeFor(4);
    const m = mailleBloc(
      shape,
      shape.cells.map(() => [0.5, 0.5, 0.5] as [number, number, number]),
      shape.cells.map(() => 0),
      shape.cells.map(() => 3),
      shape.cells.map((_, i) => (i + 1) / 8),
    );
    const graines = new Set<number>();
    for (let i = 0; i < m.nb; i++) {
      expect(m.grain[i * 2]).toBe(3);
      graines.add(m.grain[i * 2 + 1]);
    }
    // Quatre cubes, quatre veinages : sinon le mur devient un damier.
    expect(graines.size).toBe(4);
  });
});

describe('les blocs en volume', () => {
  it('tient debout pour toutes les valeurs', () => {
    for (let v = 1; v <= MAX_VALUE; v++) verifie(maille(v), `bloc ${v}`);
  });

  it('tient dans le même cadre que le dessin', () => {
    // C'est l'invariant qui rend la bascule honnête : le volume occupe le même
    // rectangle que le trait — au pincement près à chaque jointure de cubes —
    // sinon le visage dessiné par-dessus glisserait et les deux moteurs ne
    // montreraient plus le même bloc.
    for (let v = 1; v <= MAX_VALUE; v++) {
      const cells = centeredCells(v);
      const attendu = {
        left: Math.min(...cells.map((c) => c.x)) * UNIT - UNIT / 2,
        right: Math.max(...cells.map((c) => c.x)) * UNIT + UNIT / 2,
        top: Math.min(...cells.map((c) => c.y)) * UNIT - UNIT / 2,
        bottom: Math.max(...cells.map((c) => c.y)) * UNIT + UNIT / 2,
      };
      const m = maille(v);
      let l = Infinity, r = -Infinity, h = Infinity, b = -Infinity;
      for (let i = 0; i < m.pos.length; i += 3) {
        l = Math.min(l, m.pos[i]);
        r = Math.max(r, m.pos[i]);
        h = Math.min(h, m.pos[i + 1]);
        b = Math.max(b, m.pos[i + 1]);
      }
      expect(l).toBeCloseTo(attendu.left, 4);
      expect(r).toBeCloseTo(attendu.right, 4);
      expect(h).toBeCloseTo(attendu.top, 4);
      expect(b).toBeCloseTo(attendu.bottom, 4);
    }
  });
});
