/**
 * Géométrie canonique d'un nombre.
 *
 * Règle :
 *  - 1                      -> un cube.
 *  - n a deux diviseurs >=2 -> le rectangle le plus carré possible (w <= h).
 *  - n est premier <= 3         -> une colonne 1 x n.
 *  - n est premier >= 5         -> le rectangle de (n - 1) surmonte d'un cube.
 *
 * Conséquence : les nombres premiers sont les seuls à porter une bosse.
 * L'enfant voit la primalité avant qu'on la lui nomme.
 */

export interface Cell {
  x: number;
  y: number;
}

export interface Shape {
  /** Largeur et hauteur de la boîte englobante, en cubes. */
  w: number;
  h: number;
  /** Cellules, coordonnées entières a partir de (0, 0). */
  cells: Cell[];
  /** Index de la cellule qui porte les yeux (la plus haute, la plus centrée). */
  faceIndex: number;
}

/** Plus grand diviseur <= sqrt(n) et >= 2, ou null si n est premier ou vaut 1. */
export function properFactor(n: number): number | null {
  let best: number | null = null;
  for (let a = 2; a * a <= n; a++) {
    if (n % a === 0) best = a;
  }
  return best;
}

export function isPrime(n: number): boolean {
  return n >= 2 && properFactor(n) === null;
}

function rect(w: number, h: number): Cell[] {
  const cells: Cell[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) cells.push({ x, y });
  }
  return cells;
}

function pickFace(cells: Cell[], w: number): number {
  const minY = Math.min(...cells.map((c) => c.y));
  const top = cells.filter((c) => c.y === minY);
  const centre = (w - 1) / 2;
  let best = top[0];
  for (const c of top) {
    if (Math.abs(c.x - centre) < Math.abs(best.x - centre)) best = c;
  }
  return cells.indexOf(best);
}

/** Signature d'un jeu de cases : de quoi servir de clé de cache. */
export function signature(cells: Cell[]): string {
  return cells.map((c) => `${c.x},${c.y}`).join(';');
}

/**
 * Forme quelconque, à partir de ses seules cases.
 *
 * Un assemblage de construction n'a pas de valeur qui le désigne : il *est*
 * ses cases, et rien ne dit qu'elles forment un rectangle. L'ordre d'entrée
 * est conservé tel quel — c'est lui qui relie chaque case à sa matière.
 */
export function shapeOf(cells: Cell[]): Shape {
  let minX = Infinity;
  let minY = Infinity;
  for (const c of cells) {
    if (c.x < minX) minX = c.x;
    if (c.y < minY) minY = c.y;
  }
  const moved = cells.map((c) => ({ x: c.x - minX, y: c.y - minY }));
  let w = 0;
  let h = 0;
  for (const c of moved) {
    if (c.x + 1 > w) w = c.x + 1;
    if (c.y + 1 > h) h = c.y + 1;
  }
  return { w, h, cells: moved, faceIndex: pickFace(moved, w) };
}

const VOISINS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Groupes de cases qui se tiennent **par une arête**. Le coin ne relie pas :
 * un escalier tenu par les angles n'a l'air solide dans aucun monde, et
 * surtout, avec deux définitions de connexité en lice, couper une diagonale
 * rendrait un résultat que personne ne saurait prédire.
 *
 * Rend des indices plutôt que des cases, pour que la matière de chaque cube
 * suive la sienne.
 */
export function connectedParts(cells: Cell[]): number[][] {
  const at = new Map<string, number>();
  cells.forEach((c, i) => at.set(`${c.x},${c.y}`, i));

  const vus = new Array<boolean>(cells.length).fill(false);
  const parts: number[][] = [];
  for (let i = 0; i < cells.length; i++) {
    if (vus[i]) continue;
    const part: number[] = [];
    const pile = [i];
    vus[i] = true;
    while (pile.length) {
      const j = pile.pop() as number;
      part.push(j);
      const { x, y } = cells[j];
      for (const [dx, dy] of VOISINS) {
        const k = at.get(`${x + dx},${y + dy}`);
        if (k !== undefined && !vus[k]) {
          vus[k] = true;
          pile.push(k);
        }
      }
    }
    parts.push(part.sort((a, b) => a - b));
  }
  return parts;
}

const cache = new Map<number, Shape>();

export function shapeFor(value: number): Shape {
  const n = Math.max(1, Math.floor(value));
  const hit = cache.get(n);
  if (hit) return hit;

  let cells: Cell[];
  let w: number;
  let h: number;

  const f = properFactor(n);
  if (n === 1) {
    w = 1;
    h = 1;
    cells = rect(1, 1);
  } else if (f !== null) {
    w = f;
    h = n / f;
    cells = rect(w, h);
  } else if (n <= 3) {
    w = 1;
    h = n;
    cells = rect(1, n);
  } else {
    // Premier >= 5 : le rectangle de n-1 (toujours pair, donc composite) + une bosse.
    const base = shapeFor(n - 1);
    w = base.w;
    h = base.h + 1;
    cells = base.cells.map((c) => ({ x: c.x, y: c.y + 1 }));
    cells.unshift({ x: Math.floor((w - 1) / 2), y: 0 });
  }

  const shape: Shape = { w, h, cells, faceIndex: pickFace(cells, w) };
  cache.set(n, shape);
  return shape;
}

