import type Matter from 'matter-js';
import { GROUND_HEIGHT, UNIT } from '../core/constants';
import { colorFor, rgba, shade } from '../core/palette';
import { centeredCells, shapeFor } from '../core/shape';
import type { Sample } from '../input/gestures';
import { CORNER, blockArt } from './silhouette';
import type { BlockArt } from './silhouette';

const FONT = "ui-rounded, 'SF Pro Rounded', 'Segoe UI Rounded', system-ui, -apple-system, sans-serif";

/**
 * Direction du soleil, en repère MONDE et normalisée : elle pointe vers la
 * source. Tout l'ombrage en découle, et surtout : elle ne tourne pas avec les
 * blocs. C'est ce qui distingue un objet éclairé d'un autocollant.
 */
const LIGHT = { x: -0.6, y: -0.8 };

/** Largeur du biseau qui court le long du contour, en pixels. */
const BEVEL = 3.6;

export interface BlockVisual {
  id: number;
  value: number;
  body: Matter.Body;
  /** 0..1, animation d'apparition. */
  pop: number;
  /** 0..1, écrasement suite à un impact. */
  squash: number;
  /** 0..1, tremblement pendant une secousse. */
  shake: number;
  blink: number;
  dragged: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  /** Si défini, la particule est aspirée vers ce point (corbeille). */
  target?: { x: number; y: number };
}

export interface Ghost {
  a: number;
  b: number;
  x: number;
  y: number;
  ok: boolean;
}

export interface Scene {
  blocks: BlockVisual[];
  particles: Particle[];
  ghost: Ghost | null;
  slice: Sample[] | null;
  trash: { x: number; y: number; w: number; h: number; hot: boolean; gulp: number };
  groundY: number;
  width: number;
  height: number;
  pointer: { x: number; y: number } | null;
  time: number;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;

