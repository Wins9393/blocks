import { describe, expect, it } from 'vitest';
import { MAX_VALUE } from '../core/constants';
import { traitFor } from './faces';
import type { Trait } from './faces';

const signature = (t: Trait) =>
  [
    t.hair,
    t.mouth,
    t.brows ? 'b' : '',
    t.glasses ? 'l' : '',
    t.moustache ? 'm' : '',
    t.freckles ? 'f' : '',
    t.blush ? 'r' : '',
    t.tens ?? 0,
  ].join('/');

describe('traitFor', () => {
  it('donne un visage complet à toutes les valeurs jouables', () => {
    for (let v = 1; v <= MAX_VALUE; v++) {
      const t = traitFor(v);
      expect(t.hair, `valeur ${v}`).toBeTruthy();
      expect(t.mouth, `valeur ${v}`).toBeTruthy();
    }
  });

  it('ne donne jamais deux fois la même tête de 1 à 10', () => {
    const vus = new Set<string>();
    for (let v = 1; v <= 10; v++) vus.add(signature(traitFor(v)));
    expect(vus.size).toBe(10);
  });

  it('couronne tout ce qui contient une dizaine', () => {
    expect(traitFor(9).hair).not.toBe('crown');
    for (let v = 10; v <= MAX_VALUE; v++) {
      expect(traitFor(v).hair, `valeur ${v}`).toBe('crown');
    }
  });

  it('compte les dizaines en rangs de couronne', () => {
    expect(traitFor(10).tens).toBe(1);
    expect(traitFor(17).tens).toBe(1);
    expect(traitFor(20).tens).toBe(2);
  });

  it('garde le visage de l unité au-dessus de dix', () => {
    // 13 porte la moustache du 3, 18 les lunettes du 8 : la décomposition se
    // lit sur la tête du personnage.
    expect(traitFor(13).moustache).toBe(traitFor(3).moustache);
    expect(traitFor(18).glasses).toBe(traitFor(8).glasses);
    expect(traitFor(11).mouth).toBe(traitFor(1).mouth);
  });
});
