/**
 * Petite forge géométrique : de quoi bâtir les blocs et les objets de la
 * garde-robe en volume, sans bibliothèque.
 *
 * La règle du jeu est la fidélité : chaque objet 3D reprend les cotes exactes
 * de son dessin 2D (`faces.ts`), en unités de `U`. On travaille donc dans le
 * repère du canvas — x vers la droite, **y vers le bas** — et z vers le
 * spectateur. Une pile de transformations reproduit les `save`/`translate` du
 * contexte 2D, pour que les deux codes se lisent pareil.
 */

export interface Maille {
  pos: Float32Array;
  nor: Float32Array;
  col: Float32Array;
  /** 0 mat · 1 métal · 2 verre · 3 lumière · 4 gemme */
  mat: Float32Array;
  /**
   * Position dans le repère du **cube**, pas du bloc. C'est ce qui fait tenir
   * le grain à sa case : calé sur le bloc, il glisserait d'un cran chaque fois
   * qu'une brique soudée déplace le centre de masse.
   */
  local: Float32Array;
  /** Deux nombres par sommet : le grain, et la graine figée à la naissance. */
  grain: Float32Array;
  nb: number;
}

export type Pt = [number, number];
export type Vec3 = [number, number, number];

export const MAT_MAT = 0;
export const MAT_METAL = 1;
export const MAT_VERRE = 2;
export const MAT_LUMIERE = 3;
export const MAT_GEMME = 4;

const IDENTITE = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function produit(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = s;
    }
  }
  return out;
}

function norme(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

export function croise(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

// --- échantillonnage des courbes du dessin 2D ------------------------------

/** Une courbe quadratique, comme `quadraticCurveTo`, en points. */
export function quadratique(p0: Pt, c: Pt, p1: Pt, n = 12): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([
      u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0],
      u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1],
    ]);
  }
  return out;
}

/** Une courbe cubique, comme `bezierCurveTo`. */
export function cubique(p0: Pt, c1: Pt, c2: Pt, p1: Pt, n = 16): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0],
      u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1],
    ]);
  }
  return out;
}

/** Un arc d'ellipse, comme `ellipse`. Angles à la mode canvas. */
export function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 24): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}

/** Un rectangle aux coins arrondis, en polygone. */
export function rectArrondi(x: number, y: number, w: number, h: number, r: number, n = 6): Pt[] {
  const k = Math.min(r, w / 2, h / 2);
  const out: Pt[] = [];
  const coin = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + (Math.PI / 2) * (i / n);
      out.push([cx + Math.cos(a) * k, cy + Math.sin(a) * k]);
    }
  };
  coin(x + w - k, y + h - k, 0);
  coin(x + k, y + h - k, Math.PI / 2);
  coin(x + k, y + k, Math.PI);
  coin(x + w - k, y + k, -Math.PI / 2);
  return out;
}

/** L'étoile à cinq branches du jeu, mêmes proportions. */
export function etoile(cx: number, cy: number, r: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.44;
    out.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
  }
  return out;
}

/** Le cœur du jeu, tracé en deux cubiques. */
export function coeurPts(cx: number, cy: number, r: number): Pt[] {
  const bas: Pt = [cx, cy + r * 0.95];
  return [
    bas,
    ...cubique(bas, [cx - r * 1.6, cy - r * 0.25], [cx - r * 0.55, cy - r * 1.25], [cx, cy - r * 0.3]),
    ...cubique([cx, cy - r * 0.3], [cx + r * 0.55, cy - r * 1.25], [cx + r * 1.6, cy - r * 0.25], bas),
  ];
}

// --- triangulation ---------------------------------------------------------

function aire(p: Pt[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const j = (i + 1) % p.length;
    s += p[i][0] * p[j][1] - p[j][0] * p[i][1];
  }
  return s / 2;
}

