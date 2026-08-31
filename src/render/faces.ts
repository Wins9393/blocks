import { MAX_VALUE, UNIT } from '../core/constants';
import { shade } from '../core/palette';
import { centeredCells, shapeFor } from '../core/shape';

/**
 * Les personnages.
 *
 * Chaque nombre porte une tête reconnaissable. La couleur seule ne suffisait
 * pas — deux blocs de la même famille de teintes se confondent de loin, et un
 * enfant retient bien mieux « le moustachu » que « le jaune orangé ».
 *
 * Les têtes livrées ne sont que des réglages par défaut : chaque espace peut
 * rhabiller ses blocs pièce par pièce (`Wardrobe`). Seule la couleur reste
 * fixe, c'est elle qui identifie le nombre quoi qu'il arrive.
 *
 * Une règle traverse la série : ce que le 10 porte sur la tête marque une
 * dizaine. Les nombres de 11 à 20 le portent avec le visage de leur unité. On
 * lit la décomposition sur le personnage.
 */

const U = UNIT;

export type EyeKind = 'ronds' | 'grands' | 'malins' | 'endormis' | 'etoiles';
export type BrowKind = 'rien' | 'arcs' | 'droits' | 'hauts' | 'epais';
export type MouthKind = 'sourire' | 'large' | 'rond' | 'dent' | 'coin' | 'trait' | 'langue';
export type HairKind =
  | 'rien'
  | 'epi'
  | 'couettes'
  | 'pics'
  | 'carre'
  | 'boucles'
  | 'chignon'
  | 'meche';
export type HatKind = 'rien' | 'couronne' | 'casquette' | 'bonnet' | 'fete' | 'plume' | 'etoile';
export type GlassKind = 'rien' | 'rondes' | 'carrees' | 'soleil';
export type StacheKind = 'rien' | 'moustache' | 'barbe';
export type CheekKind = 'rien' | 'roses' | 'taches' | 'deux';
export type ScarfKind = 'rien' | 'echarpe' | 'noeud' | 'foulard';

export interface Look {
  eyes: EyeKind;
  brows: BrowKind;
  mouth: MouthKind;
  hair: HairKind;
  hat: HatKind;
  glasses: GlassKind;
  stache: StacheKind;
  cheeks: CheekKind;
  scarf: ScarfKind;
}

export type SlotKey = keyof Look;

/** Ce qu'un espace a changé, pièce par pièce, pour les blocs de 1 à 10. */
export type Wardrobe = Record<number, Partial<Look>>;

/** Une tenue entièrement résolue : plus aucune pièce laissée au défaut. */
export type ResolvedLook = Look;

export interface Slot {
  key: SlotKey;
  label: string;
  options: readonly string[];
}

/** Le vestiaire, dans l'ordre des onglets de l'atelier. */
export const SLOTS: readonly Slot[] = [
  { key: 'eyes', label: 'Yeux', options: ['ronds', 'grands', 'malins', 'endormis', 'etoiles'] },
  { key: 'brows', label: 'Sourcils', options: ['rien', 'arcs', 'droits', 'hauts', 'epais'] },
  {
    key: 'mouth',
    label: 'Bouche',
    options: ['sourire', 'large', 'rond', 'dent', 'coin', 'trait', 'langue'],
  },
  {
    key: 'hair',
    label: 'Cheveux',
    options: ['rien', 'epi', 'couettes', 'pics', 'carre', 'boucles', 'chignon', 'meche'],
  },
  {
    key: 'hat',
    label: 'Chapeau',
    options: ['rien', 'couronne', 'casquette', 'bonnet', 'fete', 'plume', 'etoile'],
  },
  { key: 'glasses', label: 'Lunettes', options: ['rien', 'rondes', 'carrees', 'soleil'] },
  { key: 'stache', label: 'Moustache', options: ['rien', 'moustache', 'barbe'] },
  { key: 'cheeks', label: 'Joues', options: ['rien', 'roses', 'taches', 'deux'] },
  { key: 'scarf', label: 'Écharpe', options: ['rien', 'echarpe', 'noeud', 'foulard'] },
];