/** Décalage de chaque case par rapport au centre de masse, en cubes. */
export function centeredOf(shape: Shape): Cell[] {
  const offsets = shape.cells.map((c) => cellOffset(shape, c));
  const cx = offsets.reduce((s, o) => s + o.x, 0) / offsets.length;
  const cy = offsets.reduce((s, o) => s + o.y, 0) / offsets.length;
  return offsets.map((o) => ({ x: o.x - cx, y: o.y - cy }));
}

/** Décalage d'une cellule par rapport au centre de la boîte englobante, en cubes. */
export function cellOffset(shape: Shape, cell: Cell): Cell {
  return {
    x: cell.x - (shape.w - 1) / 2,
    y: cell.y - (shape.h - 1) / 2,
  };
}

const centeredCache = new Map<number, Cell[]>();

/**
 * Cellules exprimées en cubes, relativement au centre de masse : c'est le
 * repère que Matter utilise pour un corps composé, donc celui du rendu.
 */
export function centeredCells(value: number): Cell[] {
  const n = Math.max(1, Math.floor(value));
  const hit = centeredCache.get(n);
  if (hit) return hit;

  const centered = centeredOf(shapeFor(n));
  centeredCache.set(n, centered);
  return centered;
}

export interface Rect {
  /** Centre du rectangle, en cubes, relatif au centre de la boîte englobante. */
  x: number;
  y: number;
  /** Dimensions, en cubes. */
  w: number;
  h: number;
}

const rectCache = new Map<number, Rect[]>();

/**
 * Pave la forme avec le moins de rectangles possible (glouton : on étend vers
 * la droite, puis vers le bas tant que toute la largeur suit).
 *
 * C'est la forme de collision, pas la forme dessinée. Un cube par cellule
 * paraît naturel mais produit des contacts redondants le long de chaque arête
 * partagée : le solveur sur-corrige, le bloc se soulève de quelques pixels à
 * chaque pas, et une tour finit par osciller puis basculer toute seule. Avec
 * ce pavage, toutes les formes canoniques tiennent en un ou deux rectangles.
 */
function tile(shape: Shape, colonneDabord: boolean): Rect[] {
  const key = (x: number, y: number) => `${x},${y}`;
  const filled = new Set(shape.cells.map((c) => key(c.x, c.y)));
  const used = new Set<string>();
  const free = (x: number, y: number) => filled.has(key(x, y)) && !used.has(key(x, y));

  // On raisonne dans un repère (a, b) : a est l'axe qu'on étend en premier.
  const spanA = colonneDabord ? shape.h : shape.w;
  const spanB = colonneDabord ? shape.w : shape.h;
  const at = (a: number, b: number) => (colonneDabord ? free(b, a) : free(a, b));

  const rects: Rect[] = [];
  for (let b = 0; b < spanB; b++) {
    for (let a = 0; a < spanA; a++) {
      if (!at(a, b)) continue;

      let da = 1;
      while (a + da < spanA && at(a + da, b)) da++;

      let db = 1;
      while (b + db < spanB) {
        let full = true;
        for (let i = 0; i < da && full; i++) full = at(a + i, b + db);
        if (!full) break;
        db++;
      }

      for (let j = 0; j < db; j++) {
        for (let i = 0; i < da; i++) {
          used.add(colonneDabord ? key(b + j, a + i) : key(a + i, b + j));
        }
      }

      const x0 = colonneDabord ? b : a;
      const y0 = colonneDabord ? a : b;
      const w = colonneDabord ? db : da;
      const h = colonneDabord ? da : db;
      rects.push({
        x: x0 + (w - 1) / 2 - (shape.w - 1) / 2,
        y: y0 + (h - 1) / 2 - (shape.h - 1) / 2,
        w,
        h,
      });
    }
  }
  return rects;
}

export function rectanglesOf(shape: Shape): Rect[] {
  // Les deux sens ne donnent pas le même découpage : en ligne d'abord, une base
  // large surmontée d'une bosse part en tranches verticales. On garde le plus
  // économe — moins il y a de pièces, plus le contact avec le sol est propre.
  const lignes = tile(shape, false);
  const colonnes = tile(shape, true);
  return colonnes.length < lignes.length ? colonnes : lignes;
}

export function rectanglesFor(value: number): Rect[] {
  const n = Math.max(1, Math.floor(value));
  const hit = rectCache.get(n);
  if (hit) return hit;

  const rects = rectanglesOf(shapeFor(n));
  rectCache.set(n, rects);
  return rects;
}
