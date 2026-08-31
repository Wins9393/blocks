import type Matter from 'matter-js';
import { GROUND_HEIGHT, UNIT } from '../core/constants';
import { colorFor, rgba, shade } from '../core/palette';
import { centeredCells, shapeFor } from '../core/shape';
import { CORNER, blockArt } from './silhouette';
import type { Sample } from '../input/gestures';

const FONT = "ui-rounded, 'SF Pro Rounded', 'Segoe UI Rounded', system-ui, -apple-system, sans-serif";

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

    this.drawBackground(scene);
    this.drawGround(scene);
    for (const b of scene.blocks) this.drawShadow(b, scene.groundY);
    this.drawTrash(scene);
    for (const b of scene.blocks) this.drawBlock(b, scene);
    this.drawTrashMouth(scene);
    if (scene.ghost) this.drawGhost(scene.ghost);
    this.drawParticles(scene.particles);
    if (scene.slice) this.drawSlice(scene.slice);

    ctx.restore();
  }

  // --- décor ------------------------------------------------------------

  private drawBackground({ width, height }: Scene) {
    const { ctx } = this;
    const g = ctx.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, '#232b3d');
    g.addColorStop(0.6, '#1d2433');
    g.addColorStop(1, '#161c28');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(width * 0.5, height * 0.18, 0, width * 0.5, height * 0.18, height * 0.7);
    glow.addColorStop(0, 'rgba(120, 160, 255, 0.10)');
    glow.addColorStop(1, 'rgba(120, 160, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
    const step = UNIT;
    for (let x = step / 2; x < width; x += step) {
      for (let y = step / 2; y < height; y += step) {
        ctx.fillRect(x, y, 1.5, 1.5);
      }
    }
  }

  private drawGround({ width, groundY }: Scene) {
    const { ctx } = this;
    ctx.fillStyle = '#2f3a52';
    ctx.beginPath();
    ctx.roundRect(-20, groundY, width + 40, GROUND_HEIGHT + 40, 14);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.fillRect(-20, groundY, width + 40, 3);
  }

  private drawShadow(b: BlockVisual, groundY: number) {
    const { ctx } = this;
    const bounds = b.body.bounds;
    const bottom = bounds.max.y;
    const dist = Math.max(0, groundY - bottom);
    const fade = Math.max(0, 1 - dist / 340);
    if (fade <= 0.02) return;
    const w = (bounds.max.x - bounds.min.x) * (0.5 + fade * 0.24);
    ctx.save();
    ctx.globalAlpha = fade * 0.4;
    ctx.fillStyle = '#0b0f18';
    ctx.beginPath();
    ctx.ellipse(b.body.position.x, groundY + 3, w, 7 * fade + 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // --- blocs ------------------------------------------------------------

  private drawBlock(b: BlockVisual, scene: Scene) {
    const { ctx } = this;
    const base = colorFor(b.value);
    const pop = 1 - b.pop;
    const scale = 0.62 + 0.38 * easeOutBack(pop);
    if (scale <= 0.01) return;

    const sq = b.squash;
    const sx = scale * (1 + sq * 0.22);
    const sy = scale * (1 - sq * 0.22);
    const jitter = b.shake * 4;

    ctx.save();
    ctx.translate(
      b.body.position.x + (jitter ? (Math.random() - 0.5) * jitter : 0),
      b.body.position.y + (jitter ? (Math.random() - 0.5) * jitter : 0),
    );
    ctx.rotate(b.body.angle);
    ctx.scale(sx, sy);

    const cells = centeredCells(b.value);
    const art = blockArt(b.value);
    const w = 2 * CORNER;

    const body = ctx.createLinearGradient(0, art.top, 0, art.bottom);
    body.addColorStop(0, shade(base, 0.26));
    body.addColorStop(0.5, base);
    body.addColorStop(1, shade(base, -0.24));

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (b.dragged) {
      ctx.lineWidth = w + 8;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.stroke(art.path);
    }

    // Le liseré sombre vient d'un trait plus large passé dessous, puis recouvert :
    // c'est le seul moyen de cerner la silhouette entière d'un seul contour.
    ctx.lineWidth = w + 3;
    ctx.strokeStyle = shade(base, -0.42);
    ctx.fillStyle = shade(base, -0.42);
    ctx.stroke(art.path);
    ctx.fill(art.path);

    ctx.lineWidth = w;
    ctx.strokeStyle = body;
    ctx.fillStyle = body;
    ctx.stroke(art.path);
    ctx.fill(art.path);

    for (const [x, y, hw, hh] of art.highlights) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.26)';
      ctx.beginPath();
      ctx.roundRect(x, y, hw, hh, hh / 2);
      ctx.fill();
    }

    ctx.lineWidth = 1.8;
    for (const [x1, y1, x2, y2] of art.seams) {
      ctx.strokeStyle = shade(base, -0.3);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.13)';
      ctx.beginPath();
      ctx.moveTo(x1 + (y1 === y2 ? 0 : 1.4), y1 + (y1 === y2 ? 1.4 : 0));
      ctx.lineTo(x2 + (y1 === y2 ? 0 : 1.4), y2 + (y1 === y2 ? 1.4 : 0));
      ctx.stroke();
    }

    this.drawFace(b, cells, base, scene);
    ctx.restore();

    this.drawBadge(b, base);
  }

  private drawFace(b: BlockVisual, cells: { x: number; y: number }[], base: string, scene: Scene) {
    const { ctx } = this;
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
      lx = (rx / d) * 2.2;
      ly = (ry / d) * 2.2;
    }

    const eyeDx = UNIT * 0.2;
    const eyeY = fy - UNIT * 0.02;
    const open = 1 - b.blink;
    ctx.fillStyle = '#fdfdfd';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(fx + s * eyeDx, eyeY, UNIT * 0.115, UNIT * 0.135 * open + 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = shade(base, -0.75);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(fx + s * eyeDx + lx, eyeY + ly, UNIT * 0.055, UNIT * 0.07 * open + 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawBadge(b: BlockVisual, base: string) {
    const { ctx } = this;
    const label = String(b.value);
    const x = b.body.position.x;
    const w = 20 + label.length * 11;
    const h = 25;
    // Au-dessus du bloc : en dessous, la barre d'outils masquerait le chiffre.
    const y = Math.max(h / 2 + 6, b.body.bounds.min.y - 16);

    ctx.save();
    ctx.fillStyle = shade(base, -0.32);
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
    ctx.fill();
    ctx.strokeStyle = shade(base, 0.25);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 17px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 1);
    ctx.restore();
  }

  // --- aides au geste ---------------------------------------------------

  private drawGhost(ghost: Ghost) {
    const { ctx } = this;
    const sum = ghost.a + ghost.b;
    const color = ghost.ok ? colorFor(sum) : '#ff6b6b';
    const art = blockArt(ghost.ok ? sum : 1);

    ctx.save();
    ctx.translate(ghost.x, ghost.y);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Liseré plein puis intérieur assombri : deux passes translucides
    // s'additionneraient dans leur recouvrement et l'aperçu paraîtrait solide.
    ctx.lineWidth = 2 * CORNER + 6;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.stroke(art.path);
    ctx.fill(art.path);

    ctx.lineWidth = 2 * CORNER;
    ctx.strokeStyle = 'rgba(24, 30, 44, 0.84)';
    ctx.fillStyle = 'rgba(24, 30, 44, 0.84)';
    ctx.stroke(art.path);
    ctx.fill(art.path);

    ctx.lineWidth = 1.6;
    ctx.strokeStyle = rgba(color, 0.75);
    for (const [x1, y1, x2, y2] of art.seams) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    const text = ghost.ok ? `${ghost.a} + ${ghost.b} = ${sum}` : 'trop gros !';
    ctx.font = `800 20px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(16, 20, 30, 0.85)';
    ctx.strokeText(text, 0, art.top - 24);
    ctx.fillStyle = ghost.ok ? '#ffffff' : '#ff9c9c';
    ctx.fillText(text, 0, art.top - 24);
    ctx.restore();
  }

  private drawSlice(path: Sample[]) {
    const { ctx } = this;
    if (path.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 1; i < path.length; i++) {
      const k = i / path.length;
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.1 + k * 0.6})`;
      ctx.lineWidth = 1 + k * 7;
      ctx.beginPath();
      ctx.moveTo(path[i - 1].x, path[i - 1].y);
      ctx.lineTo(path[i].x, path[i].y);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawParticles(particles: Particle[]) {
    const { ctx } = this;
    for (const p of particles) {
      const k = p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, k);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.roundRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size, p.size * 0.28);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawTrashMouth({ trash }: Scene) {
    if (!trash.hot) return;
    const { ctx } = this;
    ctx.save();
    ctx.translate(trash.x, trash.y);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.ellipse(0, -trash.h / 2 + 6, trash.w / 2 - 6, 9, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawTrash({ trash, time }: Scene) {
    const { ctx } = this;
    const k = trash.hot ? 1 : 0;
    const s = 1 + k * 0.09 + (trash.hot ? Math.sin(time / 120) * 0.02 : 0) - trash.gulp * 0.16;

    ctx.save();
    ctx.translate(trash.x, trash.y);
    ctx.scale(s, s);

    const w = trash.w;
    const h = trash.h;
    ctx.fillStyle = trash.hot ? '#5c6a8a' : '#3d4760';
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 12);
    ctx.fill();

    ctx.fillStyle = '#141a26';
    ctx.beginPath();
    ctx.ellipse(0, -h / 2 + 6, w / 2 - 6, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 3;
    for (const x of [-w * 0.22, 0, w * 0.22]) {
      ctx.beginPath();
      ctx.moveTo(x, -h / 2 + 24);
      ctx.lineTo(x, h / 2 - 12);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function easeOutBack(t: number): number {
  const c1 = 1.9;
  const c3 = c1 + 1;
  const k = t - 1;
  return 1 + c3 * k * k * k + c1 * k * k;
}
