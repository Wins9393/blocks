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
