/**
 * La caméra du chantier : ce qui décolle le monde de l'écran.
 *
 * Au mode nombre, le monde *est* l'écran et la caméra reste l'identité — c'est
 * ce qui garde intactes toutes les mesures payées cher sur la perspective. Sur
 * un chantier, le monde est plus grand que ce qu'on en voit, et on s'y déplace.
 */

import { UNIT } from './constants';

/**
 * Le chantier, en cases. **Borné**, et sur une taille fixe qui ne dépend pas de
 * l'écran : sans bord, un cube poussé vers la droite disparaît et rien ne dit
 * qu'il existe encore — un enfant de quatre ans ne part pas à sa recherche.
 *
 * 40 x 24 fait 960 cases : un plafond de 400 cubes en occupe 42 %, ce qui
 * laisse de l'air pour manœuvrer.
 */
export const MONDE_W = 40;
export const MONDE_H = 24;

/** Bande de sol visible sous la ligne où les blocs se posent. */
export const BANDE_SOL = 52;

/** Où les blocs se posent, en pixels monde. */
export const SOL_Y = MONDE_H * UNIT;

/** Le monde entier, bande de sol comprise : c'est ce que la caméra borne. */
export const MONDE = { w: MONDE_W * UNIT, h: SOL_Y + BANDE_SOL };

/** Au-delà, un cube dépasse la taille du doigt et l'on ne vise plus rien. */
export const ZOOM_MAX = 1.6;

export interface Camera {
  /** Point du monde visé, en pixels monde. */
  x: number;
  y: number;
  /** Échelle : 1 = un pixel monde par pixel d'écran. */
  k: number;
}

