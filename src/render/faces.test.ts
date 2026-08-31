import { describe, expect, it } from 'vitest';
import { MAX_VALUE } from '../core/constants';
import { SLOTS, cleanWardrobe, lookFor } from './faces';
import type { ResolvedLook, Wardrobe } from './faces';

const signature = (l: ResolvedLook) => SLOTS.map((s) => l[s.key]).join('/');

describe('lookFor', () => {
  it('habille complètement toutes les valeurs jouables', () => {
    for (let v = 1; v <= MAX_VALUE; v++) {
      const look = lookFor(v);
      for (const slot of SLOTS) {
        expect(slot.options, `valeur ${v}, ${slot.key}`).toContain(look[slot.key]);
      }
    }
  });

  it('ne donne jamais deux fois la même tête de 1 à 10', () => {
    const vus = new Set<string>();
    for (let v = 1; v <= 10; v++) vus.add(signature(lookFor(v)));
    expect(vus.size).toBe(10);
  });

  it('coiffe du chapeau du 10 tout ce qui contient une dizaine', () => {
    expect(lookFor(9).hat).not.toBe(lookFor(10).hat);
    for (let v = 10; v <= MAX_VALUE; v++) {
      expect(lookFor(v).hat, `valeur ${v}`).toBe(lookFor(10).hat);
    }
  });

  it('compte les dizaines en rangs de chapeau', () => {
    expect(lookFor(9).tens).toBe(0);
    expect(lookFor(10).tens).toBe(1);
    expect(lookFor(17).tens).toBe(1);
    expect(lookFor(20).tens).toBe(2);
  });

  it('garde le visage de l unité au-dessus de dix', () => {
    // 13 porte la moustache du 3, 18 les lunettes du 8 : la décomposition se
    // lit sur la tête du personnage.
    expect(lookFor(13).stache).toBe(lookFor(3).stache);
    expect(lookFor(18).glasses).toBe(lookFor(8).glasses);
    expect(lookFor(11).mouth).toBe(lookFor(1).mouth);
  });

  it('suit les réglages de l espace, y compris au-dessus de dix', () => {
    const wardrobe: Wardrobe = { 3: { hair: 'boucles' }, 10: { hat: 'bonnet' } };
    expect(lookFor(3, wardrobe).hair).toBe('boucles');
    // Le 13 hérite des boucles du 3 et du bonnet du 10 : le chapeau du 10,
    // quel qu'il soit, reste la marque de la dizaine.
    expect(lookFor(13, wardrobe).hair).toBe('boucles');
    expect(lookFor(13, wardrobe).hat).toBe('bonnet');
    expect(lookFor(20, wardrobe).hat).toBe('bonnet');
    expect(lookFor(20, wardrobe).tens).toBe(2);
  });

  it('laisse intactes les valeurs non réglées', () => {
    const wardrobe: Wardrobe = { 3: { hair: 'boucles' } };
    expect(lookFor(4, wardrobe)).toEqual(lookFor(4));
  });
});

describe('cleanWardrobe', () => {
  it('écarte les valeurs hors barre et les pièces inconnues', () => {
    const sale = {
      3: { hair: 'boucles', hat: 'sombrero', pouet: 'x' },
      42: { hair: 'pics' },
      abc: { hair: 'pics' },
      7: 'pas un objet',
    };
    expect(cleanWardrobe(sale)).toEqual({ 3: { hair: 'boucles' } });
  });

  it('survit à n importe quoi', () => {
    expect(cleanWardrobe(null)).toEqual({});
    expect(cleanWardrobe('bonjour')).toEqual({});
    expect(cleanWardrobe([1, 2])).toEqual({});
  });
});
