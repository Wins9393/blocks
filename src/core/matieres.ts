/**
 * De quoi les cubes d'un chantier sont faits.
 *
 * En construction il n'y a plus de visage ni de couleur par valeur : c'est la
 * matière qui dit ce qu'on regarde, et c'est elle qui remplace le moustachu.
 *
 * Chaque matière porte **sa** couleur, et il n'y a pas d'axe de teinte
 * par-dessus : du bois bleu ferait du grain un bruit posé sur un aplat, et la
 * matière cesserait de se reconnaître. Les variantes sont des entrées de plus —
 * chêne *et* noyer — pas une case de plus à croiser.
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

/**
 * Les grains, dans la numérotation du nuanceur elle aussi.
 *
 * Cinq matières mates sans grain, ce sont cinq aplats bruns et gris : c'est
 * exactement le problème de `colorFor` qu'on vient de retirer. Le grain est ce
 * qui distingue les matières une fois le visage parti.
 */
export const GRAIN = {
  aucun: 0,
  bois: 1,
  moucheture: 2,
  joints: 3,
  fin: 4,
  brosse: 5,
  facettes: 6,
} as const;

/** Le timbre d'un choc. Nommé ici pour que le noyau ignore l'audio du navigateur. */
export type Timbre = 'sine' | 'triangle' | 'square' | 'sawtooth';

export interface Matiere {
  nom: string;
  /** Couleur de base, « #RRGGBB ». */
  couleur: string;
  modele: number;
  grain: number;
  /** Hauteur du choc, en hertz : l'herbe est basse, le cristal est haut. */
  ton: number;
  timbre: Timbre;
  /** 0..1 — la part de bruit dans le choc. Le verre tinte, la terre étouffe. */
  souffle: number;
}

/**
 * Dix, ce qui remplit la barre pile : deux rangées de cinq sur téléphone, une
 * seule au-delà de 880 px. Tout est visible d'un coup d'œil, rien ne se cache
 * derrière un défilement — un enfant de quatre ans ne cherche pas dans une
 * liste qui défile.
 */
export const MATIERES: Matiere[] = [
  { nom: 'Chêne', couleur: '#C08B45', modele: MODELE.mat, grain: GRAIN.bois, ton: 320, timbre: 'triangle', souffle: 0.35 },
  { nom: 'Noyer', couleur: '#6E4630', modele: MODELE.mat, grain: GRAIN.bois, ton: 250, timbre: 'triangle', souffle: 0.4 },
  { nom: 'Pierre', couleur: '#8D9199', modele: MODELE.mat, grain: GRAIN.moucheture, ton: 180, timbre: 'sine', souffle: 0.75 },
  { nom: 'Brique', couleur: '#B4553F', modele: MODELE.mat, grain: GRAIN.joints, ton: 230, timbre: 'sine', souffle: 0.6 },
  { nom: 'Herbe', couleur: '#6FA84A', modele: MODELE.mat, grain: GRAIN.fin, ton: 150, timbre: 'sine', souffle: 0.85 },
  { nom: 'Acier', couleur: '#A8B2BE', modele: MODELE.metal, grain: GRAIN.brosse, ton: 640, timbre: 'square', souffle: 0.2 },
  { nom: 'Or', couleur: '#E3B44A', modele: MODELE.metal, grain: GRAIN.aucun, ton: 780, timbre: 'triangle', souffle: 0.15 },
  { nom: 'Verre', couleur: '#3E93B5', modele: MODELE.verre, grain: GRAIN.aucun, ton: 1180, timbre: 'sine', souffle: 0.1 },
  { nom: 'Néon', couleur: '#FFE9A8', modele: MODELE.lumiere, grain: GRAIN.aucun, ton: 880, timbre: 'sine', souffle: 0.05 },
  { nom: 'Cristal', couleur: '#B98CE8', modele: MODELE.gemme, grain: GRAIN.facettes, ton: 1500, timbre: 'triangle', souffle: 0.1 },
];

export const CHENE = 0;

/**
 * Une matière inconnue retombe sur la première : une sauvegarde faite par une
 * version qui en offrait plus ne doit pas rendre des cubes sans couleur.
 */
export function matiereFor(id: number): Matiere {
  return MATIERES[id] ?? MATIERES[0];
}

/**
 * Ce qui habille un cube : sa matière, et le grain figé à sa naissance.
 *
 * La graine ne bouge plus jamais — ni quand on assemble, ni quand on coupe.
 * Un grain calé sur l'assemblage sauterait à chaque brique posée, parce que le
 * centre de masse se déplace ; et le même grain dans tous les cubes ferait d'un
 * mur un damier où l'œil ne voit plus que la répétition.
 */
export interface Skin {
  mat: number;
  seed: number;
}

export function newSkin(mat: number = CHENE): Skin {
  return { mat, seed: Math.floor(Math.random() * 65536) };
}
