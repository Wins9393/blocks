/**
 * La soudure, en géométrie pure.
 *
 * Un assemblage garde son inclinaison : on aligne le nouveau venu sur la
 * grille du bloc **cible**, pas sur celle de l'écran. Redresser l'ensemble au
 * lâcher ferait sauter toute la construction sous le doigt, et un enfant qui
 * pose une brique sur une tour un peu penchée verrait la tour se remettre
 * droite d'un coup.
 */

import type { Cell } from './shape';

const VOISINS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const cle = (c: Cell) => `${c.x},${c.y}`;

/** Rotation d'une case par quarts de tour. L'écran a son y vers le bas. */
export function rotateCell(c: Cell, quart: number): Cell {
  switch (((quart % 4) + 4) % 4) {
    case 1:
      return { x: -c.y, y: c.x };
    case 2:
      return { x: -c.x, y: -c.y };
    case 3:
      return { x: c.y, y: -c.x };
    default:
      return { x: c.x, y: c.y };
  }
}

/**
 * Les cases du bloc tiré, exprimées dans la grille du bloc cible : sa première
 * case atterrit sur `ancre`, les autres suivent rigidement.
 */
export function placeCells(tire: Cell[], quart: number, ancre: Cell): Cell[] {
  const a0 = tire[0];
  return tire.map((c) => {
    const r = rotateCell({ x: c.x - a0.x, y: c.y - a0.y }, quart);
    return { x: ancre.x + r.x, y: ancre.y + r.y };
  });
}

/** Décalages à essayer, du plus proche au plus lointain. */
function voisinage(rayon: number): Cell[] {
  const out: Cell[] = [];
  for (let dy = -rayon; dy <= rayon; dy++) {
    for (let dx = -rayon; dx <= rayon; dx++) out.push({ x: dx, y: dy });
  }
  return out.sort((a, b) => a.x * a.x + a.y * a.y - (b.x * b.x + b.y * b.y));
}

/**
 * Où le bloc tiré se colle, ou `null` s'il ne se colle nulle part.
 *
 * Deux conditions, et pas une de plus : aucune case sur une case déjà prise,
 * et **au moins une arête partagée** avec l'assemblage. Le coin ne soude pas —
 * c'est ce qui garde la connexité univoque, donc la coupe prévisible.
 *
 * Si la place visée est prise, on essaie les voisines dans l'ordre de leur
 * distance. Pousser le voisin d'un cran serait un moteur de dominos : appuyer
 * dans un mur plein déplacerait toute une rangée, et l'enfant verrait sa
 * maison se réarranger sous son doigt.
 */
export function weld(
  cible: Cell[],
  tire: Cell[],
  quart: number,
  ancre: Cell,
  rayon = 2,
): Cell[] | null {
  const occupe = new Set(cible.map(cle));
  for (const d of voisinage(rayon)) {
    const pose = placeCells(tire, quart, { x: ancre.x + d.x, y: ancre.y + d.y });
    if (pose.some((c) => occupe.has(cle(c)))) continue;
    const touche = pose.some((c) =>
      VOISINS.some(([dx, dy]) => occupe.has(`${c.x + dx},${c.y + dy}`)),
    );
    if (touche) return pose;
  }
  return null;
}

/** Un point du monde, en pixels. */
export interface Point {
  x: number;
  y: number;
}

/**
 * Position monde du centre d'une case exprimée dans la **grille d'un bloc**.
 *
 * Un bloc a deux repères. Celui de ses cases, entier, où la soudure travaille ;
 * et celui de son corps, qui tourne autour de son centre de masse et où le
 * dessin travaille. La première case fait le pont : on connaît sa coordonnée
 * entière (`cells[0]`) et son décalage au centre de masse (`centre[0]`), et
 * tout le reste s'en déduit.
 *
 * C'est ce qui permet de montrer une place avant de l'occuper : la case (3, 0)
 * d'un mur n'existe pas encore, mais on sait exactement où elle tomberait.
 */
export function caseEnMonde(
  cells: Cell[],
  centre: Cell[],
  corps: Point,
  angle: number,
  unit: number,
  c: Cell,
): Point {
  const lx = (c.x - cells[0].x + centre[0].x) * unit;
  const ly = (c.y - cells[0].y + centre[0].y) * unit;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: corps.x + lx * cos - ly * sin, y: corps.y + lx * sin + ly * cos };
}
