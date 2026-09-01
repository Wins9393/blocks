import { UNIT } from '../core/constants';
import { shade } from '../core/palette';
import { centeredCells, shapeFor } from '../core/shape';
import { lookFor, lookSignature } from '../core/wardrobe';
import type {
  BrowKind,
  EyeKind,
  HairKind,
  ResolvedLook,
  StacheKind,
  Wardrobe,
} from '../core/wardrobe';

/**
 * Le dessin des personnages.
 *
 * Une règle gouverne les couleurs : **les cheveux appartiennent au personnage,
 * les accessoires sont des objets**. Une chevelure prend une teinte du bloc ;
 * un bonnet est en laine rouge, une casquette en denim, une couronne en or.
 * Quand tout était teinté de la couleur du bloc, le personnage n'avait pas
 * l'air habillé — il avait l'air peint.
 */

const U = UNIT;

/**
 * Matières du personnage, indépendantes de la couleur du bloc. La palette des
 * objets, elle, vit dans `objets3d.ts` : ce sont eux qui la portent désormais.
 */
const MAT = {
  or: '#FFD75E',
  orOmbre: '#BF8C1C',
  rose: '#F58BB0',
  creme: '#F6EEDC',
  cremeOmbre: '#C9BB9C',
  rouge: '#DE4E3E',
  blanc: '#FDFDFD',
};

/** Haut de la case qui porte le visage, dans le repère de cette case. */
const TOP = -U * 0.5;
const EYE_X = U * 0.21;
const EYE_Y = -U * 0.07;

export interface Pose {
  /** Décalage de la pupille, en pixels, dans le repère du bloc. */
  gazeX: number;
  gazeY: number;
  /** 0 = œil ouvert, 1 = fermé. */
  blink: number;
}

const NEUTRAL: Pose = { gazeX: 0, gazeY: 0, blink: 0 };

interface Ink {
  /** Trait des yeux et de la bouche. */
  dark: string;
  /** Cheveux et barbe : ils font partie du personnage, donc de sa couleur. */
  hair: string;
}

const encres = new Map<string, Ink>();

function inkFor(base: string): Ink {
  let ink = encres.get(base);
  if (!ink) {
    ink = { dark: shade(base, -0.78), hair: shade(base, -0.56) };
    encres.set(base, ink);
  }
  return ink;
}

// --- assemblage -----------------------------------------------------------

/**
 * Tout ce qui ne bouge jamais. Rien ici ne recouvre les yeux, ce qui permet
 * de le peindre une fois pour toutes et de le poser sous le regard.
 *
 * Chapeaux, lunettes et pièces de cou n'y sont pas : ce sont des objets, et
 * les objets sont modelés en volume (`objets3d.ts`). Le trait ne garde que le
 * personnage — cheveux, sourcils, bouche, barbe, joues et regard.
 */
export function drawHeadDecor(ctx: CanvasRenderingContext2D, look: ResolvedLook, base: string) {
  const ink = inkFor(base);
  drawHair(ctx, look.hair, ink);
  if (look.cheeks === 'roses' || look.cheeks === 'deux') drawBlush(ctx);
  if (look.cheeks === 'taches' || look.cheeks === 'deux') drawFreckles(ctx, ink);
  // La barbe entoure la bouche : elle passe dessous, sinon elle l'avale.
  drawBeard(ctx, look.stache, ink);
  drawMouth(ctx, look, ink);
  drawMoustache(ctx, look.stache, ink);
  if (look.brows !== 'rien') drawBrows(ctx, look.brows, ink);
}

/** Ce qui vit : le regard, seul à changer d'une image à l'autre. */
export function drawHeadLive(
  ctx: CanvasRenderingContext2D,
  look: ResolvedLook,
  base: string,
  pose: Pose,
) {
  drawEyes(ctx, look.eyes, inkFor(base), pose);
}

