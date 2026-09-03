import { describe, expect, it } from 'vitest';
import { GRAIN, MATIERES, MODELE, matiereFor } from './matieres';
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

  it('ont toutes un nom, une couleur, un modèle et un grain connus', () => {
    const modeles = new Set<number>(Object.values(MODELE));
    const grains = new Set<number>(Object.values(GRAIN));
    for (const m of MATIERES) {
      expect(m.nom, JSON.stringify(m)).toBeTruthy();
      expect(m.couleur).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(modeles.has(m.modele), m.nom).toBe(true);
      expect(grains.has(m.grain), m.nom).toBe(true);
    }
  });

  it('remplissent la barre sans la faire défiler', () => {
    // Dix, c'est deux rangées de cinq sur téléphone et une seule au-delà de
    // 880 px : tout est visible d'un coup d'œil. Au-delà, la barre pagine, et
    // un enfant de quatre ans ne cherche pas dans une liste qui défile.
    expect(MATIERES).toHaveLength(10);
  });

  it('ne se ressemblent pas deux à deux', () => {
    // Deux matières de même nom ou de même couleur seraient deux boutons qui
    // font la même chose.
    expect(new Set(MATIERES.map((m) => m.nom)).size).toBe(MATIERES.length);
    expect(new Set(MATIERES.map((m) => m.couleur)).size).toBe(MATIERES.length);
  });

  it('couvrent les cinq modèles d’éclairage', () => {
    // Cinq mates sans grain, ce sont cinq aplats : c'est le problème qu'on
    // vient de retirer avec la couleur par valeur.
    expect(new Set(MATIERES.map((m) => m.modele)).size).toBe(Object.keys(MODELE).length);
  });

  it('donnent un grain à toute matière mate', () => {
    // Un aplat mat sans grain ne se distingue de son voisin que par sa teinte,
    // et c'est le grain qui remplace le moustachu.
    for (const m of MATIERES) {
      if (m.modele !== MODELE.mat) continue;
      expect(m.grain, m.nom).not.toBe(GRAIN.aucun);
    }
  });

  it('sonnent chacune à sa hauteur', () => {
    for (const m of MATIERES) {
      expect(m.ton, m.nom).toBeGreaterThan(0);
      expect(m.souffle, m.nom).toBeGreaterThanOrEqual(0);
      expect(m.souffle, m.nom).toBeLessThanOrEqual(1);
    }
    expect(new Set(MATIERES.map((m) => m.ton)).size).toBe(MATIERES.length);
  });

  it('retombent sur la première quand l’identifiant est inconnu', () => {
    // Une sauvegarde faite par une version qui en offrait plus ne doit pas
    // rendre des cubes sans couleur.
    expect(matiereFor(999)).toBe(MATIERES[0]);
    expect(matiereFor(-1)).toBe(MATIERES[0]);
  });
});
