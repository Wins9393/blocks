/**
 * Reconnaissance de gestes, sans dépendance au DOM ni au moteur physique :
 * on pousse des échantillons de pointeur, on récupère des intentions.
 */
import {
  SHAKE_MIN_AMPLITUDE,
  SHAKE_MIN_SPEED,
  SHAKE_PEEL_COOLDOWN,
  SHAKE_REVERSAL_WINDOW,
  SLICE_MIN_LENGTH,
  SLICE_MIN_SPEED,
} from '../core/constants';

export interface Sample {
  x: number;
  y: number;
  t: number;
}

/**
 * Détecte les allers-retours sur un axe. Deux inversions consécutives,
 * assez amples et assez rapides, valent une secousse.
 */
class Axis {
  private dir = 0;
  private extremum = 0;
  private lastReversalT = 0;
  private peakSpeed = 0;
  private prev: { v: number; t: number } | null = null;
  reversals = 0;

  reset(v: number, t: number) {
    this.dir = 0;
    this.extremum = v;
    this.lastReversalT = t;
    this.peakSpeed = 0;
    this.reversals = 0;
    this.prev = { v, t };
  }

  /** Renvoie true si cet axe vient de valider une secousse. */
  push(v: number, t: number): boolean {
    if (!this.prev) {
      this.reset(v, t);
      return false;
    }
    const dt = Math.max(1, t - this.prev.t);
    const speed = (Math.abs(v - this.prev.v) / dt) * 1000; // px/s
    this.peakSpeed = Math.max(this.peakSpeed, speed);

    const moving = Math.abs(v - this.prev.v) > 1.5;
    const sign = moving ? Math.sign(v - this.prev.v) : 0;
    this.prev = { v, t };

    if (sign === 0) return false;
    if (this.dir === 0) {
      this.dir = sign;
      this.extremum = v;
      this.lastReversalT = t;
      return false;
    }
    if (sign === this.dir) return false;

    // Changement de direction : on évalue le demi-cycle qui vient de s'achever.
    const amplitude = Math.abs(v - this.extremum);
    const inTime = t - this.lastReversalT <= SHAKE_REVERSAL_WINDOW;
    const valid = amplitude >= SHAKE_MIN_AMPLITUDE && this.peakSpeed >= SHAKE_MIN_SPEED;

    this.dir = sign;
    this.extremum = v;
    this.lastReversalT = t;
    this.peakSpeed = 0;

    if (!valid) {
      this.reversals = 0;
      return false;
    }
    this.reversals = inTime ? this.reversals + 1 : 1;
    if (this.reversals >= 2) {
      this.reversals = 0;
      return true;
    }
    return false;
  }
}

export class ShakeDetector {
  private x = new Axis();
  private y = new Axis();
  private lastPeelT = -Infinity;
  /** 0..1, pour le rendu : plus l'enfant secoue, plus le bloc tremble. */
  energy = 0;

  reset(s: Sample) {
    this.x.reset(s.x, s.t);
    this.y.reset(s.y, s.t);
    this.energy = 0;
  }

  push(s: Sample): boolean {
    const fired = this.x.push(s.x, s.t) || this.y.push(s.y, s.t);
    if (fired) {
      this.energy = 1;
      if (s.t - this.lastPeelT < SHAKE_PEEL_COOLDOWN) return false;
      this.lastPeelT = s.t;
      return true;
    }
    return false;
  }

  /** À appeler une fois par frame. */
  decay(dt: number) {
    this.energy = Math.max(0, this.energy - dt / 400);
  }
}

export interface Cut {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

/**
 * Un tracé ne devient une coupe que s'il est assez long, assez rapide
 * et assez droit : un doigt qui traîne ne coupe rien.
 */
export function sliceFromPath(path: Sample[]): Cut | null {
  if (path.length < 2) return null;
  const a = path[0];
  const b = path[path.length - 1];

  let travelled = 0;
  for (let i = 1; i < path.length; i++) {
    travelled += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  }
  const straight = Math.hypot(b.x - a.x, b.y - a.y);
  if (straight < SLICE_MIN_LENGTH) return null;
  if (straight < travelled * 0.7) return null; // trop sinueux

  const duration = Math.max(1, b.t - a.t);
  if (straight / duration < SLICE_MIN_SPEED) return null;

  return { ax: a.x, ay: a.y, bx: b.x, by: b.y };
}

/** Côté du point par rapport à la droite portée par la coupe. */
export function sideOfCut(cut: Cut, px: number, py: number): number {
  const cross = (cut.bx - cut.ax) * (py - cut.ay) - (cut.by - cut.ay) * (px - cut.ax);
  return Math.sign(cross);
}

/**
 * Répartit des points de part et d'autre de la coupe. Un point pile sur la
 * ligne va du côté positif : chaque cube doit atterrir dans exactement un
 * groupe, sinon la découpe fait disparaître de la matière.
 */
export function partitionByCut<T extends { x: number; y: number }>(
  cut: Cut,
  points: T[],
): [T[], T[]] {
  const plus: T[] = [];
  const minus: T[] = [];
  for (const p of points) {
    if (sideOfCut(cut, p.x, p.y) >= 0) plus.push(p);
    else minus.push(p);
  }
  return [plus, minus];
}

/** Le segment traverse-t-il la boîte ? (évite qu'un trait coupe toute la scène) */
export function segmentHitsBox(
  cut: Cut,
  min: { x: number; y: number },
  max: { x: number; y: number },
): boolean {
  // Liang-Barsky.
  const dx = cut.bx - cut.ax;
  const dy = cut.by - cut.ay;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [cut.ax - min.x, max.x - cut.ax, cut.ay - min.y, max.y - cut.ay];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
      continue;
    }
    const r = q[i] / p[i];
    if (p[i] < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return true;
}
