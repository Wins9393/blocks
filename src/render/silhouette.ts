import { UNIT } from '../core/constants';
import { centeredCells, shapeFor } from '../core/shape';

/** Rayon des arrondis de la silhouette, en pixels. */
export const CORNER = UNIT * 0.2;

export interface BlockArt {
  /**
   * Chemin « érodé » : les cellules rétrécies de CORNER, plus un pont partout
   * où deux cellules se touchent. Tracé avec une plume ronde de 2 x CORNER,
   * il redonne le contour du bloc entier — coins extérieurs arrondis, angles
   * rentrants adoucis — au lieu de n carrés indépendants.
   */
  path: Path2D;
  /** Rainures le long des arêtes partagées : on doit pouvoir compter les cubes. */
  seams: Array<[number, number, number, number]>;
  /**
   * Union des cellules à taille pleine, coins vifs. Sert de zone de découpe
   * pour les effets translucides, qu'on ne peut pas borner au contour arrondi
   * (celui-ci naît d'un trait, et un trait ne se découpe pas).
   */
  clip: Path2D;
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const cache = new Map<number, BlockArt>();

const key = (x: number, y: number) => `${x},${y}`;

function push(map: Map<number, number[]>, line: number, at: number) {
  const list = map.get(line);
  if (list) list.push(at);
  else map.set(line, [at]);
}

/** Découpe une liste d'entiers en plages consécutives [début, fin]. */
function runs(values: number[]): Array<[number, number]> {
  const sorted = [...values].sort((a, b) => a - b);
  const out: Array<[number, number]> = [];
  for (const v of sorted) {
    const last = out[out.length - 1];
    if (last && last[1] + 1 === v) last[1] = v;
    else out.push([v, v]);
  }
  return out;
}

export function blockArt(value: number): BlockArt {
  const hit = cache.get(value);
  if (hit) return hit;

  const shape = shapeFor(value);
  const cells = centeredCells(value);
  const occupied = new Set(shape.cells.map((c) => key(c.x, c.y)));
  const half = UNIT / 2;
  const r = CORNER;
  const inner = UNIT - 2 * r;

  const path = new Path2D();
  // Décalage entre la grille entière et le repère local (centre de masse).
  const offX = cells[0].x - shape.cells[0].x;
  const offY = cells[0].y - shape.cells[0].y;

  // Les arêtes partagées sont d'abord collectées par ligne de joint, puis
  // fusionnées : dessinées paire par paire, elles ressortent en pointillés.
  const vertical = new Map<number, number[]>();
  const horizontal = new Map<number, number[]>();

  for (let i = 0; i < cells.length; i++) {
    const px = cells[i].x * UNIT;
    const py = cells[i].y * UNIT;
    const g = shape.cells[i];
    path.rect(px - half + r, py - half + r, inner, inner);

    if (occupied.has(key(g.x + 1, g.y))) {
      path.rect(px + half - r, py - half + r, 2 * r, inner);
      push(vertical, g.x, g.y);
    }
    if (occupied.has(key(g.x, g.y + 1))) {
      path.rect(px - half + r, py + half - r, inner, 2 * r);
      push(horizontal, g.y, g.x);
    }

    // Coin commun à quatre cubes : les ponts ne s'y rejoignent pas et laissent
    // un trou carré. Tracé à pleine plume il se referme pile, mais toute plume
    // plus fine — le biseau — le rouvrirait au milieu du bloc.
    if (
      occupied.has(key(g.x + 1, g.y)) &&
      occupied.has(key(g.x, g.y + 1)) &&
      occupied.has(key(g.x + 1, g.y + 1))
    ) {
      path.rect(px + half - r, py + half - r, 2 * r, 2 * r);
    }
  }

  const trim = r * 0.55;
  const seams: BlockArt['seams'] = [];
  for (const [gx, ys] of vertical) {
    const x = (gx + 0.5 + offX) * UNIT;
    for (const [from, to] of runs(ys)) {
      seams.push([
        x,
        (from - 0.5 + offY) * UNIT + trim,
        x,
        (to + 0.5 + offY) * UNIT - trim,
      ]);
    }
  }
  for (const [gy, xs] of horizontal) {
    const y = (gy + 0.5 + offY) * UNIT;
    for (const [from, to] of runs(xs)) {
      seams.push([
        (from - 0.5 + offX) * UNIT + trim,
        y,
        (to + 0.5 + offX) * UNIT - trim,
        y,
      ]);
    }
  }

  const clip = new Path2D();
  for (const c of cells) {
    clip.rect(c.x * UNIT - half, c.y * UNIT - half, UNIT, UNIT);
  }

  const art: BlockArt = {
    path,
    seams,
    clip,
    top: Math.min(...cells.map((c) => c.y)) * UNIT - half,
    bottom: Math.max(...cells.map((c) => c.y)) * UNIT + half,
    left: Math.min(...cells.map((c) => c.x)) * UNIT - half,
    right: Math.max(...cells.map((c) => c.x)) * UNIT + half,
  };
  cache.set(value, art);
  return art;
}