export interface Vue {
  w: number;
  h: number;
  /** Hauteur que la barre du bas couvre : le terrain utile s'arrête là. */
  inset: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Le centre du terrain utile — pas celui du canvas : la barre mange le bas. */
export function centreVue(vue: Vue): Point {
  return { x: vue.w / 2, y: (vue.h - vue.inset) / 2 };
}

export function toScreen(cam: Camera, vue: Vue, p: Point): Point {
  const c = centreVue(vue);
  return { x: (p.x - cam.x) * cam.k + c.x, y: (p.y - cam.y) * cam.k + c.y };
}

export function toWorld(cam: Camera, vue: Vue, p: Point): Point {
  const c = centreVue(vue);
  return { x: (p.x - c.x) / cam.k + cam.x, y: (p.y - c.y) / cam.k + cam.y };
}

/** Zoom au-dessous duquel le monde entier tiendrait déjà dans la vue. */
export function zoomMin(vue: Vue, monde = MONDE): number {
  const utile = Math.max(1, vue.h - vue.inset);
  return Math.min(vue.w / monde.w, utile / monde.h);
}

/**
 * Ramène la caméra dans les bornes : on ne sort jamais du chantier, et on ne
 * dézoome pas au-delà du monde entier. Quand une dimension tient déjà tout
 * entière dans la vue, elle se centre plutôt que de coulisser.
 */
export function clampCamera(cam: Camera, vue: Vue, monde = MONDE): Camera {
  const k = Math.min(ZOOM_MAX, Math.max(zoomMin(vue, monde), cam.k));
  const demiW = vue.w / 2 / k;
  const demiH = Math.max(1, vue.h - vue.inset) / 2 / k;
  const borne = (v: number, demi: number, taille: number) =>
    demi * 2 >= taille ? taille / 2 : Math.min(taille - demi, Math.max(demi, v));
  return { k, x: borne(cam.x, demiW, monde.w), y: borne(cam.y, demiH, monde.h) };
}

/** La caméra de départ : le sol au fond de la vue, le chantier au milieu. */
export function cameraDepart(vue: Vue, monde = MONDE): Camera {
  return clampCamera({ x: monde.w / 2, y: monde.h, k: 1 }, vue, monde);
}

/** Le facteur d'échelle à appliquer au canvas 2D et à la profondeur. */
export function transforme(cam: Camera, vue: Vue) {
  const c = centreVue(vue);
  return { tx: c.x - cam.x * cam.k, ty: c.y - cam.y * cam.k, k: cam.k };
}

/**
 * La caméra du mode nombre : viser le centre de la vue à l'échelle 1 rend
 * `toScreen` et `toWorld` rigoureusement égaux à l'identité. Les deux modes
 * passent donc par le même chemin, et le mode nombre n'y perd pas un pixel.
 */
export function cameraIdentite(vue: Vue): Camera {
  const c = centreVue(vue);
  return { x: c.x, y: c.y, k: 1 };
}

/**
 * Le zoom de repos : celui d'un chantier qu'on vient d'ouvrir, et celui que la
 * commande affiche à 50 %. Le milieu de l'échelle est ce réglage-là et non la
 * moyenne des deux bornes, parce que le nombre doit dire à l'enfant où il est
 * *par rapport à la vue normale* : à moitié, il retrouve exactement ce qu'il
 * avait en arrivant.
 */
export const ZOOM_REPOS = 1;

/** Un appui sur + ou − , en points de pourcentage : dix crans de bout en bout. */
export const ZOOM_PAS = 10;

/**
 * Les trois repères de l'échelle affichée : 0 % le monde entier dans la vue,
 * 50 % le zoom de repos, 100 % le plus gros. `zoomMin` dépendant de l'écran,
 * les deux moitiés n'ont pas la même pente — c'est le prix pour que 50 % veuille
 * dire la même chose sur un téléphone et sur un grand écran.
 *
 * Sur un écran assez grand pour tenir le monde entier au repos, il n'y a plus
 * de moitié basse : le repère glisse au milieu et l'échelle redevient une seule
 * pente, sans marche au passage des 50 %.
 */
function bornes(vue: Vue, monde: typeof MONDE) {
  const min = Math.min(zoomMin(vue, monde), ZOOM_MAX);
  const repos = ZOOM_REPOS > min && ZOOM_REPOS < ZOOM_MAX ? ZOOM_REPOS : (min + ZOOM_MAX) / 2;
  return { min, repos };
}

/** L'échelle telle qu'on la montre : un entier de 0 à 100. */
export function zoomPourcent(k: number, vue: Vue, monde = MONDE): number {
  const { min, repos } = bornes(vue, monde);
  // Un écran si grand que le monde y tient déjà au zoom maximal : il n'y a plus
  // rien à régler, et le nombre n'aurait plus de pente où vivre.
  if (repos - min < 1e-6) return 0;
  const p =
    k <= repos
      ? (50 * (k - min)) / (repos - min)
      : 50 + (50 * (k - repos)) / (ZOOM_MAX - repos);
  return Math.round(Math.min(100, Math.max(0, p)));
}

/** L'inverse : l'échelle que demande un pourcentage. */
export function zoomPourK(pourcent: number, vue: Vue, monde = MONDE): number {
  const { min, repos } = bornes(vue, monde);
  const p = Math.min(100, Math.max(0, pourcent));
  return p <= 50 ? min + ((repos - min) * p) / 50 : repos + ((ZOOM_MAX - repos) * (p - 50)) / 50;
}

/**
 * Le zoom d'un cran de plus, ou de moins. Le pas se compte en pourcentage et
 * retombe sur un multiple rond : un zoom arrivé au pincement à 43 % remonte à
 * 50, pas à 53, sans quoi les paliers resteraient décalés pour toujours et le
 * nombre affiché ne serait jamais celui qu'on vise.
 */
export function zoomVoisin(k: number, vue: Vue, sens: 1 | -1, monde = MONDE): number {
  const p = zoomPourcent(k, vue, monde) / ZOOM_PAS;
  const cran = sens > 0 ? Math.floor(p) + 1 : Math.ceil(p) - 1;
  return zoomPourK(cran * ZOOM_PAS, vue, monde);
}