const DEFAULTS: Record<number, Look> = {
  1: mk({ mouth: 'rond', hair: 'epi', cheeks: 'deux' }),
  2: mk({ eyes: 'grands', mouth: 'large', hair: 'couettes', cheeks: 'roses' }),
  3: mk({ brows: 'arcs', hair: 'pics', stache: 'moustache' }),
  4: mk({ brows: 'droits', mouth: 'trait', hair: 'carre' }),
  5: mk({ eyes: 'grands', mouth: 'langue', hair: 'meche', hat: 'etoile' }),
  6: mk({ mouth: 'dent', hair: 'boucles', cheeks: 'taches' }),
  7: mk({ eyes: 'malins', brows: 'arcs', mouth: 'coin', hat: 'plume' }),
  8: mk({ hair: 'meche', glasses: 'rondes' }),
  9: mk({ eyes: 'grands', brows: 'hauts', mouth: 'large', hair: 'chignon', cheeks: 'roses' }),
  10: mk({ mouth: 'langue', hat: 'couronne', cheeks: 'roses' }),
};

function mk(patch: Partial<Look>): Look {
  return {
    eyes: 'ronds',
    brows: 'rien',
    mouth: 'sourire',
    hair: 'rien',
    hat: 'rien',
    glasses: 'rien',
    stache: 'rien',
    cheeks: 'rien',
    scarf: 'rien',
    ...patch,
  };
}

/** La tenue livrée d'origine, sans les réglages de l'espace. */
export function defaultLook(value: number): Look {
  return DEFAULTS[Math.min(10, Math.max(1, Math.round(value)))];
}

/**
 * La tenue d'un nombre, réglages de l'espace compris.
 *
 * Au-dessus de dix, le personnage garde son visage d'unité et coiffe le
 * chapeau du 10 : c'est ce chapeau, quel qu'il soit, qui marque la dizaine.
 */
export function lookFor(value: number, wardrobe?: Wardrobe): ResolvedLook {
  const v = Math.min(MAX_VALUE, Math.max(1, Math.round(value)));
  if (v <= 10) return { ...DEFAULTS[v], ...(wardrobe?.[v] ?? {}) };
  const unite = lookFor(v - 10, wardrobe);
  return { ...unite, hat: lookFor(10, wardrobe).hat };
}

/** Ne garde d'une sauvegarde que des pièces qui existent encore. */
export function cleanWardrobe(raw: unknown): Wardrobe {
  const out: Wardrobe = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(key);
    if (!Number.isInteger(n) || n < 1 || n > 10) continue;
    if (!value || typeof value !== 'object') continue;
    const patch: Record<string, string> = {};
    for (const slot of SLOTS) {
      const pick = (value as Record<string, unknown>)[slot.key];
      if (typeof pick === 'string' && slot.options.includes(pick)) patch[slot.key] = pick;
    }
    if (Object.keys(patch).length) out[n] = patch as Partial<Look>;
  }
  return out;
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
const WHITE = '#fdfdfd';

/** Haut de la case qui porte le visage, dans le repère de cette case. */
const TOP = -U * 0.5;
const EYE_X = U * 0.21;
const EYE_Y = -U * 0.07;
/** Ligne où se pose ce qu'on met autour du cou. */
const NECK = U * 0.42;

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

// --- assemblage -----------------------------------------------------------

/**
 * Tout ce qui ne bouge jamais. Rien ici ne recouvre les yeux, ce qui permet
 * de le peindre une fois pour toutes et de le poser sous le regard.
 */
export function drawHeadDecor(ctx: CanvasRenderingContext2D, look: ResolvedLook, base: string) {
  const ink = inkFor(base);
  drawHair(ctx, look.hair, ink);
  if (look.hat !== 'rien') hatPart(ctx, look.hat, ink);
  if (look.scarf !== 'rien') drawScarf(ctx, look.scarf, ink);
  if (look.cheeks === 'roses' || look.cheeks === 'deux') drawBlush(ctx);
  if (look.cheeks === 'taches' || look.cheeks === 'deux') drawFreckles(ctx, ink);
  // La barbe entoure la bouche : elle passe dessous, sinon elle l'avale.
  if (look.stache === 'barbe') drawBeard(ctx, ink);
  drawMouth(ctx, look, ink);
  if (look.stache !== 'rien') drawMoustache(ctx, ink);
  if (look.brows !== 'rien') drawBrows(ctx, look.brows, ink);
}