  private badgePaints = new Map<number, CanvasGradient>();
  private shadowPaint: CanvasGradient | null = null;
  private decor: {
    key: string;
    sky: CanvasGradient;
    vignette: CanvasGradient;
    glow: CanvasGradient;
    slab: CanvasGradient;
    contact: CanvasGradient;
  } | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D indisponible');
    this.ctx = ctx;
  }

  resize(width: number, height: number) {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(width * this.dpr);
    this.canvas.height = Math.floor(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  draw(scene: Scene) {
    const { ctx } = this;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    this.drawSky(scene);
    this.drawVignette(scene);
    this.drawGround(scene);
    for (const b of scene.blocks) this.drawShadow(b, scene.groundY);
    this.drawTrash(scene);
    for (const b of scene.blocks) this.drawBlock(b, scene);
    // Les pastilles passent après tous les blocs : sinon, dans un tas, le
    // chiffre d'un bloc disparaît derrière celui dessiné juste après.
    for (const b of scene.blocks) this.drawBadge(b);
    this.drawTrashRim(scene);
    if (scene.ghost) this.drawGhost(scene.ghost);
    this.drawParticles(scene.particles);
    if (scene.slice) this.drawSlice(scene.slice);

    ctx.restore();
  }

  // --- décor --------------------------------------------------------------

  /** Le décor ne change qu'au redimensionnement : ses dégradés sont gardés. */
  private decorPaints(width: number, height: number, groundY: number) {
    const key = `${Math.round(width)}x${Math.round(height)}x${Math.round(groundY)}`;
    if (this.decor?.key === key) return this.decor;
    const { ctx } = this;

    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#273049');
    sky.addColorStop(0.42, '#212940');
    sky.addColorStop(1, '#171d2c');

    // Assombrissement des bords, posé sur le fond et non par-dessus la scène :
    // au-dessus, il éteindrait la couleur des blocs, qui est leur identité.
    const vignette = ctx.createRadialGradient(
      width / 2,
      height * 0.46,
      Math.min(width, height) * 0.28,
      width / 2,
      height * 0.46,
      Math.max(width, height) * 0.78,
    );
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.34)');

    const glow = ctx.createRadialGradient(
      width / 2,
      groundY,
      0,
      width / 2,
      groundY,
      Math.max(width, height) * 0.62,
    );
    glow.addColorStop(0, 'rgba(126, 158, 220, 0.16)');
    glow.addColorStop(0.55, 'rgba(126, 158, 220, 0.05)');
    glow.addColorStop(1, 'rgba(126, 158, 220, 0)');

    const slab = ctx.createLinearGradient(0, groundY, 0, groundY + GROUND_HEIGHT + 30);
    slab.addColorStop(0, '#3b4762');
    slab.addColorStop(0.28, '#333e56');
    slab.addColorStop(1, '#1e2536');

    const contact = ctx.createLinearGradient(0, groundY - 34, 0, groundY);
    contact.addColorStop(0, 'rgba(9, 12, 20, 0)');
    contact.addColorStop(1, 'rgba(9, 12, 20, 0.3)');

    this.decor = { key, sky, vignette, glow, slab, contact };
    return this.decor;
  }

  private drawSky(scene: Scene) {
    const { ctx } = this;
    const { width, height } = scene;
    const { sky, glow } = this.decorPaints(width, height, scene.groundY);

    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    // Halo chaud posé sur l'horizon, pour que le sol paraisse éclairé.
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    // Trame de points, plus dense et plus claire près du sol.
    const step = UNIT;
    for (let y = step / 2; y < scene.groundY; y += step) {
      const fade = 0.016 + 0.032 * Math.max(0, 1 - (scene.groundY - y) / (scene.groundY || 1));
      ctx.fillStyle = `rgba(190, 210, 255, ${fade.toFixed(3)})`;
      for (let x = step / 2; x < width; x += step) {
        ctx.fillRect(x, y, 1.6, 1.6);
      }
    }
  }

  private drawVignette(scene: Scene) {
    const { vignette } = this.decorPaints(scene.width, scene.height, scene.groundY);
    this.ctx.fillStyle = vignette;
    this.ctx.fillRect(0, 0, scene.width, scene.height);
  }

  private drawGround({ width, groundY, height }: Scene) {
    const { ctx } = this;
    const { slab, contact } = this.decorPaints(width, height, groundY);

    // Ombre de contact : les blocs semblent poser sur quelque chose.
    ctx.fillStyle = contact;
    ctx.fillRect(0, groundY - 34, width, 34);

    ctx.fillStyle = slab;
    ctx.beginPath();
    ctx.roundRect(-24, groundY, width + 48, height - groundY + 40, 16);
    ctx.fill();

    // Joints de dalle : donne une matière au sol sans attirer l'oeil.
    ctx.strokeStyle = 'rgba(10, 14, 24, 0.22)';
    ctx.lineWidth = 2;
    for (let x = ((width / 2) % (UNIT * 3)) - UNIT * 3; x < width + UNIT * 3; x += UNIT * 3) {
      ctx.beginPath();
      ctx.moveTo(x, groundY + 5);
      ctx.lineTo(x - 7, groundY + 34);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(216, 232, 255, 0.28)';
    ctx.fillRect(-24, groundY, width + 48, 2);
    ctx.fillStyle = 'rgba(216, 232, 255, 0.09)';
    ctx.fillRect(-24, groundY + 2, width + 48, 1.5);
  }

  private drawShadow(b: BlockVisual, groundY: number) {
    const { ctx } = this;
    if (!this.shadowPaint) {
      // Construite dans un repère unitaire : une seule allocation pour toutes
      // les ombres, la taille vient de la mise à l'échelle du contexte.
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, 'rgba(7, 10, 17, 0.52)');
      g.addColorStop(0.5, 'rgba(7, 10, 17, 0.26)');
      g.addColorStop(1, 'rgba(7, 10, 17, 0)');
      this.shadowPaint = g;
    }

    const bounds = b.body.bounds;
    const dist = Math.max(0, groundY - bounds.max.y);
    const fade = Math.max(0, 1 - dist / 320);
    if (fade <= 0.02) return;

    const spread = (bounds.max.x - bounds.min.x) * (0.52 + (1 - fade) * 0.5);
    ctx.save();
    ctx.globalAlpha = 0.36 + fade * 0.5;
    // L'ombre fuit la lumière, elle ne la suit pas.
    ctx.translate(b.body.position.x - dist * LIGHT.x * 0.16, groundY + 4);
    ctx.scale(spread, 11 + (1 - fade) * 7);
    ctx.fillStyle = this.shadowPaint;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // --- blocs --------------------------------------------------------------

  /** La lumière du monde, exprimée dans le repère tourné du bloc. */
  private localLight(angle: number) {
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    return {
      x: LIGHT.x * cos - LIGHT.y * sin,
      y: LIGHT.x * sin + LIGHT.y * cos,
    };
  }

  /**
   * Corps et liseré. Ils dépendent de l'orientation, donc ils ne peuvent plus
   * être mis en cache par valeur : c'est le prix d'une lumière qui reste en
   * place quand le bloc bascule.
   */
  private blockPaints(art: BlockArt, base: string, angle: number) {
    const { ctx } = this;
    const w = art.right - art.left;
    const h = art.bottom - art.top;
    const mx = (art.left + art.right) / 2;
    const my = (art.top + art.bottom) / 2;
    const l = this.localLight(angle);

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

  private drawBlock(b: BlockVisual, scene: Scene) {
    const { ctx } = this;
    const base = colorFor(b.value);
    const scale = 0.62 + 0.38 * easeOutBack(1 - b.pop);
    if (scale <= 0.01) return;

    const sq = b.squash;
    const sx = scale * (1 + sq * 0.22);
    const sy = scale * (1 - sq * 0.22);
    const jitter = b.shake * 4;
    const angle = b.body.angle;

    const art = blockArt(b.value);
    const paints = this.blockPaints(art, base, angle);
    const pen = 2 * CORNER;

    const px = b.body.position.x + (jitter ? (Math.random() - 0.5) * jitter : 0);
    const py = b.body.position.y + (jitter ? (Math.random() - 0.5) * jitter : 0);

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);
    ctx.scale(sx, sy);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (b.dragged) {
      ctx.lineWidth = pen + 13;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.stroke(art.path);
      ctx.lineWidth = pen + 6;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.82)';
      ctx.stroke(art.path);
    }

    // Le liseré vient d'un trait plus large passé dessous puis recouvert :
    // c'est le seul moyen de cerner la silhouette entière d'un seul contour.
    ctx.lineWidth = pen + 2.2;
    ctx.strokeStyle = paints.rim;
    ctx.fillStyle = paints.rim;
    ctx.stroke(art.path);
    ctx.fill(art.path);

    // La plume dessine la silhouette : en la rétrécissant de deux fois le
    // biseau, le corps laisse dépasser un anneau régulier tout autour.
    ctx.lineWidth = pen;
    ctx.strokeStyle = paints.bevel;
    ctx.fillStyle = paints.bevel;
    ctx.stroke(art.path);
    ctx.fill(art.path);

    ctx.lineWidth = pen - 2 * BEVEL;
    ctx.strokeStyle = paints.body;
    ctx.fillStyle = paints.body;
    ctx.stroke(art.path);
    ctx.fill(art.path);

    this.drawSeams(art, angle);
    this.drawShine(art, b.pop);
    this.drawEyes(b, base, scene);
    ctx.restore();
  }

  /**
   * Rainures entre cubes : un trait sombre, doublé d'un trait clair sur la
   * paroi qui fait face à la lumière. C'est ce couple qui les fait lire comme
   * creusées et non comme dessinées.
   */
  private drawSeams(art: BlockArt, angle: number) {
    const { ctx } = this;
    const l = this.localLight(angle);

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

  /** Balayage de lumière sur un bloc qui vient d'apparaître ou de fusionner. */
  private drawShine(art: BlockArt, pop: number) {
    if (pop <= 0.02) return;
    const { ctx } = this;
    const t = 1 - pop;
    const w = art.right - art.left;
    const h = art.bottom - art.top;
    const course = w + h;
    const tete = art.left - course * 0.3 + t * course * 1.6;
    const largeur = Math.max(16, course * 0.1);

    const band = ctx.createLinearGradient(tete - largeur, art.top, tete + largeur, art.bottom);
    band.addColorStop(0, 'rgba(255, 255, 255, 0)');
    band.addColorStop(0.5, `rgba(255, 255, 255, ${(0.3 * Math.sin(Math.PI * t)).toFixed(3)})`);
    band.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.save();
    ctx.clip(art.clip);
    ctx.fillStyle = band;
    ctx.fillRect(art.left - 4, art.top - 4, w + 8, h + 8);
    ctx.restore();
  }

  private drawEyes(b: BlockVisual, base: string, scene: Scene) {
    const { ctx } = this;
    const cells = centeredCells(b.value);
    const face = cells[shapeFor(b.value).faceIndex];
    const fx = face.x * UNIT;
    const fy = face.y * UNIT;

    // Le regard suit le doigt s'il est là, sinon il regarde devant.
    let lx = 0;
    let ly = 0;
    if (scene.pointer) {
      const wx = scene.pointer.x - b.body.position.x;
      const wy = scene.pointer.y - b.body.position.y;
      const cos = Math.cos(-b.body.angle);
      const sin = Math.sin(-b.body.angle);
      const rx = wx * cos - wy * sin;
      const ry = wx * sin + wy * cos;
      const d = Math.hypot(rx, ry) || 1;
      lx = (rx / d) * 2.4;
      ly = (ry / d) * 2.4;
    }

    const dx = UNIT * 0.2;
    const open = 1 - b.blink;
    // La paupière tombe d'en haut : l'œil rétrécit et descend un peu.
    const eyeY = fy - UNIT * 0.02 + (1 - open) * UNIT * 0.035;
    const rx = UNIT * 0.115;
    const ry = UNIT * 0.14 * open + 0.55;

    for (const s of [-1, 1]) {
      const ex = fx + s * dx;
      ctx.fillStyle = 'rgba(12, 16, 26, 0.16)';
      ctx.beginPath();
      ctx.ellipse(ex, eyeY + 0.9, rx * 1.06, ry * 1.06, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fdfdfd';
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = shade(base, -0.78);
      ctx.beginPath();
      ctx.ellipse(ex + lx, eyeY + ly, UNIT * 0.056, UNIT * 0.072 * open + 0.4, 0, 0, Math.PI * 2);
      ctx.fill();

      if (open > 0.45) {
        ctx.fillStyle = `rgba(255, 255, 255, ${(0.9 * open).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(ex + lx - UNIT * 0.022, eyeY + ly - UNIT * 0.03, UNIT * 0.022, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawBadge(b: BlockVisual) {
    const { ctx } = this;
    const base = colorFor(b.value);
    const label = String(b.value);
    const x = b.body.position.x;
    const w = 21 + label.length * 11;
    const h = 26;
    // Au-dessus du bloc : en dessous, la barre d'outils masquerait le chiffre.
    const y = Math.max(h / 2 + 6, b.body.bounds.min.y - 16);

    // Dessiné dans un repère centré sur la pastille : le dégradé ne dépend
    // alors plus de la position, donc il se garde d'une image à l'autre.
    let fill = this.badgePaints.get(b.value);
    if (!fill) {
      fill = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
      fill.addColorStop(0, shade(base, -0.06));
      fill.addColorStop(1, shade(base, -0.34));
      this.badgePaints.set(b.value, fill);
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = 'rgba(6, 9, 16, 0.5)';
    ctx.shadowBlur = 9;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';

    ctx.strokeStyle = shade(base, 0.36);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2, (h - 2) / 2);
    ctx.stroke();

    ctx.font = `800 17px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(10, 14, 22, 0.4)';
    ctx.fillText(label, 0, 2.2);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, 0, 1);
    ctx.restore();
  }

  // --- aides au geste -----------------------------------------------------

  private drawGhost(ghost: Ghost) {
    const { ctx } = this;
    const sum = ghost.a + ghost.b;
    const color = ghost.ok ? colorFor(sum) : '#ff6b6b';
    const art = blockArt(ghost.ok ? sum : 1);
    const pen = 2 * CORNER;

    ctx.save();
    ctx.translate(ghost.x, ghost.y);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Liseré plein puis intérieur assombri : deux passes translucides
    // s'additionneraient dans leur recouvrement et l'aperçu paraîtrait solide.
    ctx.lineWidth = pen + 12;
    ctx.strokeStyle = rgba(color, 0.14);
    ctx.stroke(art.path);

    ctx.lineWidth = pen + 6;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.stroke(art.path);
    ctx.fill(art.path);

    ctx.lineWidth = pen;
    // Assez opaque pour que la trame du fond ne mouchette pas l'intérieur.
    ctx.strokeStyle = 'rgba(25, 31, 46, 0.94)';
    ctx.fillStyle = 'rgba(25, 31, 46, 0.94)';
    ctx.stroke(art.path);
    ctx.fill(art.path);

    const grille = new Path2D();
    for (const [x1, y1, x2, y2] of art.seams) {
      if (y1 === y2) grille.rect(x1, y1 - 0.75, x2 - x1, 1.5);
      else grille.rect(x1 - 0.75, y1, 1.5, y2 - y1);
    }
    ctx.fillStyle = rgba(color, 0.7);
    ctx.fill(grille);

    const text = ghost.ok ? `${ghost.a} + ${ghost.b} = ${sum}` : 'trop gros !';
    const ty = art.top - 26;
    ctx.font = `800 21px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(14, 18, 28, 0.9)';
    ctx.strokeText(text, 0, ty);
    ctx.fillStyle = ghost.ok ? '#ffffff' : '#ff9c9c';
    ctx.fillText(text, 0, ty);
    ctx.restore();
  }

  private drawSlice(path: Sample[]) {
    const { ctx } = this;
    if (path.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [width, alpha] of [
      [9, 0.13],
      [4.5, 0.42],
      [1.8, 0.95],
    ] as const) {
      for (let i = 1; i < path.length; i++) {
        const k = i / path.length;
        ctx.strokeStyle = `rgba(226, 240, 255, ${(alpha * k).toFixed(3)})`;
        ctx.lineWidth = width * (0.35 + k * 0.65);
        ctx.beginPath();
        ctx.moveTo(path[i - 1].x, path[i - 1].y);
        ctx.lineTo(path[i].x, path[i].y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawParticles(particles: Particle[]) {
    const { ctx } = this;
    for (const p of particles) {
      const k = Math.max(0, p.life / p.maxLife);
      const size = p.size * (0.35 + k * 0.65);
      ctx.save();
      ctx.globalAlpha = k;
      ctx.translate(p.x, p.y);
      ctx.rotate((p.x + p.y) * 0.02);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.roundRect(-size / 2, -size / 2, size, size, size * 0.3);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // --- corbeille ----------------------------------------------------------

  private drawTrash({ trash, time }: Scene) {
    const { ctx } = this;
    const s =
      1 + (trash.hot ? 0.09 + Math.sin(time / 120) * 0.02 : 0) - trash.gulp * 0.16;
    const w = trash.w;
    const h = trash.h;

    ctx.save();
    ctx.translate(trash.x, trash.y);
    ctx.scale(s, s);

    const shell = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    if (trash.hot) {
      shell.addColorStop(0, '#6c7ca3');
      shell.addColorStop(1, '#3d4763');
    } else {
      shell.addColorStop(0, '#4a5673');
      shell.addColorStop(1, '#2c3548');
    }
    ctx.fillStyle = shell;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 13);
    ctx.fill();

    // Intérieur : un puits, pas un disque plat.
    const mouthY = -h / 2 + 7;
    const well = ctx.createRadialGradient(0, mouthY, 1, 0, mouthY, w / 2);
    well.addColorStop(0, '#05070c');
    well.addColorStop(1, '#151b28');
    ctx.fillStyle = well;
    ctx.beginPath();
    ctx.ellipse(0, mouthY, w / 2 - 7, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    for (const x of [-w * 0.22, 0, w * 0.22]) {
      ctx.strokeStyle = 'rgba(10, 14, 22, 0.3)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, -h / 2 + 26);
      ctx.lineTo(x, h / 2 - 13);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(226, 238, 255, 0.11)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 2.5, -h / 2 + 26);
      ctx.lineTo(x + 2.5, h / 2 - 13);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Le rebord passe après les blocs : un bloc glissé dedans plonge derrière. */
  private drawTrashRim({ trash }: Scene) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(trash.x, trash.y);
    ctx.strokeStyle = trash.hot ? 'rgba(255, 255, 255, 0.92)' : 'rgba(226, 238, 255, 0.22)';
    ctx.lineWidth = trash.hot ? 3.5 : 2;
    ctx.beginPath();
    ctx.ellipse(0, -trash.h / 2 + 7, trash.w / 2 - 7, 10, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function easeOutBack(t: number): number {
  const c1 = 1.9;
  const c3 = c1 + 1;
  const k = t - 1;
  return 1 + c3 * k * k * k + c1 * k * k;
}
