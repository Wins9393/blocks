import type Matter from 'matter-js';
import { GROUND_HEIGHT, UNIT } from '../core/constants';
import { colorFor, parseHex, rgba, shade } from '../core/palette';
import { shapeFor } from '../core/shape';
import type { Shape } from '../core/shape';
import type { Skin } from '../core/matieres';
import type { Sample } from '../input/gestures';
import type { Wardrobe } from '../core/wardrobe';
import { DecorCache, drawCharacter } from './faces';
import type { Pose } from './faces';
import { LIGHT, PEN } from './paint';
import { Relief } from './relief';
import type { BlocRelief } from './relief';
import { CORNER, blockArt } from './silhouette';
import type { BlockArt } from './silhouette';

const FONT = "ui-rounded, 'SF Pro Rounded', 'Segoe UI Rounded', system-ui, -apple-system, sans-serif";

export interface BlockVisual {
  id: number;
  value: number;
  shape: Shape;
  /** Matière de chaque cube, sur un chantier. Vide au mode nombre. */
  skin: Skin[];
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

/** Pose d'un bloc à l'écran : calculée une fois, partagée par les deux moteurs. */
interface Pose2D {
  art: BlockArt;
  px: number;
  py: number;
  angle: number;
  sx: number;
  sy: number;
  pop: number;
  sink: number;
  dragged: boolean;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  /**
   * Le moteur de volume. Il n'y a plus de dessin de rechange : les blocs et
   * les objets n'existent qu'en volume, et une machine sans WebGL n'affichera
   * pas de corps — seuls les visages, la scène et les pastilles restent.
   */
  private relief = new Relief();

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
    this.relief.setWardrobe(wardrobe);
  }

  resize(width: number, height: number) {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.faces.setDpr(this.dpr);
    this.canvas.width = Math.floor(width * this.dpr);
    this.canvas.height = Math.floor(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.relief.resize(width, height, this.dpr);
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

    // La pose est calculée une seule fois : elle contient un tremblement
    // tiré au hasard, et le visage doit rester collé à son corps.
    const poses = scene.blocks.map((b) => this.pose2D(b, scene));
    this.drawBlocs(scene, poses);

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
    sky.addColorStop(0, '#2a3450');
    sky.addColorStop(0.42, '#252e47');
    sky.addColorStop(1, '#1d2434');

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
    // Un quart d'ombre au bord suffit à recentrer le regard. Au tiers, le bas
    // de l'écran — là où les blocs finissent toujours par tomber — passait
    // sous la couleur du décor.
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.22)');

    const glow = ctx.createRadialGradient(
      width / 2,
      groundY,
      0,
      width / 2,
      groundY,
      Math.max(width, height) * 0.62,
    );
    glow.addColorStop(0, 'rgba(126, 158, 220, 0.22)');
    glow.addColorStop(0.55, 'rgba(126, 158, 220, 0.07)');
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

  /** Où et comment le bloc se pose à l'écran, moteur mis à part. */
  private pose2D(b: BlockVisual, scene: Scene): Pose2D {
    const scale = 0.62 + 0.38 * easeOutBack(1 - b.pop);
    const sq = b.squash;
    const jitter = b.shake * 4;
    const art = blockArt(b.shape);

    // Au-dessus de la corbeille, le bloc rétrécit juste ce qu'il faut pour y
    // tenir et se recentre dedans : sans ça, un 10 dépasse du seau des deux
    // côtés et n'a plus l'air d'y entrer.
    const tenir = Math.min(
      1,
      (scene.trash.w * 0.62) / (art.right - art.left),
      (scene.trash.h * 1.7) / (art.bottom - art.top),
    );
    const k = 1 + (tenir - 1) * b.sink;
    const vers = 0.9 * b.sink;

    return {
      art,
      px:
        b.body.position.x + (scene.trash.x - b.body.position.x) * vers +
        (jitter ? (Math.random() - 0.5) * jitter : 0),
      py:
        b.body.position.y + (scene.trash.y - b.body.position.y) * vers +
        (jitter ? (Math.random() - 0.5) * jitter : 0),
      angle: b.body.angle,
      sx: scale * k * (1 + sq * 0.22),
      sy: scale * k * (1 - sq * 0.22),
      pop: b.pop,
      sink: b.sink,
      dragged: b.dragged,
    };
  }

  /** Le liseré blanc du bloc tenu : il déborde, donc il passe dessous. */
  private drawHalo(p: Pose2D, ou?: { x: number; y: number; sx: number; sy: number }) {
    const { ctx } = this;
    const a = ou ?? { x: p.px, y: p.py, sx: p.sx, sy: p.sy };
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(p.angle);
    ctx.scale(a.sx, a.sy);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = PEN + 13;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.stroke(p.art.path);
    ctx.lineWidth = PEN + 6;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.82)';
    ctx.stroke(p.art.path);
    ctx.restore();
  }

