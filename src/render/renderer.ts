import type Matter from 'matter-js';
import { GROUND_HEIGHT, UNIT } from '../core/constants';
import { colorFor, parseHex, rgba, shade } from '../core/palette';
import type { Sample } from '../input/gestures';
import { DecorCache, drawCharacter } from './faces';
import type { Pose, Wardrobe } from './faces';
import { LIGHT, PEN, blockPaints, paintBody, paintSeams } from './paint';
import { CORNER, blockArt } from './silhouette';
import type { BlockArt } from './silhouette';

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
  /** 0..1, le bloc rentre dans la corbeille : il rapetisse pour y tenir. */
  sink: number;
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
  trash: {
    x: number;
    y: number;
    w: number;
    h: number;
    /** 0..1, le couvercle s'ouvre quand le doigt approche. */
    hot: number;
    gulp: number;
    /** 0..1, apparition pendant un glisser. */
    show: number;
  };
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
  private faces = new DecorCache();
  private wardrobe: Wardrobe = {};
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

  /** Les blocs se rhabillent : les têtes en cache sont périmées. */
  setWardrobe(wardrobe: Wardrobe) {
    this.wardrobe = wardrobe;
    this.faces.clear();
  }

  resize(width: number, height: number) {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.faces.setDpr(this.dpr);
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
    this.drawTrashBack(scene);
    for (const b of scene.blocks) this.drawBlock(b, scene);
    this.drawTrashFront(scene);
    // Les pastilles passent après tous les blocs : sinon, dans un tas, le
    // chiffre d'un bloc disparaît derrière celui dessiné juste après.
    for (const b of scene.blocks) this.drawBadge(b);
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

  private drawBlock(b: BlockVisual, scene: Scene) {
    const { ctx } = this;
    const base = colorFor(b.value);
    const scale = 0.62 + 0.38 * easeOutBack(1 - b.pop);
    if (scale <= 0.01) return;

    const sq = b.squash;
    const jitter = b.shake * 4;
    const angle = b.body.angle;

    const art = blockArt(b.value);

    // Au-dessus de la corbeille, le bloc rétrécit juste ce qu'il faut pour y
    // tenir et se recentre dedans : sans ça, un 10 dépasse du seau des deux
    // côtés et n'a plus l'air d'y entrer.
    const tenir = Math.min(
      1,
      (scene.trash.w * 0.74) / (art.right - art.left),
      (scene.trash.h * 0.72) / (art.bottom - art.top),
    );
    const k = 1 + (tenir - 1) * b.sink;
    const sx = scale * k * (1 + sq * 0.22);
    const sy = scale * k * (1 - sq * 0.22);
    const vers = 0.9 * b.sink;

    const px =
      b.body.position.x + (scene.trash.x - b.body.position.x) * vers +
      (jitter ? (Math.random() - 0.5) * jitter : 0);
    const py =
      b.body.position.y + (scene.trash.y - b.body.position.y) * vers +
      (jitter ? (Math.random() - 0.5) * jitter : 0);

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);
    ctx.scale(sx, sy);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (b.dragged) {
      ctx.lineWidth = PEN + 13;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.stroke(art.path);
      ctx.lineWidth = PEN + 6;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.82)';
      ctx.stroke(art.path);
    }

    paintBody(ctx, art, blockPaints(ctx, art, base, angle));
    paintSeams(ctx, art, angle);
    this.drawShine(art, b.pop);
    drawCharacter(ctx, b.value, base, this.pose(b, scene), this.faces, this.wardrobe);
    ctx.restore();
  }

  /** Regard et paupières, dans le repère du bloc. */
  private pose(b: BlockVisual, scene: Scene): Pose {
    // Le regard suit le doigt s'il est là, sinon il regarde devant.
    let gazeX = 0;
    let gazeY = 0;
    if (scene.pointer) {
      const wx = scene.pointer.x - b.body.position.x;
      const wy = scene.pointer.y - b.body.position.y;
      const cos = Math.cos(-b.body.angle);
      const sin = Math.sin(-b.body.angle);
      const rx = wx * cos - wy * sin;
      const ry = wx * sin + wy * cos;
      const d = Math.hypot(rx, ry) || 1;
      gazeX = (rx / d) * 2.6;
      gazeY = (ry / d) * 2.6;
    }
    return { gazeX, gazeY, blink: b.blink };
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

  private drawBadge(b: BlockVisual) {
    // Un bloc qui descend dans la corbeille emmène sa pastille ailleurs — elle
    // remontait se coincer dans la barre du haut. Elle s'efface avec lui.
    if (b.sink > 0.98) return;
    const { ctx } = this;
    const base = colorFor(b.value);
    const label = String(b.value);
    const x = b.body.position.x;
    const w = 21 + label.length * 11;
    const h = 26;
    // Au-dessus du bloc, et assez haut pour dégager la coiffure : la pastille
    // coupait la couronne du 10 et les épis du 3.
    const y = Math.max(h / 2 + 6, b.body.bounds.min.y - 26);

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
    ctx.globalAlpha = 1 - b.sink;
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

  /** Géométrie du seau, partagée par les deux passes. */
  private trashGeom(trash: Scene['trash']) {
    const top = -trash.h / 2 + 12;
    const bot = trash.h / 2;
    const haut = trash.w / 2;
    const bas = trash.w * 0.41;
    const lip = 9;

    // La lèvre avant suit l'ellipse de l'ouverture : c'est elle qui donne au
    // seau sa profondeur, et c'est derrière elle que le bloc plonge.
    const corps = new Path2D();
    corps.moveTo(-haut, top);
    corps.lineTo(-bas, bot - 12);
    corps.quadraticCurveTo(-bas, bot, -bas + 12, bot);
    corps.lineTo(bas - 12, bot);
    corps.quadraticCurveTo(bas, bot, bas, bot - 12);
    corps.lineTo(haut, top);
    corps.ellipse(0, top, haut, lip, 0, 0, Math.PI);
    corps.closePath();

    return { top, bot, haut, bas, lip, corps };
  }

  private trashPose(trash: Scene['trash'], time: number) {
    const pulse = trash.hot > 0 ? (0.05 + Math.sin(time / 140) * 0.015) * trash.hot : 0;
    return (0.84 + 0.16 * trash.show) * (1 + pulse - trash.gulp * 0.18);
  }

  /**
   * Le fond du seau et son couvercle, posés avant les blocs.
   *
   * La corbeille n'apparaît que pendant un glisser, et flotte en haut de la
   * scène : posée en permanence sur le sol, elle occupait un coin du terrain
   * de jeu et les blocs venaient s'empiler contre elle. Le couvercle se
   * soulève quand le doigt approche — c'est ce geste qui dit « pose-le ici »,
   * sans un mot à lire.
   */
  private drawTrashBack({ trash, time }: Scene) {
    if (trash.show <= 0.01) return;
    const { ctx } = this;
    const { hot, w } = trash;
    const { top, haut, lip } = this.trashGeom(trash);

    ctx.save();
    ctx.globalAlpha = trash.show;
    ctx.translate(trash.x, trash.y);
    ctx.scale(this.trashPose(trash, time), this.trashPose(trash, time));

    if (hot > 0.01) {
      const halo = ctx.createRadialGradient(0, 0, w * 0.24, 0, 0, w * 0.98);
      halo.addColorStop(0, `rgba(255, 126, 112, ${(0.36 * hot).toFixed(3)})`);
      halo.addColorStop(1, 'rgba(255, 126, 112, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, w * 0.98, 0, Math.PI * 2);
      ctx.fill();
    }

    // L'intérieur : un puits, pas un disque plat.
    const well = ctx.createRadialGradient(0, top, 1, 0, top, haut);
    well.addColorStop(0, '#05070c');
    well.addColorStop(1, mix('#1A2130', '#5E2A22', hot));
    ctx.fillStyle = well;
    ctx.beginPath();
    ctx.ellipse(0, top, haut, lip, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(226, 238, 255, ${(0.2 + 0.4 * hot).toFixed(2)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, top, haut, lip, 0, Math.PI, 2 * Math.PI);
    ctx.stroke();

    // Couvercle : il pivote sur sa charnière gauche.
    ctx.save();
    ctx.translate(-haut - 5, top - 9);
    ctx.rotate(-0.5 * hot);
    ctx.fillStyle = mix('#77849F', '#F79881', hot);
    ctx.beginPath();
    ctx.roundRect(0, -6, w + 10, 12, 6);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(w / 2 - 4, -14, 18, 9, 4.5);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  /** La paroi avant, posée après les blocs : le bloc lâché plonge derrière. */
  private drawTrashFront({ trash, time }: Scene) {
    if (trash.show <= 0.01) return;
    const { ctx } = this;
    const { hot, w } = trash;
    const { top, bot, corps } = this.trashGeom(trash);

    ctx.save();
    ctx.globalAlpha = trash.show;
    ctx.translate(trash.x, trash.y);
    ctx.scale(this.trashPose(trash, time), this.trashPose(trash, time));

    const shell = ctx.createLinearGradient(0, top, 0, bot);
    shell.addColorStop(0, mix('#546080', '#F0866F', hot));
    shell.addColorStop(1, mix('#2C3548', '#C4523B', hot));
    ctx.fillStyle = shell;
    ctx.fill(corps);
    ctx.strokeStyle = `rgba(226, 238, 255, ${(0.2 + 0.35 * hot).toFixed(2)})`;
    ctx.lineWidth = 2;
    ctx.stroke(corps);

    ctx.save();
    ctx.clip(corps);
    ctx.strokeStyle = 'rgba(10, 14, 22, 0.24)';
    ctx.lineWidth = 3;
    for (const x of [-w * 0.16, 0, w * 0.16]) {
      ctx.beginPath();
      ctx.moveTo(x, top + 14);
      ctx.lineTo(x * 0.82, bot);
      ctx.stroke();
    }
    ctx.restore();

    ctx.restore();
  }
}

/** Fondu entre deux couleurs, pour passer du gris au rouge sans à-coup. */
function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = parseHex(a);
  const [r2, g2, b2] = parseHex(b);
  const k = Math.max(0, Math.min(1, t));
  const c = (x: number, y: number) => Math.round(x + (y - x) * k);
  return `rgb(${c(r1, r2)}, ${c(g1, g2)}, ${c(b1, b2)})`;
}

function easeOutBack(t: number): number {
  const c1 = 1.9;
  const c3 = c1 + 1;
  const k = t - 1;
  return 1 + c3 * k * k * k + c1 * k * k;
}