function dansTriangle(p: Pt, a: Pt, b: Pt, c: Pt): boolean {
  const d = (u: Pt, v: Pt, w: Pt) => (u[0] - w[0]) * (v[1] - w[1]) - (v[0] - w[0]) * (u[1] - w[1]);
  const d1 = d(p, a, b), d2 = d(p, b, c), d3 = d(p, c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/**
 * Découpe d'oreilles : n'importe quel polygone simple devient des triangles.
 *
 * C'est ce qui permet d'extruder *le tracé du dessin 2D lui-même* — étoile,
 * cœur, plume, oreille de chat — au lieu d'en approcher la forme avec des
 * primitives. La fidélité vient de là.
 */
export function triangule(points: Pt[]): number[] {
  const n = points.length;
  if (n < 3) return [];
  const index = [...Array(n).keys()];
  if (aire(points) < 0) index.reverse();
  const out: number[] = [];
  let garde = 0;

  while (index.length > 3 && garde++ < n * n) {
    let coupe = false;
    for (let i = 0; i < index.length; i++) {
      const ia = index[(i + index.length - 1) % index.length];
      const ib = index[i];
      const ic = index[(i + 1) % index.length];
      const a = points[ia], b = points[ib], c = points[ic];
      // Une oreille est convexe et ne contient aucun autre sommet.
      if ((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]) <= 0) continue;
      let libre = true;
      for (const k of index) {
        if (k === ia || k === ib || k === ic) continue;
        if (dansTriangle(points[k], a, b, c)) { libre = false; break; }
      }
      if (!libre) continue;
      out.push(ia, ib, ic);
      index.splice(i, 1);
      coupe = true;
      break;
    }
    // Polygone dégénéré : on ferme en éventail plutôt que de boucler sans fin.
    if (!coupe) break;
  }
  if (index.length === 3) out.push(index[0], index[1], index[2]);
  else for (let i = 1; i + 1 < index.length; i++) out.push(index[0], index[i], index[i + 1]);
  return out;
}

/**
 * Retire les points répétés d'un contour, boucle comprise. Un tracé 2D finit
 * souvent sur son point de départ (le cœur, par exemple) : l'arête de longueur
 * nulle qui en résulte donne une normale nulle et un triangle dégénéré.
 */
export function nettoie(points: Pt[], eps = 1e-4): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const d = out[out.length - 1];
    if (!d || Math.abs(d[0] - p[0]) > eps || Math.abs(d[1] - p[1]) > eps) out.push(p);
  }
  while (out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.abs(a[0] - b[0]) > eps || Math.abs(a[1] - b[1]) > eps) break;
    out.pop();
  }
  return out;
}

// --- la forge --------------------------------------------------------------

export class Forge {
  private P: number[] = [];
  private N: number[] = [];
  private C: number[] = [];
  private M: number[] = [];
  private pile: Float32Array[] = [IDENTITE()];
  private couleur: Vec3 = [1, 1, 1];
  private matiere = MAT_MAT;

  // --- pile de transformations (comme le contexte 2D) ---

  get haut(): Float32Array {
    return this.pile[this.pile.length - 1];
  }

  save() {
    this.pile.push(new Float32Array(this.haut));
    return this;
  }

  restore() {
    if (this.pile.length > 1) this.pile.pop();
    return this;
  }

  private applique(m: Float32Array) {
    this.pile[this.pile.length - 1] = produit(this.haut, m);
    return this;
  }

