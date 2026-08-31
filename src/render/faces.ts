import { UNIT } from '../core/constants';
import { shade } from '../core/palette';
import { centeredCells, shapeFor } from '../core/shape';

/**
 * Les personnages.
 *
 * Chaque nombre porte une tête reconnaissable : coiffure, bouche, accessoires.
 * La couleur seule ne suffisait pas — deux blocs de la même famille de teintes
 * se confondent de loin, et un enfant retient bien mieux « le moustachu » que
 * « le jaune orangé ».
 *
 * Une règle traverse la série : la couronne marque une dizaine. Le 10 la porte,
 * les nombres de 11 à 19 la portent avec le visage de leur unité, et le 20 en
 * porte deux rangs. On lit la décomposition sur la tête du personnage.
 */

const U = UNIT;

export type Hair =
  | 'tuft'
  | 'pigtails'
  | 'spikes'
  | 'flattop'
  | 'star'
  | 'curls'
  | 'feather'
  | 'swoosh'
  | 'bun'
  | 'crown';

export type Mouth = 'o' | 'smile' | 'beam' | 'grin' | 'tooth' | 'smirk' | 'line';

export interface Trait {
  hair: Hair;
  mouth: Mouth;
  brows?: boolean;
  glasses?: boolean;
  moustache?: boolean;
  freckles?: boolean;
  blush?: boolean;
  /** Nombre de dizaines, donc de rangs sur la couronne. */
  tens?: number;
}

const BASE: Record<number, Trait> = {
  1: { hair: 'tuft', mouth: 'o', freckles: true, blush: true },
  2: { hair: 'pigtails', mouth: 'beam', blush: true },
  3: { hair: 'spikes', mouth: 'smile', moustache: true, brows: true },
  4: { hair: 'flattop', mouth: 'line', brows: true },
  5: { hair: 'star', mouth: 'grin' },
  6: { hair: 'curls', mouth: 'tooth', freckles: true },
  7: { hair: 'feather', mouth: 'smirk', brows: true },
  8: { hair: 'swoosh', mouth: 'smile', glasses: true },
  9: { hair: 'bun', mouth: 'beam', brows: true, blush: true },
  10: { hair: 'crown', mouth: 'grin', blush: true, tens: 1 },
};

/**
 * Au-dessus de 10, le visage est celui de l'unité et la coiffure cède la place
 * à la couronne : 13 a la moustache du 3, 18 les lunettes du 8.
 */
export function traitFor(value: number): Trait {
  const v = Math.max(1, Math.round(value));
  if (v <= 10) return BASE[v];
  const unit = BASE[Math.min(10, v - 10)];
  return { ...unit, hair: 'crown', tens: Math.floor(v / 10) };
}

export interface Pose {
  /** Décalage de la pupille, en pixels, dans le repère du bloc. */
  gazeX: number;
  gazeY: number;
  /** 0 = œil ouvert, 1 = fermé. */
  blink: number;
}

const NEUTRAL: Pose = { gazeX: 0, gazeY: 0, blink: 0 };

const GOLD = '#FFD75E';
const GOLD_DARK = '#C99A22';
const TONGUE = '#F4788C';

/** Haut de la case qui porte le visage, dans le repère de cette case. */
const TOP = -U * 0.5;

interface Ink {
  /** Trait des yeux, de la bouche, des lunettes. */
  dark: string;
  /** Cheveux, moustache. */
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

/**
 * Tout ce qui ne bouge jamais : coiffure, sourcils, joues, moustache, bouche.
 * Rien ici ne recouvre les yeux, ce qui permet de le peindre une fois pour
 * toutes et de le poser sous le regard.
 */
function drawDecor(ctx: CanvasRenderingContext2D, value: number, base: string) {
  const trait = traitFor(value);
  const ink = inkFor(base);
  drawHair(ctx, trait, ink);
  if (trait.blush) drawBlush(ctx);
  if (trait.freckles) drawFreckles(ctx, ink);
  if (trait.brows) drawBrows(ctx, ink);
  if (trait.moustache) drawMoustache(ctx, ink);
  drawMouth(ctx, trait, ink);
}

/** Ce qui vit : le regard, et les verres qui le couvrent. */
function drawLive(ctx: CanvasRenderingContext2D, value: number, base: string, pose: Pose) {
  const ink = inkFor(base);
  drawEyes(ctx, ink, pose);
  if (traitFor(value).glasses) drawGlasses(ctx, ink);
}

// Boîte du décor, autour du centre de la case du visage. Assez large pour la
// plus haute des couronnes et la plus large des chevelures.
const DECOR_HALF_W = U * 0.62;
const DECOR_TOP = -U * 0.92;
const DECOR_BOTTOM = U * 0.62;

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

