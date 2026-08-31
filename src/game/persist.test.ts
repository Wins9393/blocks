import { describe, expect, it } from 'vitest';
import { NAME_MAX, cleanName, makeSpace, newSpaceId } from './persist';

describe('cleanName', () => {
  it('rogne les espaces et écrase les doublons', () => {
    expect(cleanName('  Lou   Anne  ')).toBe('Lou Anne');
  });

  it('borne la longueur', () => {
    expect(cleanName('a'.repeat(50))).toHaveLength(NAME_MAX);
  });

  it('ne rend jamais un nom vide', () => {
    // Un espace sans nom n'est plus repérable dans la liste.
    expect(cleanName('   ')).toBeTruthy();
    expect(cleanName('')).toBeTruthy();
  });
});

describe('newSpaceId', () => {
  it('ne se répète pas', () => {
    const ids = new Set(Array.from({ length: 200 }, newSpaceId));
    expect(ids.size).toBe(200);
  });
});

describe('makeSpace', () => {
  it('nettoie le nom et garde la couleur', () => {
    const space = makeSpace('  Timeo ', 4);
    expect(space.name).toBe('Timeo');
    expect(space.tint).toBe(4);
    expect(space.id).toBeTruthy();
  });
});
