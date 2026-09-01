import { describe, expect, it } from 'vitest';
import { MAX_VALUE, UNIT } from '../core/constants';
import { centeredCells } from '../core/shape';
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

describe('les blocs en volume', () => {
  it('tient debout pour toutes les valeurs', () => {
    for (let v = 1; v <= MAX_VALUE; v++) verifie(mailleBloc(v), `bloc ${v}`);
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
      const m = mailleBloc(v);
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
