import { UNIT } from '../core/constants';
import type { ResolvedLook, Wardrobe } from '../core/wardrobe';
import { drawCharacter, drawHead } from './faces';
import { Relief } from './relief';
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

/** Largeur de la plume qui trace la silhouette. */
export const PEN = 2 * CORNER;

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
/** Où poser un bloc pour qu'il tienne dans une boîte, avec ses débordements. */
function cadre(art: BlockArt, boxW: number, boxH: number) {
  const left = art.left - OVER_SIDE;
  const right = art.right + OVER_SIDE;
  const top = art.top - OVER_TOP;
  const bottom = art.bottom + OVER_BOTTOM;
  const scale = Math.min(boxW / (right - left), boxH / (bottom - top));
  return {
    scale,
    x: boxW / 2 - (scale * (left + right)) / 2,
    y: boxH / 2 - (scale * (top + bottom)) / 2,
  };
}

/**
 * Le moteur de relief des vignettes : son propre contexte, pour ne pas
 * déranger celui de la scène, et un œil à distance fixe — une vignette de cent
 * pixels ne doit pas fuir comme un grand-angle.
 */
let atelier3D: Relief | null = null;

function reliefVignette(): Relief | null {
  if (!atelier3D) atelier3D = new Relief(1100);
  return atelier3D.disponible ? atelier3D : null;
}

/**
 * Une vignette, montée comme la scène : le corps en volume, puis le visage au
 * trait sur la face avant, puis les objets par-dessus.
 */
function vignetteRelief(
  ctx: CanvasRenderingContext2D,
  value: number,
  base: string,
  boxW: number,
  boxH: number,
  dpr: number,
  tete: (ctx: CanvasRenderingContext2D) => void,
  look?: ResolvedLook,
  wardrobe?: Wardrobe,
) {
  const relief = reliefVignette();
  if (!relief) return;
  const art = blockArt(value);
  const { scale, x, y } = cadre(art, boxW, boxH);
  relief.setWardrobe(wardrobe ?? {});
  relief.resize(boxW, boxH, dpr);

  const bloc = { value, x, y, angle: 0, sx: scale, sy: scale, rang: 0, dragged: false, look };
  const corps = relief.passeCorps([bloc], 0);
  if (corps) ctx.drawImage(corps, 0, 0, boxW, boxH);

  // Le visage suit la face avant, comme dans la scène.
  const k = relief.avantPlan;
  ctx.save();
  ctx.translate(boxW / 2 + (x - boxW / 2) * k, boxH / 2 + (y - boxH / 2) * k);
  ctx.scale(scale * k, scale * k);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  paintSeams(ctx, art, 0);
  tete(ctx);
  ctx.restore();

  const objets = relief.passeObjets([bloc], 0);
  if (objets) ctx.drawImage(objets, 0, 0, boxW, boxH);
  void base;
}

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
  dpr: number,
  wardrobe?: Wardrobe,
) {
  vignetteRelief(
    ctx,
    value,
    base,
    boxW,
    boxH,
    dpr,
    (c) => drawCharacter(c, value, base, { wardrobe }),
    undefined,
    wardrobe,
  );
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
  dpr: number,
) {
  vignetteRelief(ctx, 1, base, boxW, boxH, dpr, (c) => drawHead(c, look, base), look);
}