  /**
   * Les blocs, en trois temps : les corps en volume, puis les visages au
   * trait par-dessus, puis les objets qui se posent sur ces visages.
   */
  private drawBlocs(scene: Scene, poses: Pose2D[]) {
    const { ctx, relief } = this;
    if (!relief.disponible) return;

    // Le visage au trait se peint sur la face avant du volume, plus proche de
    // l'œil que le plan du bloc : il reçoit donc la même homothétie que cette
    // face, sans quoi il glisserait du corps dès qu'un bloc quitte le centre.
    const k = relief.avantPlan;
    const cx = scene.width / 2;
    const cy = scene.height / 2;
    const avant = (p: Pose2D) => ({
      x: cx + (p.px - cx) * k,
      y: cy + (p.py - cy) * k,
      sx: p.sx * k,
      sy: p.sy * k,
    });

    for (const p of poses) if (p.dragged && p.sx > 0.01) this.drawHalo(p, avant(p));

    const blocs: BlocRelief[] = [];
    scene.blocks.forEach((b, i) => {
      const p = poses[i];
      if (p.sx <= 0.01) return;
      blocs.push({
        value: b.value,
        shape: b.shape,
        skin: b.skin,
        x: p.px,
        y: p.py,
        angle: p.angle,
        sx: p.sx,
        sy: p.sy,
        rang: i,
        dragged: p.dragged,
      });
    });

    const corps = relief.passeCorps(blocs, scene.time);
    if (corps) ctx.drawImage(corps, 0, 0, scene.width, scene.height);

    scene.blocks.forEach((b, i) => {
      const p = poses[i];
      if (p.sx <= 0.01) return;
      const a = avant(p);
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(p.angle);
      ctx.scale(a.sx, a.sy);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      // Pas de rainures dessinées ici : en volume, ce sont les creux entre
      // cubes voisins qui les font, et un trait par-dessus les doublerait.
      this.drawShine(p.art, b.pop);
      // Pas de visage sur un chantier : c'est la matière qui dit ce qu'on
      // regarde, et un personnage y ferait revenir le nombre par la fenêtre.
      if (!b.skin.length) {
        drawCharacter(ctx, b.value, colorFor(b.value), {
          pose: this.pose(b, scene),
          decor: this.faces,
          wardrobe: this.wardrobe,
        });
      }
      ctx.restore();
    });

    const objets = relief.passeObjets(blocs, scene.time);
    if (objets) ctx.drawImage(objets, 0, 0, scene.width, scene.height);
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
    // Et sur un chantier, il n'y a pas de nombre à annoncer.
    if (b.skin.length) return;
    const { ctx } = this;
    const base = colorFor(b.value);
    const label = String(b.value);
    const x = b.body.position.x;
    const w = 21 + label.length * 11;
    const h = 26;
    // Au-dessus du bloc, et assez haut pour dégager le plus haut des chapeaux :
    // la pastille coupait la pointe du chapeau de sorcier et les bois de cerf.
    const y = Math.max(h / 2 + 6, b.body.bounds.min.y - 32);

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
    const art = blockArt(shapeFor(ghost.ok ? sum : 1));
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

  private trashPose(trash: Scene['trash'], time: number) {
    const pulse = trash.hot > 0 ? (0.04 + Math.sin(time / 140) * 0.012) * trash.hot : 0;
    return (0.86 + 0.14 * trash.show) * (1 + pulse - trash.gulp * 0.14);
  }

  /**
   * Une trappe creusée dans le sol, sous la ligne où les blocs se posent.
   *
   * Elle n'apparaît que pendant un glisser, et elle est hors du terrain de
   * jeu : partout ailleurs elle occupait une place où des blocs vivent, et
   * glisser un bloc vers son voisin pour le fusionner le jetait par accident.
   * Sous le sol, aucune fusion ne passe jamais par là.
   */
  private drawTrashBack({ trash, time }: Scene) {
    if (trash.show <= 0.01) return;
    const { ctx } = this;
    const { hot } = trash;
    const rx = trash.w / 2;
    const ry = trash.h / 2;

    ctx.save();
    ctx.globalAlpha = trash.show;
    ctx.translate(trash.x, trash.y);
    const s = this.trashPose(trash, time);
    ctx.scale(s, s);

    if (hot > 0.01) {
      const halo = ctx.createRadialGradient(0, 0, ry, 0, 0, rx * 1.1);
      halo.addColorStop(0, `rgba(255, 126, 112, ${(0.4 * hot).toFixed(3)})`);
      halo.addColorStop(1, 'rgba(255, 126, 112, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx * 1.1, ry * 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const puits = ctx.createLinearGradient(0, -ry, 0, ry);
    puits.addColorStop(0, '#04060b');
    puits.addColorStop(1, mix('#161D2A', '#63291F', hot));
    ctx.fillStyle = puits;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // Liseré du bord arrière : c'est lui qui creuse le trou dans le sol.
    ctx.strokeStyle = `rgba(226, 238, 255, ${(0.2 + 0.45 * hot).toFixed(2)})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, Math.PI, 2 * Math.PI);
    ctx.stroke();

    ctx.restore();
  }

  /** La lèvre avant et les battants : le bloc lâché plonge derrière. */
  private drawTrashFront({ trash, time }: Scene) {
    if (trash.show <= 0.01) return;
    const { ctx } = this;
    const { hot } = trash;
    const rx = trash.w / 2;
    const ry = trash.h / 2;

    ctx.save();
    ctx.globalAlpha = trash.show;
    ctx.translate(trash.x, trash.y);
    const s = this.trashPose(trash, time);
    ctx.scale(s, s);

    // Le bas du trou repasse par-dessus le bloc : sans ça, le bloc flotte
    // devant la trappe au lieu d'y descendre.
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();
    const levre = ctx.createLinearGradient(0, ry * 0.1, 0, ry);
    levre.addColorStop(0, mix('#242D40', '#8C3A2C', hot));
    levre.addColorStop(1, mix('#3B4762', '#C4523B', hot));
    ctx.fillStyle = levre;
    ctx.beginPath();
    ctx.ellipse(0, ry * 0.62, rx, ry * 0.82, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = `rgba(226, 238, 255, ${(0.24 + 0.4 * hot).toFixed(2)})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI);
    ctx.stroke();

    // Deux battants qui s'ouvrent quand le doigt approche : c'est le seul
    // signal qui dit « lâche ici » sans un mot.
    const fw = rx * 0.34;
    ctx.fillStyle = mix('#4B5875', '#E8705E', hot);
    for (const cote of [-1, 1]) {
      ctx.save();
      ctx.translate(cote * rx, 0);
      ctx.rotate(cote * 1.1 * hot);
      ctx.beginPath();
      ctx.roundRect(cote < 0 ? 0 : -fw, -5.5, fw, 11, 5.5);
      ctx.fill();
      ctx.restore();
    }

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