/** La tête entière, au trait, centrée sur l'origine. */
export function drawHead(
  ctx: CanvasRenderingContext2D,
  look: ResolvedLook,
  base: string,
  pose: Pose = NEUTRAL,
) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  drawHeadDecor(ctx, look, base);
  drawHeadLive(ctx, look, base, pose);
  ctx.restore();
}

// Boîte du décor, autour du centre de la case du visage. Assez large pour le
// plus haut des chapeaux et la plus large des chevelures.
const DECOR_HALF_W = U * 0.78;
const DECOR_TOP = -U * 1.16;
const DECOR_BOTTOM = U * 0.78;

/**
 * Les décors peints une fois puis reposés en image.
 *
 * Redessiner vingt visages au trait coûtait 2 ms par image, soit quatre fois
 * le reste de la scène : sur une tablette d'enfant, c'était la moitié du
 * budget d'affichage partie en sourcils.
 */
export class DecorCache {
  private images = new Map<string, HTMLCanvasElement>();
  private dpr = 1;

  /** Change la finesse des images ; les anciennes deviennent floues. */
  setDpr(dpr: number) {
    if (dpr === this.dpr) return;
    this.dpr = dpr;
    this.images.clear();
  }

  /** À appeler quand la garde-robe change : les anciennes têtes sont périmées. */
  clear() {
    this.images.clear();
  }

  private image(look: ResolvedLook, base: string): HTMLCanvasElement {
    const key = `${base}|${lookSignature(look)}`;
    const hit = this.images.get(key);
    if (hit) return hit;

    const w = 2 * DECOR_HALF_W;
    const h = DECOR_BOTTOM - DECOR_TOP;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(w * this.dpr);
    canvas.height = Math.ceil(h * this.dpr);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(this.dpr, this.dpr);
      ctx.translate(DECOR_HALF_W, -DECOR_TOP);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      drawHeadDecor(ctx, look, base);
    }
    this.images.set(key, canvas);
    return canvas;
  }

  draw(ctx: CanvasRenderingContext2D, look: ResolvedLook, base: string) {
    ctx.drawImage(
      this.image(look, base),
      -DECOR_HALF_W,
      DECOR_TOP,
      2 * DECOR_HALF_W,
      DECOR_BOTTOM - DECOR_TOP,
    );
  }
}

export interface CharacterOptions {
  pose?: Pose;
  /** Fourni par la scène : les parties fixes passent alors par le cache. */
  decor?: DecorCache;
  wardrobe?: Wardrobe;
}

/**
 * Le personnage sur son bloc. Sans `decor`, tout est tracé au trait : c'est ce
 * qu'il faut pour les vignettes, dessinées une fois et parfois très réduites.
 */
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  value: number,
  base: string,
  opts: CharacterOptions = {},
) {
  const { pose = NEUTRAL, decor, wardrobe } = opts;
  const cells = centeredCells(value);
  const face = cells[shapeFor(value).faceIndex];
  const look = lookFor(value, wardrobe);

  ctx.save();
  ctx.translate(face.x * U, face.y * U);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (decor) decor.draw(ctx, look, base);
  else drawHeadDecor(ctx, look, base);
  drawHeadLive(ctx, look, base, pose);

  ctx.restore();
}

// --- outils de tracé ------------------------------------------------------

function star(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  fill: string,
  edge?: string,
) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.44;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (edge) {
    ctx.strokeStyle = edge;
    ctx.lineWidth = U * 0.03;
    ctx.stroke();
  }
}

function coeur(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + r * 0.95);
  ctx.bezierCurveTo(cx - r * 1.6, cy - r * 0.25, cx - r * 0.55, cy - r * 1.25, cx, cy - r * 0.3);
  ctx.bezierCurveTo(cx + r * 0.55, cy - r * 1.25, cx + r * 1.6, cy - r * 0.25, cx, cy + r * 0.95);
  ctx.closePath();
}

// --- yeux -----------------------------------------------------------------

