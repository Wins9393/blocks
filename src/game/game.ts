import Matter from 'matter-js';
import {
  BOTTOM_SAFE,
  DRAG_GAIN,
  DRAG_MAX_SPEED,
  FALLBACK_HEIGHT,
  FALLBACK_WIDTH,
  FIXED_DT,
  MAX_SUBSTEPS,
  MAX_UNITS,
  MAX_VALUE,
  MERGE_GAP,
  MERGE_MIN_TRAVEL,
  UNIT,
} from '../core/constants';
import { colorFor } from '../core/palette';
import { centeredCells, shapeFor } from '../core/shape';
import * as sfx from '../audio/sfx';
import { ShakeDetector, partitionByCut, segmentHitsBox, sliceFromPath } from '../input/gestures';
import type { Cut, Sample } from '../input/gestures';
import { World, minPartGap, rightingSpin } from '../physics/world';
import type { Block } from '../physics/world';
import type { Wardrobe } from '../core/wardrobe';
import { Renderer } from '../render/renderer';
import type { BlockVisual, Ghost, Particle, Scene } from '../render/renderer';
import { loadScene, saveScene } from './persist';
import type { SavedBlock } from './persist';

const { Body, Events, Sleeping, Vector } = Matter;

export interface GameState {
  blocks: number;
  units: number;
  canUndo: boolean;
  full: boolean;
  /** Valeurs des blocs présents : c'est là-dessus que les missions statuent. */
  values: number[];
}

interface Visual {
  pop: number;
  squash: number;
  shake: number;
  blink: number;
  blinkAt: number;
}

interface Drag {
  blockId: number;
  ox: number;
  oy: number;
  px: number;
  py: number;
  dirX: number;
  dirY: number;
  travelled: number;
  shake: ShakeDetector;
  candidate: number | null;
}

interface Slice {
  path: Sample[];
}

const UNDO_DEPTH = 40;

export class Game {
  readonly world = new World();
  private renderer: Renderer;
  private visuals = new Map<number, Visual>();
  private drags = new Map<number, Drag>();
  private slices = new Map<number, Slice>();
  private particles: Particle[] = [];
  private undoStack: SavedBlock[][] = [];
  private trashGulp = 0;
  /** 0..1 : la corbeille n'existe à l'écran que pendant un glisser. */
  private trashShow = 0;
  private trashHot = 0;
  private pointer: { x: number; y: number } | null = null;
  private raf = 0;
  private acc = 0;
  private last = 0;
  private time = 0;
  private dirty = false;
  private saveAt = 0;
  private listeners = new Set<(s: GameState) => void>();

  constructor(
    private canvas: HTMLCanvasElement,
    private spaceId: string,
  ) {
    this.renderer = new Renderer(canvas);
  }

  // --- cycle de vie -----------------------------------------------------

