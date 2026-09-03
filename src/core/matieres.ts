/**
 * De quoi les cubes d'un chantier sont faits.
 *
 * En construction il n'y a plus de visage ni de couleur par valeur : c'est la
 * matière qui dit ce qu'on regarde, et c'est elle qui remplace le moustachu.
 * Les dix matières et leur grain viennent ensuite ; il n'y a ici que le chêne,
 * le temps que le modèle tienne debout.
 */

/**
 * Les cinq modèles de réponse à la lumière, dans la numérotation du nuanceur.
 * C'est `src/render/mesh.ts` qui en est propriétaire — le noyau reste pur, il
 * ne l'importe pas, et un test tient les deux numérotations ensemble.
 */
export const MODELE = {
  mat: 0,
  metal: 1,
  verre: 2,
  lumiere: 3,
  gemme: 4,
} as const;

export interface Matiere {
  nom: string;
  /** Couleur de base, « #RRGGBB ». */
  couleur: string;
  modele: number;
}

export const CHENE = 0;

export const MATIERES: Matiere[] = [{ nom: 'Chêne', couleur: '#B8843F', modele: MODELE.mat }];

/** Une matière inconnue retombe sur la première : une sauvegarde d'une version
 *  qui en offrait plus ne doit pas rendre des cubes sans couleur. */
export function matiereFor(id: number): Matiere {
  return MATIERES[id] ?? MATIERES[0];
}

/**
 * Ce qui habille un cube : sa matière, et le grain figé à sa naissance.
 *
 * La graine ne sert encore à rien — le grain arrive avec les dix matières.
 * Elle est là dès maintenant parce qu'elle vit dans la sauvegarde, et qu'un
 * format qui change deux fois coûte deux relectures d'anciennes clés.
 */
export interface Skin {
  mat: number;
  seed: number;
}

export function newSkin(mat: number = CHENE): Skin {
  return { mat, seed: Math.floor(Math.random() * 65536) };
}
