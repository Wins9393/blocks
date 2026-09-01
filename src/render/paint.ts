import { UNIT } from '../core/constants';
import { shade } from '../core/palette';
import type { ResolvedLook, Wardrobe } from '../core/wardrobe';
import { drawCharacter, drawHead } from './faces';
import { CORNER, blockArt } from './silhouette';
import type { BlockArt } from './silhouette';

/**
 * Peinture d'un bloc, sortie du moteur de rendu : la barre de blocs en a
 * besoin elle aussi. Un bouton doit montrer exactement le bloc qu'il pose,
 * personnage compris — deux dessins séparés auraient divergé au premier
 * changement de coiffure.
 */

/**
 * Direction du soleil, en repère MONDE et normalisée : elle pointe vers la
 * source. Tout l'ombrage en découle, et surtout : elle ne tourne pas avec les
 * blocs. C'est ce qui distingue un objet éclairé d'un autocollant.
 */
export const LIGHT = { x: -0.6, y: -0.8 };

/** Largeur du biseau qui court le long du contour, en pixels. */
export const BEVEL = 3.6;

/** Largeur de la plume qui trace la silhouette. */
export const PEN = 2 * CORNER;

export interface BlockPaints {
  body: CanvasGradient;
  rim: CanvasGradient;
  bevel: CanvasGradient;
}

/** La lumière du monde, exprimée dans le repère tourné du bloc. */
export function localLight(angle: number) {
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  return {
    x: LIGHT.x * cos - LIGHT.y * sin,
    y: LIGHT.x * sin + LIGHT.y * cos,
  };
}

/**
 * Corps, liseré et biseau. Ils dépendent de l'orientation, donc ils ne peuvent
 * pas être mis en cache par valeur : c'est le prix d'une lumière qui reste en
 * place quand le bloc bascule.
 */
export function blockPaints(
  ctx: CanvasRenderingContext2D,
  art: BlockArt,
  base: string,
  angle: number,
): BlockPaints {
  const w = art.right - art.left;
  const h = art.bottom - art.top;
  const mx = (art.left + art.right) / 2;
  const my = (art.top + art.bottom) / 2;
  const l = localLight(angle);

  const fx = mx + l.x * w * 0.46;
  const fy = my + l.y * h * 0.46;
  const body = ctx.createRadialGradient(fx, fy, 0, fx, fy, Math.hypot(w, h) * 0.96);
  body.addColorStop(0, shade(base, 0.36));
  body.addColorStop(0.3, shade(base, 0.15));
  body.addColorStop(0.62, base);
  body.addColorStop(1, shade(base, -0.3));

  const axe = (from: number, to: number): CanvasGradient =>
    ctx.createLinearGradient(
      mx + l.x * w * from,
      my + l.y * h * from,
      mx - l.x * w * to,
      my - l.y * h * to,
    );

  // Le liseré détache le bloc du fond. Il reste plus sombre du côté opposé
  // à la lumière, mais assez discret pour ne pas se lire comme une tranche.
  const rim = axe(0.5, 0.5);
  rim.addColorStop(0, shade(base, -0.04));
  rim.addColorStop(1, shade(base, -0.4));

  // Le biseau : il épouse tout le contour, clair du côté de la lumière,
  // sombre à l'opposé. Des baguettes posées en retrait du bord flottaient au
  // lieu d'éclairer une arête.
  const bevel = axe(0.55, 0.55);
  bevel.addColorStop(0, shade(base, 0.54));
  bevel.addColorStop(0.42, shade(base, 0.16));
  bevel.addColorStop(0.6, shade(base, -0.14));
  bevel.addColorStop(1, shade(base, -0.44));

  return { body, rim, bevel };
}

/** Liseré, biseau et corps, du plus large au plus étroit. */
export function paintBody(
  ctx: CanvasRenderingContext2D,
  art: BlockArt,
  paints: BlockPaints,
) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Le liseré vient d'un trait plus large passé dessous puis recouvert :
  // c'est le seul moyen de cerner la silhouette entière d'un seul contour.
  ctx.lineWidth = PEN + 2.2;
  ctx.strokeStyle = paints.rim;
  ctx.fillStyle = paints.rim;
  ctx.stroke(art.path);
  ctx.fill(art.path);

  // La plume dessine la silhouette : en la rétrécissant de deux fois le
  // biseau, le corps laisse dépasser un anneau régulier tout autour.
  ctx.lineWidth = PEN;
  ctx.strokeStyle = paints.bevel;
  ctx.fillStyle = paints.bevel;
  ctx.stroke(art.path);
  ctx.fill(art.path);

  ctx.lineWidth = PEN - 2 * BEVEL;
  ctx.strokeStyle = paints.body;
  ctx.fillStyle = paints.body;
  ctx.stroke(art.path);
  ctx.fill(art.path);
}