  mount() {
    this.handleResize();
    window.addEventListener('resize', this.handleResize);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    // Suite du geste écoutée sur la fenêtre, pas sur le canvas : la capture de
    // pointeur est capricieuse au doigt, et sans elle un glisser qui passe
    // au-dessus d'une barre d'interface perdait ses mouvements en route — le
    // bloc restait figé et le lâcher ne tombait nulle part.
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    this.canvas.addEventListener('pointerleave', this.onPointerLeave);
    window.addEventListener('pagehide', this.flush);
    window.addEventListener('blur', this.releaseEverything);
    document.addEventListener('visibilitychange', this.onVisibility);
    Events.on(this.world.engine, 'collisionStart', this.onCollision);

    this.restore();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  unmount() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.handleResize);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    window.removeEventListener('pagehide', this.flush);
    window.removeEventListener('blur', this.releaseEverything);
    document.removeEventListener('visibilitychange', this.onVisibility);
    Events.off(this.world.engine, 'collisionStart', this.onCollision);
    this.flush();
  }

  subscribe(fn: (s: GameState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state());
    return () => this.listeners.delete(fn);
  }

  private state(): GameState {
    return {
      blocks: this.world.blocks.size,
      units: this.world.totalUnits,
      canUndo: this.undoStack.length > 0,
      full: this.world.totalUnits >= MAX_UNITS,
      values: [...this.world.blocks.values()].map((b) => b.value),
    };
  }

  private emit() {
    const s = this.state();
    for (const fn of this.listeners) fn(s);
  }

  private handleResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // Onglet masqué ou panneau replié : la fenêtre peut mesurer zéro.
    if (w < 2 || h < 2) {
      // Une scène déjà bâtie n'a rien à y gagner : on la laisse intacte et on
      // attend le prochain redimensionnement. Mais s'il s'agit du tout premier
      // dimensionnement, il faut bien une taille de repli, sans quoi le monde
      // reste sans sol ni murs et tout tombe dans le vide.
      if (this.world.width > 0) return;
      this.renderer.resize(FALLBACK_WIDTH, FALLBACK_HEIGHT);
      this.world.resize(FALLBACK_WIDTH, FALLBACK_HEIGHT, BOTTOM_SAFE);
      return;
    }

    this.renderer.resize(w, h);
    this.world.resize(w, h, BOTTOM_SAFE);
  };

  private onVisibility = () => {
    if (document.visibilityState !== 'hidden') return;
    this.flush();
    this.releaseEverything();
  };

  /**
   * Un appel entrant ou un changement d'application peut avaler le pointerup :
   * sans ça, le bloc resterait collé a un doigt qui n'existe plus.
   */
  private releaseEverything = () => {
    for (const drag of this.drags.values()) this.releaseDrag(drag);
    this.drags.clear();
    this.slices.clear();
    this.pointer = null;
  };

  // --- actions publiques ------------------------------------------------

  /** Pose un bloc de la valeur demandée, tombé du haut de l'écran. */
  spawn(value: number) {
    const v = Math.min(MAX_VALUE, Math.max(1, Math.round(value)));
    if (this.world.totalUnits + v > MAX_UNITS) {
      sfx.playRefuse();
      return;
    }
    this.snapshot();
    const x = this.world.width * 0.5 + (Math.random() - 0.5) * Math.min(220, this.world.width * 0.5);
    // Un grand bloc lâché trop haut naît la tête hors de l'écran : on descend
    // le point de chute d'autant que le bloc est haut.
    const y = 40 + (shapeFor(v).h * UNIT) / 2;
    const block = this.world.add(v, x, y, (Math.random() - 0.5) * 0.6);
    Body.setVelocity(block.body, { x: (Math.random() - 0.5) * 3, y: 2 });
    this.track(block);
    sfx.playSpawn(v);
    this.dirty = true;
    this.emit();
  }

  undo() {
    const snap = this.undoStack.pop();
    if (!snap) return;
    this.load(snap);
    sfx.playPeel();
    this.dirty = true;
    this.emit();
  }

  clearAll() {
    if (this.wipe(true)) sfx.playTrash();
  }

  /**
   * Range la scène entre deux missions.
   *
   * Sans ça, les blocs qui restent valident souvent la mission suivante sans
   * que l'enfant ait rien fait. Ce n'est pas la corbeille : les blocs se
   * dispersent sur place, avec le petit son du détachement, et rien ne part
   * dans la trappe — on range la table, on ne jette pas le travail.
   */
  tidy() {
    if (this.wipe(false)) sfx.playPeel();
  }

  /** Vide la scène. `versCorbeille` envoie la fournée dans la trappe. */
  private wipe(versCorbeille: boolean): boolean {
    if (this.world.blocks.size === 0) return false;
    this.snapshot();
    for (const block of this.world.blocks.values()) {
      this.burst(block, 2, versCorbeille ? this.world.trash : undefined);
    }
    // La corbeille se montre pour avaler la fournée, puis s'efface.
    if (versCorbeille) this.trashGulp = 1;
    this.world.clear();
    this.visuals.clear();
    this.drags.clear();
    this.dirty = true;
    this.emit();
    return true;
  }

  // --- sauvegarde -------------------------------------------------------

  private serialize(): SavedBlock[] {
    return [...this.world.blocks.values()].map((b) => ({
      v: b.value,
      x: Math.round(b.body.position.x),
      y: Math.round(b.body.position.y),
      // Angle ramené dans [-pi, pi] : le cumul des tours n'a aucun sens à
      // relire et finit par ronger la précision des sinus.
      a: Number(Math.atan2(Math.sin(b.body.angle), Math.cos(b.body.angle)).toFixed(3)),
    }));
  }

  /**
   * `savedWidth` sert à remettre la scène à l'échelle : sans ça, une scène
   * enregistrée sur un grand écran revient toute empilée sur un petit.
   */
  private load(saved: SavedBlock[], savedWidth: number = this.world.width) {
    this.world.clear();
    this.visuals.clear();
    this.drags.clear();
    this.slices.clear();
    const ratio = savedWidth > 0 ? this.world.width / savedWidth : 1;
    for (const s of saved) {
      const block = this.world.add(
        Math.min(MAX_VALUE, Math.max(1, Math.round(s.v))),
        clamp(s.x * ratio, UNIT, this.world.width - UNIT),
        Math.min(s.y, this.world.groundY),
        s.a,
      );
      this.track(block, 0);
    }
  }

  private restore() {
    const saved = loadScene(this.spaceId);
    // Même vide : charger, c'est aussi vider la scène précédente.
    this.load(saved?.blocks ?? [], saved?.w);
    this.emit();
  }

  /**
   * Fête les blocs d'une valeur : ils sautent et se couvrent d'étincelles.
   *
   * La réussite se voit d'abord dans la scène, sur le bloc qu'on vient de
   * fabriquer. Un panneau qui s'ouvre aussitôt cache la forme au moment précis
   * où l'enfant veut la regarder.
   */
  celebrate(value: number) {
    for (const block of this.world.blocks.values()) {
      if (block.value !== value) continue;
      this.sparkle(block.body.position.x, block.body.position.y, block.value, colorFor(value));
      const visual = this.visuals.get(block.id);
      if (visual) {
        visual.pop = 0.5;
        visual.squash = 0.55;
      }
      this.world.wake(block);
      Body.setVelocity(block.body, { x: block.body.velocity.x, y: -5.5 });
    }
    this.dirty = true;
  }

  /** La tenue des blocs de cet espace. */
  setWardrobe(wardrobe: Wardrobe) {
    this.renderer.setWardrobe(wardrobe);
    this.dirty = true;
  }

  /**
   * Passe à l'espace d'un autre enfant. La scène en cours part d'abord sur
   * son propre rayon, sinon elle finirait chez le suivant.
   */
  useSpace(id: string) {
    if (id === this.spaceId) return;
    this.flush();
    this.spaceId = id;
    this.undoStack.length = 0;
    this.particles.length = 0;
    this.restore();
  }

  private snapshot() {
    this.undoStack.push(this.serialize());
    if (this.undoStack.length > UNDO_DEPTH) this.undoStack.shift();
  }

  private flush = () => {
    saveScene(this.spaceId, { w: this.world.width, blocks: this.serialize() });
    this.dirty = false;
  };

  // --- suivi visuel -----------------------------------------------------

  private track(block: Block, pop = 1) {
    this.visuals.set(block.id, {
      pop,
      squash: 0,
      shake: 0,
      blink: 0,
      blinkAt: this.time + 1500 + Math.random() * 4000,
    });
  }

  private visual(id: number): Visual {
    let v = this.visuals.get(id);
    if (!v) {
      v = { pop: 0, squash: 0, shake: 0, blink: 0, blinkAt: this.time + 3000 };
      this.visuals.set(id, v);
    }
    return v;
  }

  // --- pointeur ---------------------------------------------------------

  private toLocal(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onPointerDown = (e: PointerEvent) => {
    e.preventDefault();
    sfx.unlockAudio();
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Le pointeur peut avoir déjà disparu (souris qui sort de la fenêtre).
    }
    const p = this.toLocal(e);
    this.pointer = p;

    const block = this.world.blockAt(p);
    if (block) {
      this.world.wake(block);
      const shake = new ShakeDetector();
      shake.reset({ x: p.x, y: p.y, t: e.timeStamp });
      this.drags.set(e.pointerId, {
        blockId: block.id,
        ox: block.body.position.x - p.x,
        oy: block.body.position.y - p.y,
        px: p.x,
        py: p.y,
        dirX: 0,
        dirY: -1,
        travelled: 0,
        shake,
        candidate: null,
      });
    } else {
      // Doigt posé dans le vide : c'est peut-être le début d'une coupe.
      this.slices.set(e.pointerId, { path: [{ x: p.x, y: p.y, t: e.timeStamp }] });
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    const p = this.toLocal(e);
    this.pointer = p;

    const drag = this.drags.get(e.pointerId);
    if (drag) {
      const dx = p.x - drag.px;
      const dy = p.y - drag.py;
      drag.travelled += Math.hypot(dx, dy);
      if (Math.hypot(dx, dy) > 2) {
        drag.dirX = dx;
        drag.dirY = dy;
      }
      drag.px = p.x;
      drag.py = p.y;
      if (drag.shake.push({ x: p.x, y: p.y, t: e.timeStamp })) this.peel(drag);
      return;
    }

    const slice = this.slices.get(e.pointerId);
    if (slice) {
      slice.path.push({ x: p.x, y: p.y, t: e.timeStamp });
      if (slice.path.length > 24) slice.path.shift();
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    const drag = this.drags.get(e.pointerId);
    if (drag) {
      this.drags.delete(e.pointerId);
      this.releaseDrag(drag);
    }

    const slice = this.slices.get(e.pointerId);
    if (slice) {
      this.slices.delete(e.pointerId);
      const cut = sliceFromPath(slice.path);
      if (cut) this.applyCut(cut);
    }

    if (this.drags.size === 0 && this.slices.size === 0) this.pointer = null;
  };

  private onPointerLeave = () => {
    if (this.drags.size === 0 && this.slices.size === 0) this.pointer = null;
  };

  // --- manipulation -----------------------------------------------------

  private applyDrags() {
    for (const drag of this.drags.values()) {
      const block = this.world.blocks.get(drag.blockId);
      if (!block) continue;
      const tx = clamp(drag.px + drag.ox, UNIT * 0.6, this.world.width - UNIT * 0.6);
      const ty = clamp(drag.py + drag.oy, -240, this.world.groundY - UNIT * 0.4);

      let vx = (tx - block.body.position.x) * DRAG_GAIN;
      let vy = (ty - block.body.position.y) * DRAG_GAIN;
      const speed = Math.hypot(vx, vy);
      if (speed > DRAG_MAX_SPEED) {
        vx = (vx / speed) * DRAG_MAX_SPEED;
        vy = (vy / speed) * DRAG_MAX_SPEED;
      }
      Sleeping.set(block.body, false);
      Body.setVelocity(block.body, { x: vx, y: vy });
      Body.setAngularVelocity(block.body, rightingSpin(block.body.angle));
    }
  }

  /** Le bloc voisin avec lequel une fusion serait proposée, ou null. */
  private findCandidate(block: Block): Block | null {
    let best: Block | null = null;
    let bestGap = MERGE_GAP;
    for (const other of this.world.blocks.values()) {
      if (other.id === block.id) continue;
      if (this.isDragged(other.id)) continue;
      if (!boundsOverlap(block.body.bounds, other.body.bounds, MERGE_GAP)) continue;
      const gap = minPartGap(block.body, other.body);
      if (gap < bestGap) {
        bestGap = gap;
        best = other;
      }
    }
    return best;
  }

  private isDragged(id: number): boolean {
    for (const d of this.drags.values()) if (d.blockId === id) return true;
    return false;
  }

  private releaseDrag(drag: Drag) {
    const block = this.world.blocks.get(drag.blockId);
    if (!block) return;

    if (this.world.isOverTrash({ x: drag.px, y: drag.py })) {
      this.trash(block);
      return;
    }

    // Un simple tap ne fusionne pas : sans déplacement, il n'y a pas d'intention.
    const candidate =
      drag.travelled > MERGE_MIN_TRAVEL && drag.candidate != null
        ? this.world.blocks.get(drag.candidate)
        : null;
    if (candidate) {
      if (this.canMerge(block.value + candidate.value)) this.merge(block, candidate);
      else sfx.playRefuse();
    }
    this.dirty = true;
    this.emit();
  }

  /** La fusion s'arrête au plafond, et avant si le bloc ne tient pas à l'écran. */
  private canMerge(sum: number): boolean {
    return sum <= MAX_VALUE && this.world.fits(sum);
  }

  private merge(a: Block, b: Block) {
    this.snapshot();
    const value = a.value + b.value;
    const x = (a.body.position.x + b.body.position.x) / 2;
    const y = (a.body.position.y + b.body.position.y) / 2;
    const vx = (a.body.velocity.x + b.body.velocity.x) / 2;
    const vy = (a.body.velocity.y + b.body.velocity.y) / 2;

    this.sparkle(x, y, value, colorFor(value));
    this.world.remove(a.id);
    this.world.remove(b.id);
    this.visuals.delete(a.id);
    this.visuals.delete(b.id);

    const merged = this.world.add(value, clamp(x, UNIT, this.world.width - UNIT), y, 0, {
      x: vx * 0.4,
      y: vy * 0.4,
    });
    this.track(merged);
    sfx.playMerge(value);
    sfx.say(value);
    this.dirty = true;
    this.emit();
  }

  /** Une secousse détache une unité du bloc tenu. */
  private peel(drag: Drag) {
    const block = this.world.blocks.get(drag.blockId);
    if (!block) return;
    if (block.value <= 1) {
      this.visual(block.id).shake = 1;
      return;
    }

    this.snapshot();
    const { x, y } = block.body.position;
    const halfW = (block.body.bounds.max.x - block.body.bounds.min.x) / 2;
    const side = drag.dirX >= 0 ? -1 : 1; // l'unité part à l'opposé du mouvement
    const reduced = this.world.reshape(block.id, block.value - 1);
    if (!reduced) return;
    this.visual(reduced.id).shake = 1;

    const unit = this.world.add(1, x + side * (halfW + UNIT * 1.1), y - UNIT * 0.4, 0, {
      x: side * 7 + drag.dirX * 0.2,
      y: -6,
    });
    Body.setAngularVelocity(unit.body, side * 0.25);
    this.track(unit);
    this.burst(unit, 4);
    sfx.playPeel();
    sfx.say(reduced.value);
    this.dirty = true;
    this.emit();
  }

  private trash(block: Block) {
    this.snapshot();
    this.burst(block, 3, this.world.trash);
    this.world.remove(block.id);
    this.visuals.delete(block.id);
    this.trashGulp = 1;
    sfx.playTrash();
    this.dirty = true;
    this.emit();
  }

  /** Une coupe franche sépare un bloc selon le nombre de cubes de chaque côté. */
  private applyCut(cut: Cut) {
    const victims: Block[] = [];
    for (const block of this.world.blocks.values()) {
      if (this.isDragged(block.id)) continue;
      if (segmentHitsBox(cut, block.body.bounds.min, block.body.bounds.max)) victims.push(block);
    }
    if (victims.length === 0) return;

    let cutSomething = false;
    for (const block of victims) {
      // On répartit les cubes, pas les parties du corps : depuis que la forme
      // de collision est pavée de rectangles, une partie vaut plusieurs cubes.
      const [plus, minus] = partitionByCut(cut, cubePositions(block));
      if (plus.length === 0 || minus.length === 0) continue;

      if (!cutSomething) {
        this.snapshot();
        cutSomething = true;
      }

      const nx = -(cut.by - cut.ay);
      const ny = cut.bx - cut.ax;
      const len = Math.hypot(nx, ny) || 1;
      const normal = { x: nx / len, y: ny / len };
      const angle = block.body.angle;
      const velocity = block.body.velocity;

      const halves: Array<[{ x: number; y: number }[], number]> = [
        [plus, 1],
        [minus, -1],
      ];
      this.world.remove(block.id);
      this.visuals.delete(block.id);

      for (const [group, sign] of halves) {
        const cx = group.reduce((s, p) => s + p.x, 0) / group.length;
        const cy = group.reduce((s, p) => s + p.y, 0) / group.length;
        const piece = this.world.add(
          group.length,
          clamp(cx + normal.x * sign * UNIT * 0.6, UNIT, this.world.width - UNIT),
          cy + normal.y * sign * UNIT * 0.6,
          angle,
          {
            x: velocity.x + normal.x * sign * 4.5,
            y: velocity.y + normal.y * sign * 4.5 - 1,
          },
        );
        this.track(piece);
        sfx.say(piece.value);
      }
      this.sparkleLine(cut);
    }

    if (cutSomething) {
      sfx.playSlice();
      this.dirty = true;
      this.emit();
    }
  }

  // --- particules -------------------------------------------------------

  private burst(block: Block, perCube: number, target?: { x: number; y: number }) {
    const color = colorFor(block.value);
    for (const { x, y } of cubePositions(block)) {
      for (let i = 0; i < perCube; i++) {
        this.particles.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 5,
          vy: (Math.random() - 0.5) * 5 - 2,
          life: 1,
          maxLife: 1,
          size: 4 + Math.random() * 6,
          color,
          target,
        });
      }
    }
  }

  private sparkle(x: number, y: number, count: number, color: string) {
    for (let i = 0; i < count * 4 + 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 6;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 1.5,
        life: 1,
        maxLife: 1,
        size: 3 + Math.random() * 5,
        color,
      });
    }
  }

  private sparkleLine(cut: Cut) {
    for (let i = 0; i <= 14; i++) {
      const k = i / 14;
      this.particles.push({
        x: cut.ax + (cut.bx - cut.ax) * k,
        y: cut.ay + (cut.by - cut.ay) * k,
        vx: (Math.random() - 0.5) * 3,
        vy: (Math.random() - 0.5) * 3,
        life: 0.6,
        maxLife: 0.6,
        size: 3 + Math.random() * 3,
        color: '#ffffff',
      });
    }
  }

  private stepParticles(dt: number) {
    const k = dt / 16.666;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      if (p.target) {
        p.vx += (p.target.x - p.x) * 0.012 * k;
        p.vy += (p.target.y - p.y) * 0.012 * k;
        p.vx *= 0.94;
        p.vy *= 0.94;
      } else {
        p.vy += 0.32 * k;
      }
      p.x += p.vx * k;
      p.y += p.vy * k;
      p.life -= dt / 620;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  // --- impacts ----------------------------------------------------------

  private onCollision = (event: Matter.IEventCollision<Matter.Engine>) => {
    let sounds = 0;
    for (const pair of event.pairs) {
      const a = pair.bodyA.parent;
      const b = pair.bodyB.parent;
      const relative = Vector.magnitude(Vector.sub(a.velocity, b.velocity));
      if (relative < 3.2) continue;
      const strength = Math.min(1, relative / 16);
      for (const body of [a, b]) {
        const id = (body as Matter.Body & { blockId?: number }).blockId;
        if (id == null) continue;
        const v = this.visual(id);
        v.squash = Math.max(v.squash, strength * 0.9);
      }
      if (sounds < 3) {
        sfx.playImpact(relative);
        sounds++;
      }
    }
  };

  // --- boucle -----------------------------------------------------------

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    // Borné des deux côtés : un pas négatif ferait remonter les animations
    // au lieu de les avancer, et les blocs repartiraient en arrière.
    const dt = Math.min(64, Math.max(0, now - this.last));
    this.last = now;
    this.time = now;

    this.acc += dt;
    let steps = 0;
    while (this.acc >= FIXED_DT && steps < MAX_SUBSTEPS) {
      this.applyDrags();
      this.world.step(FIXED_DT);
      this.acc -= FIXED_DT;
      steps++;
    }
    if (this.acc > FIXED_DT * MAX_SUBSTEPS) this.acc = 0;

    this.updateCandidates();
    this.updateVisuals(dt);
    this.stepParticles(dt);
    this.trashGulp = Math.max(0, this.trashGulp - dt / 260);

    // Elle apparaît dès qu'un bloc est tenu, et repart dès qu'on lâche.
    const visible = this.drags.size > 0 || this.trashGulp > 0;
    this.trashShow = clamp(this.trashShow + (visible ? dt / 130 : -dt / 190), 0, 1);
    const survolee = [...this.drags.values()].some((d) =>
      this.world.isOverTrash({ x: d.px, y: d.py }),
    );
    this.trashHot = clamp(this.trashHot + (survolee ? dt / 90 : -dt / 110), 0, 1);

    this.renderer.draw(this.buildScene());

    if (this.dirty && now - this.saveAt > 900) {
      this.saveAt = now;
      this.flush();
    }
  };

  private updateCandidates() {
    for (const drag of this.drags.values()) {
      const block = this.world.blocks.get(drag.blockId);
      if (!block) {
        drag.candidate = null;
        continue;
      }
      if (drag.travelled <= MERGE_MIN_TRAVEL || this.world.isOverTrash({ x: drag.px, y: drag.py })) {
        drag.candidate = null;
        continue;
      }
      drag.candidate = this.findCandidate(block)?.id ?? null;
    }
  }

  private updateVisuals(dt: number) {
    for (const [id, v] of this.visuals) {
      if (!this.world.blocks.has(id)) {
        this.visuals.delete(id);
        continue;
      }
      v.pop = Math.max(0, v.pop - dt / 320);
      v.squash = Math.max(0, v.squash - dt / 260);
      v.shake = Math.max(0, v.shake - dt / 240);
      if (v.blink > 0) {
        v.blink = Math.max(0, v.blink - dt / 90);
      } else if (this.time > v.blinkAt) {
        v.blink = 1;
        v.blinkAt = this.time + 2500 + Math.random() * 5000;
      }
    }
    for (const drag of this.drags.values()) drag.shake.decay(dt);
  }

  /** Les blocs tenus au-dessus de la corbeille, prêts à y tomber. */
  private get plongeurs(): Set<number> {
    const ids = new Set<number>();
    for (const d of this.drags.values()) {
      if (this.world.isOverTrash({ x: d.px, y: d.py })) ids.add(d.blockId);
    }
    return ids;
  }

  private buildScene(): Scene {
    const blocks: BlockVisual[] = [];
    for (const block of this.world.blocks.values()) {
      const v = this.visual(block.id);
      blocks.push({
        id: block.id,
        value: block.value,
        body: block.body,
        pop: v.pop,
        squash: v.squash,
        shake: v.shake,
        blink: v.blink,
        dragged: this.isDragged(block.id),
        sink: this.plongeurs.has(block.id) ? this.trashHot : 0,
      });
    }

    let ghost: Ghost | null = null;
    for (const drag of this.drags.values()) {
      const block = this.world.blocks.get(drag.blockId);
      const other = drag.candidate != null ? this.world.blocks.get(drag.candidate) : null;
      if (block && other && !ghost) {
        const sum = block.value + other.value;
        const ok = this.canMerge(sum);
        // L'aperçu flotte au-dessus du couple : posé entre les deux blocs, il
        // serait masqué par eux et l'enfant ne verrait pas le résultat.
        const halfH = (shapeFor(ok ? sum : 1).h * UNIT) / 2;
        const above = Math.min(block.body.bounds.min.y, other.body.bounds.min.y);
        ghost = {
          a: block.value,
          b: other.value,
          x: clamp(
            (block.body.position.x + other.body.position.x) / 2,
            UNIT * 2,
            this.world.width - UNIT * 2,
          ),
          y: Math.max(halfH + 54, above - halfH - 34),
          ok,
        };
      }
    }

    const slicePath = [...this.slices.values()][0]?.path ?? null;

    return {
      blocks,
      particles: this.particles,
      ghost,
      slice: slicePath,
      trash: {
        ...this.world.trash,
        hot: this.trashHot,
        gulp: this.trashGulp,
        show: this.trashShow,
      },
      groundY: this.world.groundY,
      width: this.world.width,
      height: this.world.height,
      pointer: this.pointer,
      time: this.time,
    };
  }
}

/** Position monde du centre de chaque cube d'un bloc, rotation comprise. */
function cubePositions(block: Block): Array<{ x: number; y: number }> {
  const cos = Math.cos(block.body.angle);
  const sin = Math.sin(block.body.angle);
  return centeredCells(block.value).map((cell) => {
    const ox = cell.x * UNIT;
    const oy = cell.y * UNIT;
    return {
      x: block.body.position.x + ox * cos - oy * sin,
      y: block.body.position.y + ox * sin + oy * cos,
    };
  });
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function boundsOverlap(a: Matter.Bounds, b: Matter.Bounds, pad: number): boolean {
  return (
    a.min.x - pad < b.max.x &&
    a.max.x + pad > b.min.x &&
    a.min.y - pad < b.max.y &&
    a.max.y + pad > b.min.y
  );
}
