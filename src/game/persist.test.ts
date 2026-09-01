import { describe, expect, it, vi } from 'vitest';
import { NAME_MAX, cleanName, loadPrefs, makeSpace, newSpaceId } from './persist';

/** Une mémoire de navigateur juste assez grande pour une préférence. */
function memoire(valeur: unknown) {
  const sac = new Map([['blocks.prefs.v1', JSON.stringify(valeur)]]);
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => sac.get(k) ?? null,
    setItem: (k: string, v: string) => void sac.set(k, v),
    removeItem: (k: string) => void sac.delete(k),
  });
}

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

describe('loadPrefs', () => {
  it("garde le silence demandé par l'ancien réglage unique", () => {
    // `muted` coupait tout d'un bloc. Rallumer la voix au chargement, ce serait
    // trahir quelqu'un qui avait justement demandé le silence.
    memoire({ muted: true, hintsSeen: true });
    expect(loadPrefs()).toMatchObject({ voix: false, bruitages: false, hintsSeen: true });
  });

  it('allume les deux sons par défaut', () => {
    memoire({ hintsSeen: true });
    expect(loadPrefs()).toMatchObject({ voix: true, bruitages: true });
  });

  it("ne traîne pas l'ancien réglage du relief", () => {
    // Il n'y a plus qu'un dessin — le volume : la clé ne doit pas se réécrire
    // indéfiniment dans la sauvegarde.
    memoire({ relief: false });
    expect(loadPrefs()).not.toHaveProperty('relief');
  });
});
