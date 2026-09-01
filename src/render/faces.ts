import { UNIT } from '../core/constants';
import { shade } from '../core/palette';
import { centeredCells, shapeFor } from '../core/shape';
import { ANIMEES, lookFor, lookSignature } from '../core/wardrobe';
import type {
  BrowKind,
  EyeKind,
  GlassKind,
  HairKind,
  HatKind,
  ResolvedLook,
  ScarfKind,
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

/** Matières des accessoires, indépendantes de la couleur du bloc. */
const MAT = {
  or: '#FFD75E',
  orOmbre: '#BF8C1C',
  laine: '#E4574B',
  laineOmbre: '#AB362D',
  denim: '#4E7BB5',
  denimOmbre: '#2F538A',
  bois: '#8A6136',
  boisOmbre: '#5A3D21',
  metal: '#C6D0DF',
  metalOmbre: '#7B88A0',
  nuit: '#4A3C86',
  nuitOmbre: '#2A2154',
  noir: '#2E323F',
  noirClair: '#4C5265',
  rose: '#F58BB0',
  roseOmbre: '#C95B84',
  creme: '#F6EEDC',
  cremeOmbre: '#C9BB9C',
  feuille: '#5FB663',
  feuilleOmbre: '#3A8140',
  jaune: '#F4C63F',
  jauneOmbre: '#BE931C',
  rouge: '#DE4E3E',
  rougeOmbre: '#A5332A',
  ciel: '#6FC6E8',
  blanc: '#FDFDFD',
};

/** Haut de la case qui porte le visage, dans le repère de cette case. */
const TOP = -U * 0.5;
const EYE_X = U * 0.21;
const EYE_Y = -U * 0.07;
/** Ligne où se pose ce qu'on met autour du cou. */
const NECK = U * 0.42;

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

const anime = (slot: string, id: string) => ANIMEES.has(`${slot}:${id}`);

// --- assemblage -----------------------------------------------------------

/** Ce qui passe derrière la tête, et qui bouge : la cape. */
export function drawHeadBehind(
  ctx: CanvasRenderingContext2D,
  look: ResolvedLook,
  time: number,
  sansObjets = false,
) {
  if (look.scarf === 'cape' && !sansObjets) drawCape(ctx, time);
}

/**
 * Tout ce qui ne bouge jamais. Rien ici ne recouvre les yeux, ce qui permet
 * de le peindre une fois pour toutes et de le poser sous le regard.
 */
export function drawHeadDecor(
  ctx: CanvasRenderingContext2D,
  look: ResolvedLook,
  base: string,
  sansObjets = false,
) {
  const ink = inkFor(base);
  drawHair(ctx, look.hair, ink);
  // En relief, chapeaux, lunettes et pièces de cou sont modelés : on ne les
  // dessine pas deux fois. La pilosité, elle, reste toujours au trait.
  if (look.hat !== 'rien' && !anime('hat', look.hat) && !sansObjets) drawHat(ctx, look.hat, ink);
  if (look.scarf !== 'rien' && !anime('scarf', look.scarf) && !sansObjets) drawScarf(ctx, look.scarf);
  if (look.cheeks === 'roses' || look.cheeks === 'deux') drawBlush(ctx);
  if (look.cheeks === 'taches' || look.cheeks === 'deux') drawFreckles(ctx, ink);
  // La barbe entoure la bouche : elle passe dessous, sinon elle l'avale.
  drawBeard(ctx, look.stache, ink);
  drawMouth(ctx, look, ink);
  drawMoustache(ctx, look.stache, ink);
  if (look.brows !== 'rien') drawBrows(ctx, look.brows, ink);
}

/** Ce qui vit : le regard, les verres, et les pièces qui bougent. */
export function drawHeadLive(
  ctx: CanvasRenderingContext2D,
  look: ResolvedLook,
  base: string,
  pose: Pose,
  time: number,
  sansObjets = false,
) {
  const ink = inkFor(base);
  drawEyes(ctx, look.eyes, ink, pose);
  if (look.glasses !== 'rien' && !sansObjets) drawGlasses(ctx, look.glasses, ink, time);
  if (look.hat !== 'rien' && anime('hat', look.hat) && !sansObjets) drawAnimatedHat(ctx, look.hat, time);
}

/** La tête entière, au trait, centrée sur l'origine. */
export function drawHead(
  ctx: CanvasRenderingContext2D,
  look: ResolvedLook,
  base: string,
  pose: Pose = NEUTRAL,
  time = 0,
) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  drawHeadBehind(ctx, look, time);
  drawHeadDecor(ctx, look, base);
  drawHeadLive(ctx, look, base, pose, time);
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

  private image(look: ResolvedLook, base: string, sansObjets: boolean): HTMLCanvasElement {
    const key = `${base}|${lookSignature(look)}|${sansObjets ? 'nu' : 'tout'}`;
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
      drawHeadDecor(ctx, look, base, sansObjets);
    }
    this.images.set(key, canvas);
    return canvas;
  }

  draw(ctx: CanvasRenderingContext2D, look: ResolvedLook, base: string, sansObjets = false) {
    ctx.drawImage(
      this.image(look, base, sansObjets),
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
  time?: number;
  /** Le relief s'occupe des objets : ne dessine que le personnage. */
  sansObjets?: boolean;
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
  const { pose = NEUTRAL, decor, wardrobe, time = 0, sansObjets = false } = opts;
  const cells = centeredCells(value);
  const face = cells[shapeFor(value).faceIndex];
  const look = lookFor(value, wardrobe);

  ctx.save();
  ctx.translate(face.x * U, face.y * U);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  drawHeadBehind(ctx, look, time, sansObjets);
  if (decor) decor.draw(ctx, look, base, sansObjets);
  else drawHeadDecor(ctx, look, base, sansObjets);
  drawHeadLive(ctx, look, base, pose, time, sansObjets);

  ctx.restore();
}

// --- outils de tracé ------------------------------------------------------

function poly(ctx: CanvasRenderingContext2D, points: Array<[number, number]>) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

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

/** Reflet en haut à gauche : c'est lui qui fait passer une forme pour un objet. */
function lustre(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha = 0.3) {
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.6, -0.5, 0, Math.PI * 2);
  ctx.fill();
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

function drawHat(ctx: CanvasRenderingContext2D, kind: HatKind, ink: Ink) {
  switch (kind) {
    case 'couronne': {
      const base = TOP + U * 0.09;
      const pointe = base - U * 0.24;
      const demi = U * 0.42;
      const g = ctx.createLinearGradient(0, pointe, 0, base);
      g.addColorStop(0, '#FFE9A0');
      g.addColorStop(1, MAT.or);
      poly(ctx, [
        [-demi, base],
        [-demi, base - U * 0.09],
        [-demi * 0.52, pointe + U * 0.1],
        [0, pointe],
        [demi * 0.52, pointe + U * 0.1],
        [demi, base - U * 0.09],
        [demi, base],
      ]);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = MAT.orOmbre;
      ctx.lineWidth = U * 0.035;
      ctx.stroke();
      // Trois gemmes sur le bandeau : c'est ce qui la sort du bijou de carton.
      const gemmes = [MAT.rouge, MAT.ciel, MAT.feuille];
      gemmes.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc((i - 1) * U * 0.22, base - U * 0.045, U * 0.045, 0, Math.PI * 2);
        ctx.fill();
        lustre(ctx, (i - 1) * U * 0.22 - U * 0.012, base - U * 0.06, U * 0.02, 0.6);
      });
      break;
    }

    case 'etoile':
      star(ctx, U * 0.33, TOP - U * 0.01, U * 0.16, MAT.or, MAT.orOmbre);
      break;

    case 'plume':
      ctx.fillStyle = MAT.feuille;
      ctx.beginPath();
      ctx.moveTo(U * 0.26, TOP + U * 0.14);
      ctx.quadraticCurveTo(U * 0.3, TOP - U * 0.12, U * 0.48, TOP - U * 0.26);
      ctx.quadraticCurveTo(U * 0.44, TOP - U * 0.02, U * 0.36, TOP + U * 0.15);
      ctx.closePath();
      ctx.fill();
      // Nervure : sans elle, la plume passait pour une flamme de bougie.
      ctx.strokeStyle = MAT.feuilleOmbre;
      ctx.lineWidth = U * 0.028;
      ctx.beginPath();
      ctx.moveTo(U * 0.3, TOP + U * 0.14);
      ctx.quadraticCurveTo(U * 0.36, TOP - U * 0.08, U * 0.47, TOP - U * 0.25);
      ctx.stroke();
      ctx.fillStyle = MAT.bois;
      ctx.beginPath();
      ctx.roundRect(-U * 0.44, TOP - U * 0.03, U * 0.88, U * 0.13, U * 0.06);
      ctx.fill();
      break;

    case 'casquette': {
      // Visière tournée d'un côté, plus sombre et bien débordante : de face et
      // du même ton que la calotte, une casquette n'était qu'une bosse.
      ctx.fillStyle = MAT.denimOmbre;
      ctx.beginPath();
      ctx.ellipse(U * 0.34, TOP + U * 0.03, U * 0.3, U * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
      const g = ctx.createLinearGradient(0, TOP - U * 0.24, 0, TOP + U * 0.04);
      g.addColorStop(0, '#6E9AD0');
      g.addColorStop(1, MAT.denim);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, TOP + U * 0.04, U * 0.36, U * 0.26, 0, Math.PI, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = MAT.denimOmbre;
      ctx.lineWidth = U * 0.03;
      ctx.beginPath();
      ctx.moveTo(0, TOP - U * 0.22);
      ctx.lineTo(0, TOP + U * 0.04);
      ctx.stroke();
      ctx.fillStyle = MAT.denimOmbre;
      ctx.beginPath();
      ctx.arc(0, TOP - U * 0.22, U * 0.04, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'bonnet': {
      const g = ctx.createLinearGradient(0, TOP - U * 0.26, 0, TOP + U * 0.08);
      g.addColorStop(0, '#F07A6C');
      g.addColorStop(1, MAT.laine);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, TOP + U * 0.01, U * 0.34, U * 0.26, 0, Math.PI, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = MAT.laineOmbre;
      ctx.beginPath();
      ctx.roundRect(-U * 0.4, TOP - U * 0.06, U * 0.8, U * 0.14, U * 0.07);
      ctx.fill();
      // Côtes du revers : c'est ce qui fait la laine plutôt que le plastique.
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = U * 0.025;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(i * U * 0.1, TOP - U * 0.045);
        ctx.lineTo(i * U * 0.1, TOP + U * 0.065);
        ctx.stroke();
      }
      ctx.fillStyle = MAT.creme;
      ctx.beginPath();
      ctx.arc(0, TOP - U * 0.3, U * 0.1, 0, Math.PI * 2);
      ctx.fill();
      lustre(ctx, -U * 0.03, TOP - U * 0.33, U * 0.04, 0.5);
      break;
    }

    case 'fete':
      ctx.fillStyle = MAT.jaune;
      poly(ctx, [
        [-U * 0.24, TOP + U * 0.06],
        [0, TOP - U * 0.34],
        [U * 0.24, TOP + U * 0.06],
      ]);
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = MAT.rose;
      ctx.lineWidth = U * 0.06;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(-U * 0.3, TOP - U * 0.28 + i * U * 0.11);
        ctx.lineTo(U * 0.3, TOP - U * 0.34 + i * U * 0.11);
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = MAT.blanc;
      ctx.beginPath();
      ctx.arc(0, TOP - U * 0.38, U * 0.08, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'sorcier': {
      ctx.fillStyle = MAT.nuitOmbre;
      ctx.beginPath();
      ctx.ellipse(0, TOP + U * 0.04, U * 0.52, U * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      const g = ctx.createLinearGradient(-U * 0.2, TOP - U * 0.5, U * 0.2, TOP + U * 0.04);
      g.addColorStop(0, '#6A57B4');
      g.addColorStop(1, MAT.nuit);
      ctx.fillStyle = g;
      // La pointe ploie : un cône droit fait bonnet d'âne, pas magicien.
      ctx.beginPath();
      ctx.moveTo(-U * 0.26, TOP + U * 0.04);
      ctx.quadraticCurveTo(-U * 0.2, TOP - U * 0.3, U * 0.14, TOP - U * 0.5);
      ctx.quadraticCurveTo(U * 0.14, TOP - U * 0.24, U * 0.26, TOP + U * 0.04);
      ctx.closePath();
      ctx.fill();
      star(ctx, -U * 0.05, TOP - U * 0.16, U * 0.07, MAT.or);
      star(ctx, U * 0.09, TOP - U * 0.32, U * 0.05, MAT.or);
      break;
    }

    case 'hautForme': {
      ctx.fillStyle = MAT.noir;
      ctx.beginPath();
      ctx.ellipse(0, TOP + U * 0.03, U * 0.46, U * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = MAT.noirClair;
      ctx.beginPath();
      ctx.roundRect(-U * 0.26, TOP - U * 0.4, U * 0.52, U * 0.45, U * 0.05);
      ctx.fill();
      ctx.fillStyle = MAT.rouge;
      ctx.fillRect(-U * 0.26, TOP - U * 0.09, U * 0.52, U * 0.1);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.fillRect(-U * 0.22, TOP - U * 0.38, U * 0.07, U * 0.27);
      break;
    }

    case 'viking': {
      ctx.fillStyle = MAT.creme;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * U * 0.3, TOP - U * 0.06);
        ctx.quadraticCurveTo(s * U * 0.56, TOP - U * 0.12, s * U * 0.5, TOP - U * 0.34);
        ctx.quadraticCurveTo(s * U * 0.4, TOP - U * 0.16, s * U * 0.28, TOP + U * 0.02);
        ctx.closePath();
        ctx.fill();
      }
      const g = ctx.createLinearGradient(0, TOP - U * 0.26, 0, TOP + U * 0.06);
      g.addColorStop(0, '#E4EAF4');
      g.addColorStop(1, MAT.metalOmbre);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, TOP + U * 0.05, U * 0.33, U * 0.26, 0, Math.PI, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = MAT.metalOmbre;
      ctx.fillRect(-U * 0.36, TOP + U * 0.01, U * 0.72, U * 0.06);
      ctx.fillRect(-U * 0.035, TOP - U * 0.22, U * 0.07, U * 0.24);
      break;
    }

    case 'chat':
      for (const s of [-1, 1]) {
        ctx.fillStyle = MAT.noirClair;
        poly(ctx, [
          [s * U * 0.1, TOP + U * 0.05],
          [s * U * 0.26, TOP - U * 0.3],
          [s * U * 0.42, TOP + U * 0.02],
        ]);
        ctx.fill();
        ctx.fillStyle = MAT.rose;
        poly(ctx, [
          [s * U * 0.18, TOP + U * 0.02],
          [s * U * 0.26, TOP - U * 0.18],
          [s * U * 0.34, TOP + U * 0.01],
        ]);
        ctx.fill();
      }
      break;

    case 'bois':
      ctx.strokeStyle = MAT.bois;
      ctx.lineWidth = U * 0.06;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * U * 0.16, TOP + U * 0.04);
        ctx.quadraticCurveTo(s * U * 0.3, TOP - U * 0.2, s * U * 0.26, TOP - U * 0.42);
        ctx.moveTo(s * U * 0.25, TOP - U * 0.14);
        ctx.lineTo(s * U * 0.46, TOP - U * 0.26);
        ctx.moveTo(s * U * 0.28, TOP - U * 0.3);
        ctx.lineTo(s * U * 0.44, TOP - U * 0.44);
        ctx.stroke();
      }
      break;

    case 'fleurs': {
      ctx.fillStyle = MAT.feuilleOmbre;
      ctx.lineWidth = U * 0.05;
      ctx.strokeStyle = MAT.feuille;
      ctx.beginPath();
      ctx.ellipse(0, TOP + U * 0.02, U * 0.4, U * 0.14, 0, Math.PI, 2 * Math.PI);
      ctx.stroke();
      const petales = [
        [-U * 0.3, TOP - U * 0.03, MAT.blanc],
        [0, TOP - U * 0.12, MAT.rose],
        [U * 0.3, TOP - U * 0.03, MAT.blanc],
      ] as const;
      for (const [x, y, couleur] of petales) {
        ctx.fillStyle = couleur;
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          ctx.beginPath();
          ctx.ellipse(x + Math.cos(a) * U * 0.06, y + Math.sin(a) * U * 0.06, U * 0.05, U * 0.05, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = MAT.or;
        ctx.beginPath();
        ctx.arc(x, y, U * 0.045, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case 'chantier': {
      const g = ctx.createLinearGradient(0, TOP - U * 0.26, 0, TOP + U * 0.06);
      g.addColorStop(0, '#FFDE73');
      g.addColorStop(1, MAT.jauneOmbre);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, TOP + U * 0.04, U * 0.34, U * 0.26, 0, Math.PI, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = MAT.jaune;
      ctx.beginPath();
      ctx.ellipse(0, TOP + U * 0.05, U * 0.46, U * 0.09, 0, Math.PI, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = MAT.jauneOmbre;
      ctx.fillRect(-U * 0.03, TOP - U * 0.22, U * 0.06, U * 0.25);
      break;
    }

    case 'bandana': {
      ctx.fillStyle = MAT.rouge;
      ctx.beginPath();
      ctx.moveTo(-U * 0.42, TOP + U * 0.1);
      ctx.quadraticCurveTo(0, TOP - U * 0.22, U * 0.42, TOP + U * 0.1);
      ctx.quadraticCurveTo(0, TOP + U * 0.04, -U * 0.42, TOP + U * 0.1);
      ctx.closePath();
      ctx.fill();
      // Le nœud sur le côté : de face, un bandana n'est qu'un bandeau.
      ctx.beginPath();
      ctx.moveTo(-U * 0.4, TOP + U * 0.04);
      ctx.lineTo(-U * 0.56, TOP + U * 0.16);
      ctx.lineTo(-U * 0.38, TOP + U * 0.16);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = MAT.blanc;
      for (const [x, y] of [
        [-U * 0.24, TOP - U * 0.02],
        [0, TOP - U * 0.08],
        [U * 0.24, TOP - U * 0.02],
      ]) {
        ctx.beginPath();
        ctx.arc(x, y, U * 0.032, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
  }
  void ink;
}

/** Les chapeaux qui bougent : ils ne peuvent pas passer par le cache. */
function drawAnimatedHat(ctx: CanvasRenderingContext2D, kind: HatKind, time: number) {
  if (kind === 'helice') {
    ctx.fillStyle = MAT.rouge;
    ctx.beginPath();
    ctx.ellipse(0, TOP + U * 0.06, U * 0.3, U * 0.2, 0, Math.PI, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = MAT.ciel;
    ctx.beginPath();
    ctx.roundRect(-U * 0.34, TOP + U * 0.01, U * 0.68, U * 0.08, U * 0.04);
    ctx.fill();
    ctx.fillStyle = MAT.jaune;
    ctx.beginPath();
    ctx.arc(0, TOP - U * 0.16, U * 0.04, 0, Math.PI * 2);
    ctx.fill();
    // L'hélice tourne : c'est le seul détail qui se remarque à travers la pièce.
    ctx.save();
    ctx.translate(0, TOP - U * 0.19);
    ctx.rotate(time / 260);
    ctx.fillStyle = MAT.blanc;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(s * U * 0.16, 0, U * 0.16, U * 0.045, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = MAT.rougeOmbre;
    ctx.beginPath();
    ctx.arc(0, 0, U * 0.035, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  if (kind === 'aureole') {
    const flotte = Math.sin(time / 520) * U * 0.035;
    ctx.save();
    ctx.translate(0, TOP - U * 0.24 + flotte);
    ctx.strokeStyle = MAT.or;
    ctx.lineWidth = U * 0.075;
    ctx.beginPath();
    ctx.ellipse(0, 0, U * 0.28, U * 0.085, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 245, 190, 0.55)';
    ctx.lineWidth = U * 0.15;
    ctx.beginPath();
    ctx.ellipse(0, 0, U * 0.28, U * 0.085, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// --- lunettes -------------------------------------------------------------

function drawGlasses(ctx: CanvasRenderingContext2D, kind: GlassKind, ink: Ink, time: number) {
  if (kind === 'cache') {
    // Un seul œil couvert : la sangle traverse toute la tête, sinon le cache
    // a l'air posé là par hasard.
    ctx.strokeStyle = MAT.noir;
    ctx.lineWidth = U * 0.045;
    ctx.beginPath();
    ctx.moveTo(-U * 0.5, EYE_Y - U * 0.16);
    ctx.lineTo(U * 0.5, EYE_Y - U * 0.06);
    ctx.stroke();
    ctx.fillStyle = MAT.noir;
    ctx.beginPath();
    ctx.ellipse(-EYE_X, EYE_Y, U * 0.19, U * 0.17, 0, 0, Math.PI * 2);
    ctx.fill();
    lustre(ctx, -EYE_X - U * 0.05, EYE_Y - U * 0.06, U * 0.05, 0.18);
    return;
  }

  if (kind === 'plongee') {
    ctx.fillStyle = MAT.rouge;
    ctx.beginPath();
    ctx.roundRect(-U * 0.42, EYE_Y - U * 0.24, U * 0.84, U * 0.44, U * 0.14);
    ctx.fill();
    ctx.fillStyle = 'rgba(150, 220, 245, 0.72)';
    ctx.beginPath();
    ctx.roundRect(-U * 0.36, EYE_Y - U * 0.18, U * 0.72, U * 0.32, U * 0.1);
    ctx.fill();
    ctx.strokeStyle = MAT.rougeOmbre;
    ctx.lineWidth = U * 0.04;
    ctx.beginPath();
    ctx.moveTo(0, EYE_Y - U * 0.18);
    ctx.lineTo(0, EYE_Y + U * 0.14);
    ctx.stroke();
    // Tuba : c'est lui qui dit « plongée » et pas « ski ».
    ctx.strokeStyle = MAT.jaune;
    ctx.lineWidth = U * 0.07;
    ctx.beginPath();
    ctx.moveTo(U * 0.42, EYE_Y + U * 0.12);
    ctx.quadraticCurveTo(U * 0.56, EYE_Y - U * 0.05, U * 0.5, EYE_Y - U * 0.3);
    ctx.stroke();
    lustre(ctx, -U * 0.2, EYE_Y - U * 0.08, U * 0.09, 0.5);
    return;
  }

  const r = U * 0.2;
  const monture = kind === 'carrees' ? MAT.bois : kind === 'coeur' ? MAT.rose : ink.dark;
  ctx.strokeStyle = monture;
  ctx.lineWidth = U * 0.045;

  ctx.beginPath();
  ctx.moveTo(-EYE_X + r * 0.8, EYE_Y);
  ctx.lineTo(EYE_X - r * 0.8, EYE_Y);
  ctx.moveTo(-EYE_X - r, EYE_Y - U * 0.02);
  ctx.lineTo(-EYE_X - r - U * 0.14, EYE_Y - U * 0.06);
  ctx.moveTo(EYE_X + r, EYE_Y - U * 0.02);
  ctx.lineTo(EYE_X + r + U * 0.14, EYE_Y - U * 0.06);
  ctx.stroke();

  for (const s of [-1, 1]) {
    ctx.beginPath();
    if (kind === 'carrees') {
      ctx.roundRect(s * EYE_X - r, EYE_Y - r * 0.85, 2 * r, 1.7 * r, U * 0.05);
    } else if (kind === 'coeur') {
      coeur(ctx, s * EYE_X, EYE_Y, r * 0.95);
    } else {
      ctx.arc(s * EYE_X, EYE_Y, r, 0, Math.PI * 2);
    }
    if (kind === 'soleil') {
      ctx.fillStyle = 'rgba(18, 22, 34, 0.9)';
      ctx.fill();
    } else if (kind === 'coeur') {
      ctx.fillStyle = 'rgba(245, 139, 176, 0.3)';
      ctx.fill();
    }
    ctx.stroke();
  }

  if (kind === 'soleil') {
    // Un reflet qui balaie le verre : c'est ce qui les rend vivantes.
    const t = ((time / 1400) % 1) * 2 - 1;
    ctx.save();
    ctx.beginPath();
    for (const s of [-1, 1]) ctx.arc(s * EYE_X, EYE_Y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = U * 0.07;
    ctx.beginPath();
    ctx.moveTo(t * U * 0.7 - U * 0.1, EYE_Y - r);
    ctx.lineTo(t * U * 0.7 + U * 0.1, EYE_Y + r);
    ctx.stroke();
    ctx.restore();
    return;
  }

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

function drawScarf(ctx: CanvasRenderingContext2D, kind: ScarfKind) {
  switch (kind) {
    case 'echarpe':
      ctx.fillStyle = MAT.laine;
      ctx.beginPath();
      ctx.roundRect(-U * 0.46, NECK - U * 0.05, U * 0.92, U * 0.13, U * 0.06);
      ctx.fill();
      // Un pan qui pend : sans lui, l'écharpe n'est qu'une barre.
      ctx.beginPath();
      ctx.roundRect(U * 0.16, NECK + U * 0.02, U * 0.13, U * 0.18, U * 0.05);
      ctx.fill();
      ctx.fillStyle = MAT.creme;
      for (const x of [-U * 0.32, -U * 0.06, U * 0.2]) {
        ctx.fillRect(x, NECK - U * 0.05, U * 0.06, U * 0.13);
      }
      ctx.fillRect(U * 0.18, NECK + U * 0.12, U * 0.09, U * 0.05);
      break;

    case 'noeud':
      ctx.fillStyle = MAT.rouge;
      poly(ctx, [
        [0, NECK],
        [-U * 0.19, NECK - U * 0.11],
        [-U * 0.19, NECK + U * 0.11],
      ]);
      ctx.fill();
      poly(ctx, [
        [0, NECK],
        [U * 0.19, NECK - U * 0.11],
        [U * 0.19, NECK + U * 0.11],
      ]);
      ctx.fill();
      ctx.fillStyle = MAT.blanc;
      for (const [x, y] of [
        [-U * 0.13, NECK - U * 0.03],
        [-U * 0.11, NECK + U * 0.05],
        [U * 0.13, NECK - U * 0.03],
        [U * 0.11, NECK + U * 0.05],
      ]) {
        ctx.beginPath();
        ctx.arc(x, y, U * 0.022, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = MAT.rougeOmbre;
      ctx.beginPath();
      ctx.arc(0, NECK, U * 0.048, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'foulard':
      ctx.fillStyle = MAT.ciel;
      ctx.beginPath();
      ctx.moveTo(-U * 0.3, NECK - U * 0.06);
      ctx.lineTo(U * 0.3, NECK - U * 0.06);
      ctx.quadraticCurveTo(U * 0.12, NECK + U * 0.2, 0, NECK + U * 0.22);
      ctx.quadraticCurveTo(-U * 0.12, NECK + U * 0.2, -U * 0.3, NECK - U * 0.06);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.beginPath();
      ctx.roundRect(-U * 0.32, NECK - U * 0.1, U * 0.64, U * 0.07, U * 0.03);
      ctx.fill();
      break;

    case 'colRoule': {
      const g = ctx.createLinearGradient(0, NECK - U * 0.1, 0, NECK + U * 0.14);
      g.addColorStop(0, '#7E8AA8');
      g.addColorStop(1, '#5A6482');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(-U * 0.34, NECK - U * 0.1, U * 0.68, U * 0.24, U * 0.09);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = U * 0.025;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * U * 0.12, NECK - U * 0.08);
        ctx.lineTo(i * U * 0.12, NECK + U * 0.12);
        ctx.stroke();
      }
      break;
    }

    case 'medaille': {
      ctx.strokeStyle = MAT.ciel;
      ctx.lineWidth = U * 0.05;
      ctx.beginPath();
      ctx.moveTo(-U * 0.18, NECK - U * 0.12);
      ctx.lineTo(0, NECK + U * 0.06);
      ctx.lineTo(U * 0.18, NECK - U * 0.12);
      ctx.stroke();
      const g = ctx.createRadialGradient(-U * 0.03, NECK + U * 0.09, 0, 0, NECK + U * 0.12, U * 0.13);
      g.addColorStop(0, '#FFF0BB');
      g.addColorStop(1, MAT.or);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, NECK + U * 0.13, U * 0.11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = MAT.orOmbre;
      ctx.lineWidth = U * 0.025;
      ctx.stroke();
      star(ctx, 0, NECK + U * 0.13, U * 0.055, MAT.orOmbre);
      break;
    }
  }
}

/** La cape flotte derrière le personnage : elle passe avant tout le reste. */
function drawCape(ctx: CanvasRenderingContext2D, time: number) {
  const vague = Math.sin(time / 420) * U * 0.05;
  // De face, une cape ne se voit que par son col et ses pans sur les côtés.
  // Peinte en plein, elle faisait une bavette rouge au milieu du bloc.
  ctx.fillStyle = MAT.rougeOmbre;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * U * 0.26, NECK - U * 0.06);
    ctx.quadraticCurveTo(
      s * (U * 0.64 + vague),
      NECK + U * 0.3,
      s * (U * 0.52 + vague),
      NECK + U * 0.82,
    );
    ctx.quadraticCurveTo(s * U * 0.36, NECK + U * 0.52, s * U * 0.2, NECK + U * 0.12);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = MAT.rouge;
  ctx.beginPath();
  ctx.roundRect(-U * 0.32, NECK - U * 0.11, U * 0.64, U * 0.13, U * 0.065);
  ctx.fill();
}