/** Ce qui vit : le regard, et les verres qui le couvrent. */
export function drawHeadLive(
  ctx: CanvasRenderingContext2D,
  look: ResolvedLook,
  base: string,
  pose: Pose,
) {
  const ink = inkFor(base);
  drawEyes(ctx, look.eyes, ink, pose);
  if (look.glasses !== 'rien') drawGlasses(ctx, look.glasses, ink);
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
const DECOR_HALF_W = U * 0.64;
const DECOR_TOP = -U * 1.0;
const DECOR_BOTTOM = U * 0.64;

/** De quoi savoir si deux tenues donnent le même dessin. */
export function lookSignature(look: ResolvedLook): string {
  return SLOTS.map((s) => look[s.key]).join('.');
}

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

/**
 * Le personnage sur son bloc. Sans `decor`, tout est tracé au trait : c'est ce
 * qu'il faut pour les vignettes, dessinées une fois et parfois très réduites.
 */
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  value: number,
  base: string,
  pose: Pose = NEUTRAL,
  decor?: DecorCache,
  wardrobe?: Wardrobe,
) {
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

    ctx.fillStyle = WHITE;
    ctx.beginPath();
    ctx.ellipse(ex, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    const px = ex + pose.gazeX;
    const py = cy + pose.gazeY;
    ctx.fillStyle = ink.dark;
    if (kind === 'etoiles') {
      star(ctx, px, py, U * 0.085 * open + 0.4, ink.dark, ink.dark);
    } else {
      ctx.beginPath();
      ctx.ellipse(px, py, U * geo.px, U * geo.py * open + 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (open > 0.45 && kind !== 'etoiles') {
      ctx.fillStyle = `rgba(255, 255, 255, ${(0.9 * open).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(px - U * 0.024, py - U * 0.032, U * 0.024, 0, Math.PI * 2);
      ctx.fill();
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
  ctx.lineWidth = kind === 'epais' ? U * 0.085 : U * 0.055;
  const y = EYE_Y - (kind === 'hauts' ? U * 0.29 : U * 0.22);
  const demi = U * 0.1;

  for (const s of [-1, 1]) {
    const cx = s * EYE_X;
    ctx.beginPath();
    if (kind === 'droits') {
      ctx.moveTo(cx - demi, y);
      ctx.lineTo(cx + demi, y);
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
  // La moustache occupe le haut de la lèvre : la bouche descend d'un cran.
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
      ctx.fillStyle = WHITE;
      ctx.beginPath();
      ctx.roundRect(-U * 0.055, y - U * 0.035, U * 0.11, U * 0.075, U * 0.02);
      ctx.fill();
      break;

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
      ctx.fillStyle = TONGUE;
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

    case 'couettes':
      // Bandeau : sans lui, les couettes flottent à côté de la tête.
      ctx.beginPath();
      ctx.ellipse(0, TOP + U * 0.02, U * 0.38, U * 0.12, 0, Math.PI, 2 * Math.PI);
      ctx.fill();
      // Dressées : posées sur les côtés, elles passaient pour des oreilles.
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
  }
}

// --- chapeaux -------------------------------------------------------------

function hatPart(ctx: CanvasRenderingContext2D, kind: HatKind, ink: Ink) {
  switch (kind) {
    case 'rien':
      break;

    case 'couronne': {
      const base = TOP + U * 0.09;
      const pointe = base - U * 0.22;
      const demi = U * 0.42;
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
      break;
    }

    case 'casquette':
      // Visière tournée d'un côté, plus sombre et bien débordante : de face et
      // du même ton que la calotte, une casquette n'était qu'une bosse.
      ctx.fillStyle = ink.dark;
      ctx.beginPath();
      ctx.ellipse(U * 0.34, TOP + U * 0.03, U * 0.3, U * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ink.hair;
      ctx.beginPath();
      ctx.ellipse(0, TOP + U * 0.04, U * 0.36, U * 0.26, 0, Math.PI, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.beginPath();
      ctx.arc(-U * 0.1, TOP - U * 0.08, U * 0.06, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'bonnet':
      ctx.fillStyle = ink.hair;
      ctx.beginPath();
      ctx.ellipse(0, TOP + U * 0.01, U * 0.34, U * 0.26, 0, Math.PI, 2 * Math.PI);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(-U * 0.4, TOP - U * 0.06, U * 0.8, U * 0.13, U * 0.06);
      ctx.fill();
      ctx.fillStyle = WHITE;
      ctx.beginPath();
      ctx.arc(0, TOP - U * 0.26, U * 0.09, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'fete':
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      ctx.moveTo(-U * 0.24, TOP + U * 0.06);
      ctx.lineTo(0, TOP - U * 0.34);
      ctx.lineTo(U * 0.24, TOP + U * 0.06);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = GOLD_DARK;
      ctx.lineWidth = U * 0.04;
      ctx.beginPath();
      ctx.moveTo(-U * 0.17, TOP - U * 0.05);
      ctx.lineTo(U * 0.05, TOP - U * 0.12);
      ctx.moveTo(-U * 0.1, TOP - U * 0.16);
      ctx.lineTo(U * 0.06, TOP - U * 0.21);
      ctx.stroke();
      ctx.fillStyle = WHITE;
      ctx.beginPath();
      ctx.arc(0, TOP - U * 0.37, U * 0.07, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'plume':
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
      ctx.roundRect(-U * 0.44, TOP - U * 0.03, U * 0.88, U * 0.13, U * 0.06);
      ctx.fill();
      break;

    case 'etoile':
      star(ctx, U * 0.33, TOP - U * 0.01, U * 0.16, GOLD, GOLD_DARK);
      break;
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
  if (edge !== fill) {
    ctx.strokeStyle = edge;
    ctx.lineWidth = U * 0.03;
    ctx.stroke();
  }
}

// --- lunettes -------------------------------------------------------------

function drawGlasses(ctx: CanvasRenderingContext2D, kind: GlassKind, ink: Ink) {
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
    if (kind === 'carrees') {
      ctx.roundRect(s * EYE_X - r, EYE_Y - r * 0.85, 2 * r, 1.7 * r, U * 0.05);
    } else {
      ctx.arc(s * EYE_X, EYE_Y, r, 0, Math.PI * 2);
    }
    if (kind === 'soleil') {
      ctx.fillStyle = 'rgba(18, 22, 34, 0.88)';
      ctx.fill();
    }
    ctx.stroke();
  }

  // Éclat en travers du verre : sans lui, les cercles ne lisent pas comme du verre.
  ctx.save();
  ctx.strokeStyle = kind === 'soleil' ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = U * 0.05;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(s * EYE_X, EYE_Y, r * 0.62, -Math.PI * 0.95, -Math.PI * 0.55);
    ctx.stroke();
  }
  ctx.restore();
}

// --- moustache, barbe -----------------------------------------------------

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

function drawBeard(ctx: CanvasRenderingContext2D, ink: Ink) {
  ctx.fillStyle = ink.hair;
  ctx.beginPath();
  ctx.moveTo(-U * 0.34, U * 0.16);
  ctx.quadraticCurveTo(-U * 0.36, U * 0.52, 0, U * 0.54);
  ctx.quadraticCurveTo(U * 0.36, U * 0.52, U * 0.34, U * 0.16);
  ctx.quadraticCurveTo(U * 0.18, U * 0.3, 0, U * 0.3);
  ctx.quadraticCurveTo(-U * 0.18, U * 0.3, -U * 0.34, U * 0.16);
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

function drawScarf(ctx: CanvasRenderingContext2D, kind: ScarfKind, ink: Ink) {
  ctx.fillStyle = ink.hair;
  switch (kind) {
    case 'rien':
      break;

    case 'echarpe':
      ctx.beginPath();
      ctx.roundRect(-U * 0.46, NECK - U * 0.05, U * 0.92, U * 0.13, U * 0.06);
      ctx.fill();
      // Un pan qui pend : sans lui, l'écharpe n'est qu'une barre.
      ctx.beginPath();
      ctx.roundRect(U * 0.16, NECK + U * 0.02, U * 0.13, U * 0.16, U * 0.05);
      ctx.fill();
      break;

    case 'noeud':
      ctx.beginPath();
      for (const s of [-1, 1]) {
        ctx.moveTo(0, NECK);
        ctx.lineTo(s * U * 0.19, NECK - U * 0.11);
        ctx.lineTo(s * U * 0.19, NECK + U * 0.11);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = WHITE;
      ctx.beginPath();
      ctx.arc(0, NECK, U * 0.045, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'foulard':
      ctx.beginPath();
      ctx.moveTo(-U * 0.3, NECK - U * 0.06);
      ctx.lineTo(U * 0.3, NECK - U * 0.06);
      ctx.quadraticCurveTo(U * 0.12, NECK + U * 0.2, 0, NECK + U * 0.22);
      ctx.quadraticCurveTo(-U * 0.12, NECK + U * 0.2, -U * 0.3, NECK - U * 0.06);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.beginPath();
      ctx.roundRect(-U * 0.32, NECK - U * 0.1, U * 0.64, U * 0.07, U * 0.03);
      ctx.fill();
      break;
  }
}