  private image(value: number, base: string): HTMLCanvasElement {
    const key = `${value}|${base}`;
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
      drawDecor(ctx, value, base);
    }
    this.images.set(key, canvas);
    return canvas;
  }

  draw(ctx: CanvasRenderingContext2D, value: number, base: string) {
    ctx.drawImage(
      this.image(value, base),
      -DECOR_HALF_W,
      DECOR_TOP,
      2 * DECOR_HALF_W,
      DECOR_BOTTOM - DECOR_TOP,
    );
  }
}

/**
 * Le personnage, dans le repère local du bloc. Sans `decor`, tout est tracé
 * au trait : c'est ce qu'il faut pour les vignettes, dessinées une seule fois
 * et parfois très réduites.
 */
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  value: number,
  base: string,
  pose: Pose = NEUTRAL,
  decor?: DecorCache,
) {
  const cells = centeredCells(value);
  const face = cells[shapeFor(value).faceIndex];

  ctx.save();
  ctx.translate(face.x * U, face.y * U);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (decor) decor.draw(ctx, value, base);
  else drawDecor(ctx, value, base);
  drawLive(ctx, value, base, pose);

  ctx.restore();
}

// --- coiffures ------------------------------------------------------------

function drawHair(ctx: CanvasRenderingContext2D, trait: Trait, ink: Ink) {
  switch (trait.hair) {
    case 'tuft':
      ctx.strokeStyle = ink.hair;
      ctx.lineWidth = U * 0.095;
      ctx.beginPath();
      ctx.moveTo(-U * 0.03, TOP + U * 0.08);
      ctx.bezierCurveTo(
        U * 0.02,
        TOP - U * 0.18,
        U * 0.24,
        TOP - U * 0.19,
        U * 0.15,
        TOP - U * 0.01,
      );
      ctx.stroke();
      break;

    case 'pigtails':
      ctx.fillStyle = ink.hair;
      // Bandeau : sans lui, les couettes flottent à côté de la tête.
      ctx.beginPath();
      ctx.ellipse(0, TOP + U * 0.07, U * 0.38, U * 0.12, 0, Math.PI, 2 * Math.PI);
      ctx.fill();
      // Deux couettes dressées. Posées sur les côtés, elles passaient pour
      // une paire d'oreilles.
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(
          s * U * 0.28,
          TOP - U * 0.08,
          U * 0.1,
          U * 0.17,
          (s * Math.PI) / 7,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      break;

    case 'spikes':
      ctx.fillStyle = ink.hair;
      ctx.beginPath();
      for (const x of [-U * 0.26, 0, U * 0.26]) {
        ctx.moveTo(x - U * 0.13, TOP + U * 0.07);
        ctx.lineTo(x, TOP - U * 0.21);
        ctx.lineTo(x + U * 0.13, TOP + U * 0.07);
      }
      ctx.closePath();
      ctx.fill();
      break;

    case 'flattop':
      ctx.fillStyle = ink.hair;
      ctx.beginPath();
      ctx.roundRect(-U * 0.42, TOP - U * 0.13, U * 0.84, U * 0.26, U * 0.05);
      ctx.fill();
      break;

    case 'star': {
      ctx.fillStyle = ink.hair;
      ctx.beginPath();
      ctx.ellipse(0, TOP + U * 0.1, U * 0.42, U * 0.16, 0, Math.PI, 2 * Math.PI);
      ctx.fill();
      star(ctx, U * 0.33, TOP + U * 0.05, U * 0.16, GOLD, GOLD_DARK);
      break;
    }

    case 'curls':
      ctx.fillStyle = ink.hair;
      for (const [x, y] of [
        [-U * 0.36, TOP + U * 0.08],
        [-U * 0.19, TOP - U * 0.02],
        [0, TOP - U * 0.05],
        [U * 0.19, TOP - U * 0.02],
        [U * 0.36, TOP + U * 0.08],
      ]) {
        ctx.beginPath();
        ctx.arc(x, y, U * 0.13, 0, Math.PI * 2);
        ctx.fill();
      }
      break;

    case 'feather':
      // Plume d'abord : elle passe derrière le bandeau qui la retient.
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      ctx.moveTo(U * 0.26, TOP + U * 0.14);
      ctx.quadraticCurveTo(U * 0.3, TOP - U * 0.12, U * 0.48, TOP - U * 0.26);
      ctx.quadraticCurveTo(U * 0.44, TOP - U * 0.02, U * 0.36, TOP + U * 0.15);
      ctx.closePath();
      ctx.fill();
      // Nervure : sans elle, la plume passait pour une flamme de bougie.
      ctx.strokeStyle = GOLD_DARK;
      ctx.lineWidth = U * 0.028;
      ctx.beginPath();
      ctx.moveTo(U * 0.3, TOP + U * 0.14);
      ctx.quadraticCurveTo(U * 0.36, TOP - U * 0.08, U * 0.47, TOP - U * 0.25);
      ctx.stroke();
      ctx.fillStyle = ink.hair;
      ctx.beginPath();
      ctx.roundRect(-U * 0.44, TOP + U * 0.06, U * 0.88, U * 0.14, U * 0.06);
      ctx.fill();
      break;

    case 'swoosh':
      ctx.fillStyle = ink.hair;
      ctx.beginPath();
      ctx.moveTo(-U * 0.44, TOP + U * 0.2);
      ctx.quadraticCurveTo(-U * 0.34, TOP - U * 0.08, U * 0.04, TOP - U * 0.06);
      ctx.quadraticCurveTo(U * 0.36, TOP - U * 0.04, U * 0.44, TOP + U * 0.12);
      ctx.quadraticCurveTo(U * 0.1, TOP + U * 0.05, -U * 0.44, TOP + U * 0.2);
      ctx.closePath();
      ctx.fill();
      break;

    case 'bun':
      ctx.fillStyle = ink.hair;
      ctx.beginPath();
      ctx.arc(0, TOP - U * 0.1, U * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, TOP + U * 0.09, U * 0.4, U * 0.15, 0, Math.PI, 2 * Math.PI);
      ctx.fill();
      break;

    case 'crown':
      crown(ctx, trait.tens ?? 1);
      break;
  }
}

/** Une couronne par dizaine, empilées : on compte les dix sur la tête. */
function crown(ctx: CanvasRenderingContext2D, tens: number) {
  const rangs = Math.max(1, Math.min(2, tens));
  for (let i = 0; i < rangs; i++) {
    const base = TOP + U * 0.09 - i * U * 0.19;
    const pointe = base - U * 0.2;
    const demi = U * 0.44 - i * U * 0.08;

    ctx.fillStyle = GOLD;
    ctx.strokeStyle = GOLD_DARK;
    ctx.lineWidth = U * 0.035;
    ctx.beginPath();
    ctx.moveTo(-demi, base);
    ctx.lineTo(-demi, base - U * 0.09);
    ctx.lineTo(-demi * 0.5, pointe + U * 0.09);
    ctx.lineTo(0, pointe);
    ctx.lineTo(demi * 0.5, pointe + U * 0.09);
    ctx.lineTo(demi, base - U * 0.09);
    ctx.lineTo(demi, base);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.arc(0, base - U * 0.06, U * 0.035, 0, Math.PI * 2);
    ctx.fill();
  }
}

function star(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  fill: string,
  edge: string,
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
  ctx.strokeStyle = edge;
  ctx.lineWidth = U * 0.03;
  ctx.stroke();
}

// --- visage ---------------------------------------------------------------

const EYE_X = U * 0.21;
const EYE_Y = -U * 0.07;

function drawEyes(ctx: CanvasRenderingContext2D, ink: Ink, pose: Pose) {
  const open = 1 - pose.blink;
  // La paupière tombe d'en haut : l'œil rétrécit et descend un peu.
  const cy = EYE_Y + (1 - open) * U * 0.035;
  const rx = U * 0.125;
  const ry = U * 0.155 * open + 0.55;

  for (const s of [-1, 1]) {
    const ex = s * EYE_X;

    ctx.fillStyle = 'rgba(12, 16, 26, 0.16)';
    ctx.beginPath();
    ctx.ellipse(ex, cy + 0.9, rx * 1.06, ry * 1.06, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fdfdfd';
    ctx.beginPath();
    ctx.ellipse(ex, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = ink.dark;
    ctx.beginPath();
    ctx.ellipse(
      ex + pose.gazeX,
      cy + pose.gazeY,
      U * 0.062,
      U * 0.08 * open + 0.4,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    if (open > 0.45) {
      ctx.fillStyle = `rgba(255, 255, 255, ${(0.9 * open).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(
        ex + pose.gazeX - U * 0.024,
        cy + pose.gazeY - U * 0.032,
        U * 0.024,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
}

function drawBrows(ctx: CanvasRenderingContext2D, ink: Ink) {
  ctx.strokeStyle = ink.hair;
  ctx.lineWidth = U * 0.055;
  const y = EYE_Y - U * 0.19;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * EYE_X - U * 0.1, y + U * 0.02);
    ctx.quadraticCurveTo(s * EYE_X, y - U * 0.05, s * EYE_X + U * 0.1, y + U * 0.02);
    ctx.stroke();
  }
}

function drawGlasses(ctx: CanvasRenderingContext2D, ink: Ink) {
  const r = U * 0.2;
  ctx.strokeStyle = ink.dark;
  ctx.lineWidth = U * 0.045;

  ctx.beginPath();
  ctx.moveTo(-EYE_X + r, EYE_Y);
  ctx.lineTo(EYE_X - r, EYE_Y);
  ctx.moveTo(-EYE_X - r, EYE_Y - U * 0.02);
  ctx.lineTo(-EYE_X - r - U * 0.14, EYE_Y - U * 0.06);
  ctx.moveTo(EYE_X + r, EYE_Y - U * 0.02);
  ctx.lineTo(EYE_X + r + U * 0.14, EYE_Y - U * 0.06);
  ctx.stroke();

  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(s * EYE_X, EYE_Y, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Éclat en travers du verre : sans lui, les cercles ne lisent pas comme du verre.
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = U * 0.05;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(s * EYE_X, EYE_Y, r * 0.62, -Math.PI * 0.95, -Math.PI * 0.55);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMoustache(ctx: CanvasRenderingContext2D, ink: Ink) {
  ctx.fillStyle = ink.hair;
  ctx.beginPath();
  for (const s of [-1, 1]) {
    ctx.moveTo(0, U * 0.12);
    ctx.quadraticCurveTo(s * U * 0.16, U * 0.09, s * U * 0.34, U * 0.19);
    ctx.quadraticCurveTo(s * U * 0.2, U * 0.24, 0, U * 0.2);
  }
  ctx.closePath();
  ctx.fill();
}

function drawMouth(ctx: CanvasRenderingContext2D, trait: Trait, ink: Ink) {
  // La moustache occupe le haut de la lèvre : la bouche descend d'un cran.
  const y = trait.moustache ? U * 0.31 : U * 0.21;
  ctx.strokeStyle = ink.dark;
  ctx.fillStyle = ink.dark;
  ctx.lineWidth = U * 0.055;

  switch (trait.mouth) {
    case 'o':
      ctx.beginPath();
      ctx.ellipse(0, y, U * 0.075, U * 0.095, 0, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'smile':
      ctx.beginPath();
      ctx.moveTo(-U * 0.13, y - U * 0.03);
      ctx.quadraticCurveTo(0, y + U * 0.1, U * 0.13, y - U * 0.03);
      ctx.stroke();
      break;

    case 'beam':
      ctx.beginPath();
      ctx.moveTo(-U * 0.17, y - U * 0.04);
      ctx.quadraticCurveTo(0, y + U * 0.13, U * 0.17, y - U * 0.04);
      ctx.stroke();
      break;

    case 'line':
      ctx.beginPath();
      ctx.moveTo(-U * 0.13, y);
      ctx.quadraticCurveTo(0, y + U * 0.035, U * 0.13, y);
      ctx.stroke();
      break;

    case 'smirk':
      ctx.beginPath();
      ctx.moveTo(-U * 0.14, y + U * 0.01);
      ctx.quadraticCurveTo(U * 0.02, y + U * 0.11, U * 0.16, y - U * 0.06);
      ctx.stroke();
      break;

    case 'tooth':
      ctx.beginPath();
      ctx.moveTo(-U * 0.15, y - U * 0.03);
      ctx.quadraticCurveTo(0, y + U * 0.11, U * 0.15, y - U * 0.03);
      ctx.stroke();
      ctx.fillStyle = '#fdfdfd';
      ctx.beginPath();
      ctx.roundRect(-U * 0.055, y - U * 0.035, U * 0.11, U * 0.075, U * 0.02);
      ctx.fill();
      break;

    case 'grin': {
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
      ctx.fillStyle = TONGUE;
      ctx.beginPath();
      ctx.ellipse(0, y + U * 0.12, U * 0.1, U * 0.075, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
  }
}

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
