import { describe, expect, it } from 'vitest';
import { MATIERES, MODELE, matiereFor } from './matieres';
import { MAT_GEMME, MAT_LUMIERE, MAT_MAT, MAT_METAL, MAT_VERRE } from '../render/mesh';

describe('les matières', () => {
  it('parlent la même langue que le nuanceur', () => {
    // Le noyau reste pur : il ne peut pas importer la numérotation du rendu, il
    // la recopie. Ce test est ce qui tient les deux ensemble.
    expect(MODELE).toEqual({
      mat: MAT_MAT,
      metal: MAT_METAL,
      verre: MAT_VERRE,
      lumiere: MAT_LUMIERE,
      gemme: MAT_GEMME,
    });
  });

  it('ont toutes un nom, une couleur et un modèle connu', () => {
    const modeles = new Set(Object.values(MODELE));
    for (const m of MATIERES) {
      expect(m.nom, JSON.stringify(m)).toBeTruthy();
      expect(m.couleur).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(modeles.has(m.modele as 0 | 1 | 2 | 3 | 4)).toBe(true);
    }
  });

  it('retombent sur la première quand l’identifiant est inconnu', () => {
    // Une sauvegarde faite par une version qui en offrait plus ne doit pas
    // rendre des cubes sans couleur.
    expect(matiereFor(999)).toBe(MATIERES[0]);
    expect(matiereFor(-1)).toBe(MATIERES[0]);
  });
});
