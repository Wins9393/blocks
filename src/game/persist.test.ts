import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SPACE_ID,
  NAME_MAX,
  cleanName,
  dropScene,
  loadPrefs,
  loadProgress,
  loadScene,
  makeSpace,
  newSpaceId,
  saveProgress,
  saveScene,
  sceneKindFor,
} from './persist';
import type { SavedScene } from './persist';

/** Une mémoire de navigateur, rendue pour qu'un test y sème ce qu'il veut. */
function stock(entrees: Record<string, unknown> = {}): Map<string, string> {
  const sac = new Map(Object.entries(entrees).map(([k, v]) => [k, JSON.stringify(v)]));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => sac.get(k) ?? null,
    setItem: (k: string, v: string) => void sac.set(k, v),
    removeItem: (k: string) => void sac.delete(k),
  });
  return sac;
}

/** Une mémoire juste assez grande pour une préférence. */
function memoire(valeur: unknown) {
  stock({ 'blocks.prefs.v1': valeur });
}

const scene = (v: number): SavedScene => ({ w: 400, blocks: [{ v, x: 10, y: 20, a: 0 }] });

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

describe('sceneKindFor', () => {
  it('range le jeu libre et les missions sur la même scène', () => {
    // C'est ce qui fait qu'aller des missions au jeu libre ne recharge rien :
    // recharger une scène qu'on ne quitte pas reconstruirait tous les corps.
    expect(sceneKindFor('libre')).toBe('nombres');
    expect(sceneKindFor('missions')).toBe('nombres');
  });

  it('met le chantier à part', () => {
    expect(sceneKindFor('construction')).toBe('chantier');
  });
});

describe('les deux scènes d’un espace', () => {
  it('ne se mélangent jamais', () => {
    stock();
    saveScene('leo', 'nombres', scene(7));
    saveScene('leo', 'chantier', scene(1));
    expect(loadScene('leo', 'nombres')?.blocks[0].v).toBe(7);
    expect(loadScene('leo', 'chantier')?.blocks[0].v).toBe(1);
  });

  it("partent ensemble quand l'espace est supprimé", () => {
    stock();
    saveScene('leo', 'nombres', scene(7));
    saveScene('leo', 'chantier', scene(1));
    dropScene('leo');
    expect(loadScene('leo', 'nombres')).toBeNull();
    expect(loadScene('leo', 'chantier')).toBeNull();
  });

  it("n'ouvrent pas un chantier sur la scène d'avant les espaces", () => {
    // Cet héritage-là était la scène des nombres, la seule qui existât alors.
    // La retrouver sur un chantier y ferait apparaître des blocs que personne
    // n'y a posés.
    stock({ 'blocks.scene.v1': scene(5) });
    expect(loadScene(DEFAULT_SPACE_ID, 'nombres')?.blocks[0].v).toBe(5);
    expect(loadScene(DEFAULT_SPACE_ID, 'chantier')).toBeNull();
  });
});

describe('le mode d’un espace', () => {
  const vide = { faites: [], pieces: [], passees: [] };

  it('repart en jeu libre quand rien n’est enregistré', () => {
    stock();
    expect(loadProgress('leo').mode).toBe('libre');
  });

  it("garde l'espace quitté en mission dans les missions", () => {
    // `actif` est le réglage d'avant les trois modes : on le relit une dernière
    // fois plutôt que de renvoyer l'enfant au jeu libre dans son dos.
    stock({ 'blocks.progress.v1:leo': { ...vide, actif: true } });
    expect(loadProgress('leo').mode).toBe('missions');
  });

  it('ne réécrit plus jamais cet ancien réglage', () => {
    const sac = stock({ 'blocks.progress.v1:leo': { ...vide, actif: true } });
    saveProgress('leo', loadProgress('leo'));
    expect(sac.get('blocks.progress.v1:leo')).not.toContain('actif');
  });

  it('garde le chantier', () => {
    stock();
    saveProgress('leo', { ...vide, mode: 'construction' });
    expect(loadProgress('leo').mode).toBe('construction');
  });

  it('ignore un mode qu’il ne connaît pas', () => {
    stock({ 'blocks.progress.v1:leo': { ...vide, mode: 'zigzag' } });
    expect(loadProgress('leo').mode).toBe('libre');
  });
});