  translate(x: number, y: number, z = 0) {
    return this.applique(new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]));
  }

  rotateX(a: number) {
    const c = Math.cos(a), s = Math.sin(a);
    return this.applique(new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]));
  }

  rotateY(a: number) {
    const c = Math.cos(a), s = Math.sin(a);
    return this.applique(new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]));
  }

  rotateZ(a: number) {
    const c = Math.cos(a), s = Math.sin(a);
    return this.applique(new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
  }

  /** Mise à l'échelle uniforme : les normales restent justes sans correction. */
  scale(k: number) {
    return this.applique(new Float32Array([k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, 0, 0, 0, 1]));
  }

  /** La matière et la couleur courantes, comme `fillStyle`. */
  peint(couleur: Vec3, matiere = MAT_MAT) {
    this.couleur = couleur;
    this.matiere = matiere;
    return this;
  }

  // --- émission ---

  private pousse(p: Vec3, n: Vec3) {
    const m = this.haut;
    this.P.push(
      m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
      m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
      m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
    );
    this.N.push(
      m[0] * n[0] + m[4] * n[1] + m[8] * n[2],
      m[1] * n[0] + m[5] * n[1] + m[9] * n[2],
      m[2] * n[0] + m[6] * n[1] + m[10] * n[2],
    );
    this.C.push(this.couleur[0], this.couleur[1], this.couleur[2]);
    this.M.push(this.matiere);
  }

  tri(a: Vec3, b: Vec3, c: Vec3, na: Vec3, nb: Vec3, nc: Vec3) {
    this.pousse(a, na);
    this.pousse(b, nb);
    this.pousse(c, nc);
  }

  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, na: Vec3, nb: Vec3, nc: Vec3, nd: Vec3) {
    this.tri(a, b, c, na, nb, nc);
    this.tri(a, c, d, na, nc, nd);
  }

  // --- primitives ---

  /**
   * Le polygone du dessin 2D, épaissi en z. Les faces avant et arrière sont
   * triangulées, les flancs suivent les arêtes.
   */
  extrude(bruts: Pt[], z0: number, z1: number) {
    const points = nettoie(bruts);
    if (points.length < 3) return this;
    const tri = triangule(points);
    for (let i = 0; i < tri.length; i += 3) {
      const [a, b, c] = [points[tri[i]], points[tri[i + 1]], points[tri[i + 2]]];
      this.tri([a[0], a[1], z1], [b[0], b[1], z1], [c[0], c[1], z1], [0, 0, 1], [0, 0, 1], [0, 0, 1]);
      this.tri([a[0], a[1], z0], [c[0], c[1], z0], [b[0], b[1], z0], [0, 0, -1], [0, 0, -1], [0, 0, -1]);
    }
    for (let i = 0; i < points.length; i++) {
      const p = points[i], q = points[(i + 1) % points.length];
      const n = norme([q[1] - p[1], -(q[0] - p[0]), 0]);
      this.quad([p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], z1], [p[0], p[1], z1], n, n, n, n);
    }
    return this;
  }

  /**
   * Un trait épais du dessin 2D, épaissi puis extrudé.
   *
   * Fermé, il devient un **anneau** — deux contours reliés par leurs faces et
   * leurs parois. Extruder chaque contour de son côté, comme on le faisait,
   * donnait deux plaques pleines : une monture de lunettes sans trou, et le
   * regard bouché.
   */
  ruban(bruts: Pt[], largeur: number, z0: number, z1: number, ferme = false) {
    const points = nettoie(bruts);
    if (points.length < 2) return this;
    const d = largeur / 2;
    const gauche: Pt[] = [], droite: Pt[] = [];
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const p = points[i];
      const a = ferme ? points[(i - 1 + n) % n] : points[Math.max(0, i - 1)];
      const b = ferme ? points[(i + 1) % n] : points[Math.min(n - 1, i + 1)];
      const t = norme([b[0] - a[0], b[1] - a[1], 0]);
      gauche.push([p[0] - t[1] * d, p[1] + t[0] * d]);
      droite.push([p[0] + t[1] * d, p[1] - t[0] * d]);
    }
    if (!ferme) return this.extrude([...gauche, ...droite.reverse()], z0, z1);

    const avant: Vec3 = [0, 0, 1];
    const arriere: Vec3 = [0, 0, -1];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ge: Pt = gauche[i], gf: Pt = gauche[j];
      const de: Pt = droite[i], df: Pt = droite[j];
      const A: Vec3 = [ge[0], ge[1], z1], B: Vec3 = [gf[0], gf[1], z1];
      const C: Vec3 = [df[0], df[1], z1], D: Vec3 = [de[0], de[1], z1];
      const A0: Vec3 = [ge[0], ge[1], z0], B0: Vec3 = [gf[0], gf[1], z0];
      const C0: Vec3 = [df[0], df[1], z0], D0: Vec3 = [de[0], de[1], z0];
      this.quad(A, B, C, D, avant, avant, avant, avant);
      this.quad(D0, C0, B0, A0, arriere, arriere, arriere, arriere);
      const ne = norme([gf[1] - ge[1], -(gf[0] - ge[0]), 0]);
      this.quad(A0, B0, B, A, ne, ne, ne, ne);
      const ni = norme([-(df[1] - de[1]), df[0] - de[0], 0]);
      this.quad(D0, D, C, C0, ni, ni, ni, ni);
    }
    return this;
  }

  /**
   * Boîte aux arêtes arrondies : la somme de Minkowski d'une boîte et d'une
   * sphère. C'est la brique des blocs — son ombre au sol est exactement le
   * rectangle arrondi que le moteur 2D dessine.
   */
  boite(demi: Vec3, r: number, seg = 4) {
    const [x, y, z] = [Math.max(0, demi[0] - r), Math.max(0, demi[1] - r), Math.max(0, demi[2] - r)];
    const signes = [-1, 1];

    // Faces planes
    const face = (axe: number, s: number) => {
      const n: Vec3 = [0, 0, 0];
      n[axe] = s;
      const u = (axe + 1) % 3, v = (axe + 2) % 3;
      const du = [x, y, z][u], dv = [x, y, z][v];
      const coin = (su: number, sv: number): Vec3 => {
        const p: Vec3 = [0, 0, 0];
        p[axe] = s * demi[axe];
        p[u] = su * du;
        p[v] = sv * dv;
        return p;
      };
      this.quad(coin(-1, -1), coin(1, -1), coin(1, 1), coin(-1, 1), n, n, n, n);
    };
    for (let axe = 0; axe < 3; axe++) for (const s of signes) face(axe, s);

    // Arêtes : un quart de cylindre le long de chaque arête.
    const arete = (axe: number, su: number, sv: number) => {
      const u = (axe + 1) % 3, v = (axe + 2) % 3;
      const du = [x, y, z][u] * su, dv = [x, y, z][v] * sv;
      const l = [x, y, z][axe];
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * (Math.PI / 2), a1 = ((i + 1) / seg) * (Math.PI / 2);
        const pt = (a: number, sl: number): { p: Vec3; n: Vec3 } => {
          const n: Vec3 = [0, 0, 0];
          n[u] = su * Math.cos(a);
          n[v] = sv * Math.sin(a);
          const p: Vec3 = [0, 0, 0];
          p[axe] = sl * l;
          p[u] = du + n[u] * r;
          p[v] = dv + n[v] * r;
          return { p, n };
        };
        const A = pt(a0, -1), B = pt(a1, -1), C = pt(a1, 1), D = pt(a0, 1);
        this.quad(A.p, B.p, C.p, D.p, A.n, B.n, C.n, D.n);
      }
    };
    for (let axe = 0; axe < 3; axe++) for (const su of signes) for (const sv of signes) arete(axe, su, sv);

    // Coins : un huitième de sphère.
    for (const sx of signes) for (const sy of signes) for (const sz of signes) {
      for (let i = 0; i < seg; i++) {
        for (let j = 0; j < seg; j++) {
          const p = (a: number, b: number) => {
            const th = (a / seg) * (Math.PI / 2), ph = (b / seg) * (Math.PI / 2);
            const n: Vec3 = [sx * Math.cos(th) * Math.sin(ph), sy * Math.sin(th) * Math.sin(ph), sz * Math.cos(ph)];
            return { p: [sx * x + n[0] * r, sy * y + n[1] * r, sz * z + n[2] * r] as Vec3, n };
          };
          const A = p(i, j), B = p(i + 1, j), C = p(i + 1, j + 1), D = p(i, j + 1);
          this.quad(A.p, B.p, C.p, D.p, A.n, B.n, C.n, D.n);
        }
      }
    }
    return this;
  }

  /** Ellipsoïde. `part` coupe au pôle : 0.5 donne un dôme. */
  sphere(r: Vec3, part = 1, seg = 20, anneaux = 14) {
    const dir = (i: number, j: number): Vec3 => {
      const th = (i / seg) * Math.PI * 2;
      const ph = (j / anneaux) * Math.PI * part;
      return [Math.sin(ph) * Math.cos(th), -Math.cos(ph), Math.sin(ph) * Math.sin(th)];
    };
    const pos = (d: Vec3): Vec3 => [d[0] * r[0], d[1] * r[1], d[2] * r[2]];
    // La normale d'un ellipsoïde n'est pas sa direction : elle se divise par
    // le carré des rayons, sinon la lumière glisse de travers sur les dômes.
    const nor = (d: Vec3): Vec3 => norme([d[0] / (r[0] * r[0]), d[1] / (r[1] * r[1]), d[2] / (r[2] * r[2])]);
    for (let i = 0; i < seg; i++) {
      for (let j = 0; j < anneaux; j++) {
        const a = dir(i, j), b = dir(i + 1, j), c = dir(i + 1, j + 1), d = dir(i, j + 1);
        this.quad(pos(a), pos(b), pos(c), pos(d), nor(a), nor(b), nor(c), nor(d));
      }
    }
    return this;
  }

  /** Tore d'axe y (couché à plat), pour les anneaux et les bourrelets. */
  tore(R: number, r: number, arcTotal = Math.PI * 2, seg = 40, anneaux = 12, aplati = 1) {
    const pt = (i: number, j: number) => {
      const t = (i / seg) * arcTotal;
      const p = (j / anneaux) * Math.PI * 2;
      const ct = Math.cos(t), st = Math.sin(t);
      const n: Vec3 = norme([ct * Math.cos(p), Math.sin(p), (st * Math.cos(p)) / aplati]);
      return {
        p: [(R + r * Math.cos(p)) * ct, r * Math.sin(p), (R + r * Math.cos(p)) * st * aplati] as Vec3,
        n,
      };
    };
    for (let i = 0; i < seg; i++) {
      for (let j = 0; j < anneaux; j++) {
        const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
        this.quad(a.p, b.p, c.p, d.p, a.n, b.n, c.n, d.n);
      }
    }
    return this;
  }

  /**
   * Solide de révolution autour de l'axe y : le profil donne (rayon, y).
   * Cônes, cylindres, calottes et bourrelets en sortent tous.
   */
  revolution(profil: Pt[], seg = 28, ferme = false, aplati = 1) {
    const n = profil.length;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      for (let j = 0; j + 1 < n; j++) {
        const [r0, y0] = profil[j];
        const [r1, y1] = profil[j + 1];
        // Normale du profil, tournée avec lui — et retournée vers l'extérieur
        // si le profil monte : sans ça, un cylindre décrit de bas en haut
        // s'éclaire par l'intérieur et ressort tout noir.
        const dr = r1 - r0, dy = y1 - y0;
        let pn = norme([dy, -dr, 0]);
        if (pn[0] < 0) pn = [-pn[0], -pn[1], -pn[2]];
        const pt = (a: number, r: number, y: number): { p: Vec3; n: Vec3 } => ({
          p: [Math.cos(a) * r, y, Math.sin(a) * r * aplati],
          // Aplatir en z incline les normales : sans la division, la lumière
          // glisse de travers sur les dômes écrasés.
          n: norme([Math.cos(a) * pn[0], pn[1], (Math.sin(a) * pn[0]) / aplati]),
        });
        const A = pt(a0, r0, y0), B = pt(a1, r0, y0), C = pt(a1, r1, y1), D = pt(a0, r1, y1);
        this.quad(A.p, B.p, C.p, D.p, A.n, B.n, C.n, D.n);
      }
      if (ferme) {
        const [rf, yf] = profil[n - 1];
        const [rd, yd] = profil[0];
        const c1: Vec3 = [0, yf, 0], c2: Vec3 = [0, yd, 0];
        const nh: Vec3 = [0, yf < yd ? -1 : 1, 0];
        this.tri(c1, [Math.cos(a0) * rf, yf, Math.sin(a0) * rf * aplati], [Math.cos(a1) * rf, yf, Math.sin(a1) * rf * aplati], nh, nh, nh);
        const nb: Vec3 = [0, yf < yd ? 1 : -1, 0];
        this.tri(c2, [Math.cos(a1) * rd, yd, Math.sin(a1) * rd * aplati], [Math.cos(a0) * rd, yd, Math.sin(a0) * rd * aplati], nb, nb, nb);
      }
    }
    return this;
  }

  /** Cylindre entre deux points de l'espace : branches de bois, sangles. */
  tube(a: Vec3, b: Vec3, r0: number, r1 = r0, seg = 12) {
    const axe = norme([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    let up: Vec3 = Math.abs(axe[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u = norme(croise(axe, up));
    const v = norme(croise(axe, u));
    const pt = (i: number, base: Vec3, r: number) => {
      const t = (i / seg) * Math.PI * 2;
      const n = norme([u[0] * Math.cos(t) + v[0] * Math.sin(t), u[1] * Math.cos(t) + v[1] * Math.sin(t), u[2] * Math.cos(t) + v[2] * Math.sin(t)]);
      return { p: [base[0] + n[0] * r, base[1] + n[1] * r, base[2] + n[2] * r] as Vec3, n };
    };
    for (let i = 0; i < seg; i++) {
      const A = pt(i, a, r0), B = pt(i + 1, a, r0), C = pt(i + 1, b, r1), D = pt(i, b, r1);
      this.quad(A.p, B.p, C.p, D.p, A.n, B.n, C.n, D.n);
      const nb: Vec3 = [-axe[0], -axe[1], -axe[2]];
      this.tri(a, B.p, A.p, nb, nb, nb);
      this.tri(b, D.p, C.p, axe, axe, axe);
    }
    return this;
  }

  get vide(): boolean {
    return this.P.length === 0;
  }

  /** Sommets déjà émis : de quoi savoir quelle tranche appartient à quel cube. */
  get nbSommets(): number {
    return this.P.length / 3;
  }

  /**
   * Le repère local vaut la position, et le grain est nul : c'est ce qu'il faut
   * pour tout ce qui n'en a pas — les pièces de la garde-robe. `mailleBloc`
   * les réécrit cube par cube.
   */
  fini(): Maille {
    const nb = this.P.length / 3;
    return {
      pos: new Float32Array(this.P),
      nor: new Float32Array(this.N),
      col: new Float32Array(this.C),
      mat: new Float32Array(this.M),
      local: new Float32Array(this.P),
      grain: new Float32Array(nb * 2),
      nb,
    };
  }
}

/** Couleur du jeu (« #RRGGBB ») vers un triplet 0..1. */
export function teinte(hex: string): Vec3 {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}