interface EyeGeo {
  rx: number;
  ry: number;
  px: number;
  py: number;
}

const EYES: Record<EyeKind, EyeGeo> = {
  ronds: { rx: 0.125, ry: 0.155, px: 0.062, py: 0.08 },
  grands: { rx: 0.152, ry: 0.19, px: 0.076, py: 0.098 },
  malins: { rx: 0.095, ry: 0.105, px: 0.05, py: 0.056 },
  endormis: { rx: 0.13, ry: 0.105, px: 0.06, py: 0.058 },
  etoiles: { rx: 0.13, ry: 0.16, px: 0.062, py: 0.08 },
  coeurs: { rx: 0.135, ry: 0.165, px: 0.062, py: 0.08 },
  spirale: { rx: 0.14, ry: 0.165, px: 0.05, py: 0.05 },
};

function drawEyes(ctx: CanvasRenderingContext2D, kind: EyeKind, ink: Ink, pose: Pose) {
  const geo = EYES[kind];
  const open = 1 - pose.blink;
  // La paupière tombe d'en haut : l'œil rétrécit et descend un peu.
  const cy = EYE_Y + (1 - open) * U * 0.035;
  const rx = U * geo.rx;
  const ry = U * geo.ry * open + 0.55;

  for (const s of [-1, 1]) {
    const ex = s * EYE_X;

    ctx.fillStyle = 'rgba(12, 16, 26, 0.16)';
    ctx.beginPath();
    ctx.ellipse(ex, cy + 0.9, rx * 1.06, ry * 1.06, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = MAT.blanc;
    ctx.beginPath();
    ctx.ellipse(ex, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    const px = ex + pose.gazeX;
    const py = cy + pose.gazeY;

    if (kind === 'etoiles') {
      star(ctx, px, py, U * 0.085 * open + 0.4, MAT.or, MAT.orOmbre);
    } else if (kind === 'coeurs') {
      ctx.fillStyle = MAT.rouge;
      coeur(ctx, px, py, U * 0.07 * open + 0.4);
      ctx.fill();
    } else if (kind === 'spirale') {
      ctx.strokeStyle = ink.dark;
      ctx.lineWidth = U * 0.038;
      ctx.beginPath();
      const tours = Math.PI * 3.4;
      for (let a = 0; a <= tours; a += 0.22) {
        const rr = (a / tours) * U * 0.115 * open;
        const x = px + Math.cos(a) * rr;
        const y = py + Math.sin(a) * rr;
        if (a === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else {
      ctx.fillStyle = ink.dark;
      ctx.beginPath();
      ctx.ellipse(px, py, U * geo.px, U * geo.py * open + 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      if (open > 0.45) {
        ctx.fillStyle = `rgba(255, 255, 255, ${(0.9 * open).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(px - U * 0.024, py - U * 0.032, U * 0.024, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (kind === 'endormis') {
      ctx.strokeStyle = ink.hair;
      ctx.lineWidth = U * 0.05;
      ctx.beginPath();
      ctx.moveTo(ex - rx, cy - ry * 0.5);
      ctx.quadraticCurveTo(ex, cy - ry * 1.6, ex + rx, cy - ry * 0.5);
      ctx.stroke();
    }
  }
}

// --- sourcils -------------------------------------------------------------

function drawBrows(ctx: CanvasRenderingContext2D, kind: BrowKind, ink: Ink) {
  ctx.strokeStyle = ink.hair;
  ctx.lineWidth = U * 0.055;
  const y = EYE_Y - (kind === 'hauts' ? U * 0.29 : U * 0.22);
  const demi = U * 0.1;

  for (const s of [-1, 1]) {
    const cx = s * EYE_X;
    ctx.beginPath();
    if (kind === 'droits') {
      ctx.moveTo(cx - demi, y);
      ctx.lineTo(cx + demi, y);
    } else if (kind === 'faches') {
      // Le bord intérieur plonge vers le nez : c'est ça qui fait la colère.
      // La pente inverse donne exactement l'air triste — c'est le seul trait
      // qui sépare les deux, alors on nomme les extrémités plutôt que de se
      // fier au signe.
      const interieur = cx - s * demi;
      const exterieur = cx + s * demi;
      ctx.moveTo(interieur, y + U * 0.05);
      ctx.lineTo(exterieur, y - U * 0.03);
    } else {
      const creux = kind === 'hauts' ? U * 0.075 : U * 0.05;
      ctx.moveTo(cx - demi, y + U * 0.02);
      ctx.quadraticCurveTo(cx, y - creux, cx + demi, y + U * 0.02);
    }
    ctx.stroke();
  }
}

// --- bouches --------------------------------------------------------------

function drawMouth(ctx: CanvasRenderingContext2D, look: ResolvedLook, ink: Ink) {
  // La barbe occupe le bas du visage : la bouche descend d'un cran.
  const y = look.stache !== 'rien' ? U * 0.29 : U * 0.21;
  ctx.strokeStyle = ink.dark;
  ctx.fillStyle = ink.dark;
  ctx.lineWidth = U * 0.055;

  switch (look.mouth) {
    case 'rond':
      ctx.beginPath();
      ctx.ellipse(0, y, U * 0.075, U * 0.095, 0, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'sourire':
      ctx.beginPath();
      ctx.moveTo(-U * 0.13, y - U * 0.03);
      ctx.quadraticCurveTo(0, y + U * 0.1, U * 0.13, y - U * 0.03);
      ctx.stroke();
      break;

    case 'large':
      ctx.beginPath();
      ctx.moveTo(-U * 0.17, y - U * 0.04);
      ctx.quadraticCurveTo(0, y + U * 0.13, U * 0.17, y - U * 0.04);
      ctx.stroke();
      break;

    case 'trait':
      ctx.beginPath();
      ctx.moveTo(-U * 0.13, y);
      ctx.quadraticCurveTo(0, y + U * 0.035, U * 0.13, y);
      ctx.stroke();
      break;

    case 'coin':
      ctx.beginPath();
      ctx.moveTo(-U * 0.14, y + U * 0.01);
      ctx.quadraticCurveTo(U * 0.02, y + U * 0.11, U * 0.16, y - U * 0.06);
      ctx.stroke();
      break;

    case 'dent':
      ctx.beginPath();
      ctx.moveTo(-U * 0.15, y - U * 0.03);
      ctx.quadraticCurveTo(0, y + U * 0.11, U * 0.15, y - U * 0.03);
      ctx.stroke();
      ctx.fillStyle = MAT.blanc;
      ctx.beginPath();
      ctx.roundRect(-U * 0.055, y - U * 0.035, U * 0.11, U * 0.075, U * 0.02);
      ctx.fill();
      break;

    case 'dents': {
      // Bouche ouverte barrée d'une rangée de dents : le rire franc.
      const w = U * 0.2;
      ctx.beginPath();
      ctx.moveTo(-w, y - U * 0.05);
      ctx.quadraticCurveTo(0, y - U * 0.1, w, y - U * 0.05);
      ctx.quadraticCurveTo(0, y + U * 0.19, -w, y - U * 0.05);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = MAT.blanc;
      ctx.fillRect(-w, y - U * 0.06, 2 * w, U * 0.075);
      ctx.strokeStyle = 'rgba(20, 24, 34, 0.35)';
      ctx.lineWidth = U * 0.02;
      for (const x of [-U * 0.07, 0, U * 0.07]) {
        ctx.beginPath();
        ctx.moveTo(x, y - U * 0.06);
        ctx.lineTo(x, y + U * 0.02);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }

    case 'langue': {
      const w = U * 0.17;
      ctx.beginPath();
      ctx.moveTo(-w, y - U * 0.04);
      ctx.quadraticCurveTo(0, y - U * 0.09, w, y - U * 0.04);
      ctx.quadraticCurveTo(0, y + U * 0.17, -w, y - U * 0.04);
      ctx.closePath();
      ctx.fill();
      // La langue est découpée dans la bouche, sinon elle déborde du menton.
      ctx.save();
      ctx.clip();
      ctx.fillStyle = '#F4788C';
      ctx.beginPath();
      ctx.ellipse(0, y + U * 0.12, U * 0.1, U * 0.075, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
  }
}

// --- cheveux --------------------------------------------------------------

function drawHair(ctx: CanvasRenderingContext2D, kind: HairKind, ink: Ink) {
  ctx.fillStyle = ink.hair;
  switch (kind) {
    case 'rien':
      break;

    case 'epi':
      ctx.strokeStyle = ink.hair;
      ctx.lineWidth = U * 0.095;
      ctx.beginPath();
      ctx.moveTo(-U * 0.03, TOP + U * 0.08);
      ctx.bezierCurveTo(U * 0.02, TOP - U * 0.18, U * 0.24, TOP - U * 0.19, U * 0.15, TOP - U * 0.01);
      ctx.stroke();
      break;

    case 'couettes':
      // Bandeau : sans lui, les couettes flottent à côté de la tête.
      ctx.beginPath();
      ctx.ellipse(0, TOP + U * 0.02, U * 0.38, U * 0.12, 0, Math.PI, 2 * Math.PI);
      ctx.fill();
      // Dressées : posées sur les côtés, elles passaient pour des oreilles.
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(s * U * 0.28, TOP - U * 0.08, U * 0.1, U * 0.17, (s * Math.PI) / 7, 0, Math.PI * 2);
        ctx.fill();
      }
      break;

    case 'pics':
      ctx.beginPath();
      for (const x of [-U * 0.26, 0, U * 0.26]) {
        ctx.moveTo(x - U * 0.13, TOP + U * 0.07);
        ctx.lineTo(x, TOP - U * 0.21);
        ctx.lineTo(x + U * 0.13, TOP + U * 0.07);
      }
      ctx.closePath();
      ctx.fill();
      break;

    case 'carre':
      ctx.beginPath();
      ctx.roundRect(-U * 0.42, TOP - U * 0.17, U * 0.84, U * 0.22, U * 0.05);
      ctx.fill();
      break;

    case 'boucles':
      for (const [x, y] of [
        [-U * 0.36, TOP + U * 0.02],
        [-U * 0.19, TOP - U * 0.08],
        [0, TOP - U * 0.11],
        [U * 0.19, TOP - U * 0.08],
        [U * 0.36, TOP + U * 0.02],
      ]) {
        ctx.beginPath();
        ctx.arc(x, y, U * 0.13, 0, Math.PI * 2);
        ctx.fill();
      }
      break;

    case 'chignon':
      ctx.beginPath();
      ctx.arc(0, TOP - U * 0.1, U * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, TOP + U * 0.03, U * 0.4, U * 0.15, 0, Math.PI, 2 * Math.PI);
      ctx.fill();
      break;

    case 'meche':
      ctx.beginPath();
      ctx.moveTo(-U * 0.44, TOP + U * 0.11);
      ctx.quadraticCurveTo(-U * 0.34, TOP - U * 0.14, U * 0.04, TOP - U * 0.12);
      ctx.quadraticCurveTo(U * 0.36, TOP - U * 0.1, U * 0.44, TOP + U * 0.04);
      ctx.quadraticCurveTo(U * 0.1, TOP - U * 0.02, -U * 0.44, TOP + U * 0.11);
      ctx.closePath();
      ctx.fill();
      break;

    case 'tresses':
      ctx.beginPath();
      ctx.ellipse(0, TOP + U * 0.02, U * 0.38, U * 0.13, 0, Math.PI, 2 * Math.PI);
      ctx.fill();
      // Chaque tresse est une file de nœuds : c'est le chapelet qui la nomme.
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.ellipse(
            s * (U * 0.42 + i * U * 0.015),
            TOP + U * 0.1 + i * U * 0.16,
            U * 0.1 - i * U * 0.012,
            U * 0.085,
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
        ctx.fillStyle = MAT.rose;
        ctx.beginPath();
        ctx.ellipse(s * (U * 0.45), TOP + U * 0.47, U * 0.055, U * 0.045, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ink.hair;
      }
      break;
  }
}

// --- chapeaux -------------------------------------------------------------

// --- lunettes -------------------------------------------------------------

// --- barbes ---------------------------------------------------------------

function drawBeard(ctx: CanvasRenderingContext2D, kind: StacheKind, ink: Ink) {
  if (kind === 'rien' || kind === 'moustache') return;
  ctx.fillStyle = kind === 'blanche' ? MAT.creme : kind === 'bucheron' ? '#B4623A' : ink.hair;

  if (kind === 'bouc') {
    ctx.beginPath();
    ctx.moveTo(-U * 0.1, U * 0.36);
    ctx.quadraticCurveTo(0, U * 0.58, U * 0.1, U * 0.36);
    ctx.quadraticCurveTo(0, U * 0.42, -U * 0.1, U * 0.36);
    ctx.closePath();
    ctx.fill();
    return;
  }

  const bas = kind === 'blanche' ? U * 0.72 : U * 0.58;
  ctx.beginPath();
  ctx.moveTo(-U * 0.36, U * 0.14);
  ctx.quadraticCurveTo(-U * 0.4, bas, 0, bas + U * 0.04);
  ctx.quadraticCurveTo(U * 0.4, bas, U * 0.36, U * 0.14);
  ctx.quadraticCurveTo(U * 0.18, U * 0.3, 0, U * 0.3);
  ctx.quadraticCurveTo(-U * 0.18, U * 0.3, -U * 0.36, U * 0.14);
  ctx.closePath();
  ctx.fill();

  if (kind === 'blanche') {
    ctx.strokeStyle = MAT.cremeOmbre;
    ctx.lineWidth = U * 0.025;
    for (const x of [-U * 0.12, U * 0.12]) {
      ctx.beginPath();
      ctx.moveTo(x, U * 0.34);
      ctx.quadraticCurveTo(x * 1.3, U * 0.55, x * 0.7, bas - U * 0.04);
      ctx.stroke();
    }
  }
}

function drawMoustache(ctx: CanvasRenderingContext2D, kind: StacheKind, ink: Ink) {
  if (kind === 'rien') return;
  ctx.fillStyle = kind === 'blanche' ? MAT.creme : kind === 'bucheron' ? '#B4623A' : ink.hair;
  const large = kind === 'blanche' || kind === 'bucheron';
  const aile = large ? U * 0.4 : U * 0.34;
  ctx.beginPath();
  for (const s of [-1, 1]) {
    ctx.moveTo(0, U * 0.12);
    ctx.quadraticCurveTo(s * U * 0.16, U * 0.09, s * aile, U * 0.19);
    ctx.quadraticCurveTo(s * U * 0.2, U * 0.25, 0, U * 0.2);
  }
  ctx.closePath();
  ctx.fill();
}

// --- joues ----------------------------------------------------------------

function drawBlush(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = 'rgba(255, 118, 128, 0.3)';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * U * 0.33, U * 0.12, U * 0.1, U * 0.065, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFreckles(ctx: CanvasRenderingContext2D, ink: Ink) {
  ctx.save();
  ctx.globalAlpha = 0.42;
  ctx.fillStyle = ink.hair;
  for (const s of [-1, 1]) {
    for (const [dx, dy] of [
      [0, -U * 0.04],
      [U * 0.07, U * 0.02],
      [-U * 0.03, U * 0.05],
    ]) {
      ctx.beginPath();
      ctx.arc(s * (U * 0.34 + dx), U * 0.05 + dy, U * 0.026, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// --- autour du cou --------------------------------------------------------