/**
 * Rainures entre cubes : un trait sombre, doublé d'un trait clair sur la
 * paroi qui fait face à la lumière. C'est ce couple qui les fait lire comme
 * creusées et non comme dessinées.
 */
export function paintSeams(ctx: CanvasRenderingContext2D, art: BlockArt, angle: number) {
  const l = localLight(angle);

  // Les deux familles de traits sont tracées d'un seul coup : dessinés
  // segment par segment, leurs alphas se cumulaient aux croisements et
  // laissaient un point sombre à chaque intersection.
  const creux = new Path2D();
  const clair = new Path2D();

  for (const [x1, y1, x2, y2] of art.seams) {
    const horizontale = y1 === y2;
    const nx = horizontale ? 0 : 1;
    const ny = horizontale ? 1 : 0;
    const cote = nx * l.x + ny * l.y >= 0 ? -1.5 : 1.5;

    creux.moveTo(x1, y1);
    creux.lineTo(x2, y2);
    clair.moveTo(x1 + nx * cote, y1 + ny * cote);
    clair.lineTo(x2 + nx * cote, y2 + ny * cote);
  }

  ctx.lineWidth = 1.7;
  ctx.strokeStyle = 'rgba(12, 16, 26, 0.22)';
  ctx.stroke(creux);

  ctx.lineWidth = 1.3;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.17)';
  ctx.stroke(clair);
}

/** Marges laissées autour de la silhouette pour ce qui dépasse de la tête. */
const OVER_TOP = UNIT * 0.5;
const OVER_SIDE = UNIT * 0.18;
/** La barbe et l'écharpe descendent un peu sous la case du visage. */
const OVER_BOTTOM = UNIT * 0.06;

/**
 * Un bloc entier, personnage compris, mis à l'échelle pour tenir dans une
 * boîte. Sert aux boutons de la barre : le 10 y garde sa silhouette de 2 x 5,
 * ce qui est déjà la moitié de la leçon.
 */
export function drawBlockThumb(
  ctx: CanvasRenderingContext2D,
  value: number,
  base: string,
  boxW: number,
  boxH: number,
  wardrobe?: Wardrobe,
) {
  const art = blockArt(value);
  const left = art.left - OVER_SIDE;
  const right = art.right + OVER_SIDE;
  const top = art.top - OVER_TOP;
  const bottom = art.bottom + OVER_BOTTOM;
  const scale = Math.min(boxW / (right - left), boxH / (bottom - top));

  ctx.save();
  ctx.translate(boxW / 2 - (scale * (left + right)) / 2, boxH / 2 - (scale * (top + bottom)) / 2);
  ctx.scale(scale, scale);
  paintBody(ctx, art, blockPaints(ctx, art, base, 0));
  paintSeams(ctx, art, 0);
  drawCharacter(ctx, value, base, { wardrobe });
  ctx.restore();
}

/**
 * Une tête seule sur son cube, au plus grand possible. L'atelier montre ainsi
 * chaque pièce à une taille où on la distingue : dans la silhouette entière
 * d'un 10, un sourcil fait deux pixels.
 */
export function drawFaceThumb(
  ctx: CanvasRenderingContext2D,
  base: string,
  look: ResolvedLook,
  boxW: number,
  boxH: number,
) {
  const art = blockArt(1);
  const left = art.left - OVER_SIDE;
  const right = art.right + OVER_SIDE;
  const top = art.top - OVER_TOP;
  const bottom = art.bottom + OVER_BOTTOM;
  const scale = Math.min(boxW / (right - left), boxH / (bottom - top));

  ctx.save();
  ctx.translate(boxW / 2 - (scale * (left + right)) / 2, boxH / 2 - (scale * (top + bottom)) / 2);
  ctx.scale(scale, scale);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  paintBody(ctx, art, blockPaints(ctx, art, base, 0));
  drawHead(ctx, look, base);
  ctx.restore();
}
