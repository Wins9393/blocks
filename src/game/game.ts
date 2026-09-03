import Matter from 'matter-js';
import {
  BOTTOM_SAFE,
  BOTTOM_SAFE_LARGE,
  LARGE_MIN,
  DRAG_GAIN,
  DRAG_MAX_SPEED,
  FALLBACK_HEIGHT,
  FALLBACK_WIDTH,
  FIXED_DT,
  MAX_SUBSTEPS,
  MAX_CUBES,
  MAX_UNITS,
  MAX_VALUE,
  MERGE_GAP,
  MERGE_MIN_TRAVEL,
  UNIT,
} from '../core/constants';
import { colorFor } from '../core/palette';
import { centeredOf, connectedParts, shapeFor, shapeOf } from '../core/shape';
import type { Cell } from '../core/shape';
import { caseEnMonde, rotateCell, weld } from '../core/build';
import { CHENE, matiereFor, newSkin } from '../core/matieres';
import type { Skin } from '../core/matieres';
import {
  MONDE,
  SOL_Y,
  cameraDepart,
  cameraIdentite,
  centreVue,
  clampCamera,
  toWorld,
} from '../core/camera';
import type { Camera, Vue } from '../core/camera';
import * as sfx from '../audio/sfx';
import { ShakeDetector, partitionByCut, segmentHitsBox, sliceFromPath } from '../input/gestures';
import type { Cut, Sample } from '../input/gestures';
import { World, minPartGap, rightingSpin } from '../physics/world';
import type { Block } from '../physics/world';
import type { Wardrobe } from '../core/wardrobe';
import { Renderer } from '../render/renderer';
import type { Apercu, BlockVisual, Ghost, Particle, Scene } from '../render/renderer';
import { loadBuild, loadScene, saveBuild, saveScene } from './persist';
import type { SavedBlock, SavedPiece, SceneKind } from './persist';

/** Ce qu'une annulation remet en place : des nombres, ou un chantier. */
type Snapshot = SavedBlock[] | SavedPiece[];

const { Body, Events, Sleeping, Vector } = Matter;

export interface GameState {
  blocks: number;
  units: number;
  canUndo: boolean;
  full: boolean;
  /** Cubes que la scène accepte encore : la barre s'en sert pour se griser. */
  plafond: number;
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
  /** Dernière position **à l'écran** : c'est elle qui décide du défilement au
   *  bord et du retour à la barre, tous deux fixés à l'écran. */
  ex: number;
  ey: number;
  dirX: number;
  dirY: number;
  travelled: number;
  shake: ShakeDetector;
  candidate: number | null;
  /**
   * Le défilement au bord attend que le doigt soit entré franchement dans le
   * cadre.
   *
   * Un cube tiré de la barre naît *dans* la bande du bas, et souvent dans celle
   * d'un côté — le premier bouton est à 46 px du bord. Sans cet armement, le
   * monde se mettrait à filer avant que l'enfant ait bougé d'un millimètre.
   * Attraper un bloc déjà collé au bord obéit désormais à la même règle : il
   * faut s'en éloigner une fois pour que le retour au bord veuille dire
   * quelque chose.
   */
  bordArme: boolean;
  /**
   * L'état d'avant, pour un cube né sous le doigt dans la barre.
   *
   * Il n'entre dans la pile d'annulation qu'au moment où le cube est gardé :
   * un cube tiré puis rendu à la barre n'a rien changé, et laisser deux
   * entrées derrière lui rendrait « annuler » muet deux fois de suite.
   */
  avant: Snapshot | null;
}

interface Slice {
  path: Sample[];
}

/**
 * Un doigt qui navigue. Deux dans le vide déplacent et zooment ; un seul coupe.
 * C'est sans ambiguïté, parce qu'un glisser de bloc exige d'avoir attrapé un
 * bloc : deux doigts dans le vide ne peuvent être que la navigation.
 */
interface Nav {
  x: number;
  y: number;
}

const UNDO_DEPTH = 40;

export class Game {
  readonly world = new World();
  private renderer: Renderer;
  private visuals = new Map<number, Visual>();
  private drags = new Map<number, Drag>();
  private slices = new Map<number, Slice>();
  private navs = new Map<number, Nav>();
  /** L'état de la caméra au début du geste à deux doigts. */
  private navDepart: { cam: Camera; centre: Nav; ecart: number } | null = null;
  /**
   * La caméra du chantier, gardée d'un redimensionnement à l'autre et rangée
   * avec la scène. Nulle tant qu'on n'y est pas allé.
   */
  private camChantier: Camera | null = null;
  private camera: Camera = { x: 0, y: 0, k: 1 };
  private vue: Vue = { w: FALLBACK_WIDTH, h: FALLBACK_HEIGHT, inset: BOTTOM_SAFE };
  private particles: Particle[] = [];
  private undoStack: Snapshot[] = [];
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
    /** Laquelle des deux scènes de l'espace est sur la table. */
    private kind: SceneKind = 'nombres',
  ) {
    this.renderer = new Renderer(canvas);
  }

  /** Sur un chantier, on ne compte plus : ni valeur, ni visage, ni voix. */
  private get chantier(): boolean {
    return this.kind === 'chantier';
  }

  /** Le plafond de cubes : plus haut sur un chantier, où le monde est plus grand. */
  private get plafond(): number {
    return this.chantier ? MAX_CUBES : MAX_UNITS;
  }

  /** La couleur d'un bloc : sa matière sur un chantier, son nombre sinon. */
  private couleur(block: Block): string {
    return block.skin.length ? matiereFor(block.skin[0].mat).couleur : colorFor(block.value);
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
      full: this.world.totalUnits >= this.plafond,
      plafond: this.plafond,
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
      this.poseLeMonde(FALLBACK_WIDTH, FALLBACK_HEIGHT);
      return;
    }

    this.renderer.resize(w, h);
    this.poseLeMonde(w, h);
  };

  /**
   * Les bornes du monde et la caméra, selon le mode.
   *
   * Au mode nombre, le monde est l'écran et la caméra vise son centre à
   * l'échelle 1 : `toScreen` y est rigoureusement l'identité, et rien de ce qui
   * a été mesuré au pixel ne bouge. Sur un chantier, le monde est un rectangle
   * fixe et la caméra s'y promène.
   */
  private poseLeMonde(w: number, h: number) {
    this.vue = { w, h, inset: margeBas(w) };
    if (this.chantier) {
      this.world.resize(MONDE.w, MONDE.h, SOL_Y);
      this.camChantier = clampCamera(this.camChantier ?? cameraDepart(this.vue), this.vue);
      this.camera = this.camChantier;
    } else {
      this.world.resize(w, h, h - this.vue.inset);
      this.camera = cameraIdentite(this.vue);
    }
  }

  /** Bouger la caméra passe toujours par ici : elle reste dans les bornes. */
  private cadre(cam: Camera) {
    this.camera = clampCamera(cam, this.vue);
    if (this.chantier) this.camChantier = this.camera;
    this.dirty = true;
  }

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
    this.navs.clear();
    this.navDepart = null;
    this.pointer = null;
  };

  // --- actions publiques ------------------------------------------------

  /** Pose un bloc de la valeur demandée, tombé du haut de l'écran. */
  spawn(value: number) {
    const v = Math.min(MAX_VALUE, Math.max(1, Math.round(value)));
    if (this.world.totalUnits + v > this.plafond) {
      sfx.playRefuse();
      return;
    }
    this.snapshot();
    const x = this.world.width * 0.5 + (Math.random() - 0.5) * Math.min(220, this.world.width * 0.5);
    // Un grand bloc lâché trop haut naît la tête hors de l'écran : on descend
    // le point de chute d'autant que le bloc est haut.
    const y = 40 + (shapeFor(v).h * UNIT) / 2;
    const block = this.world.add(shapeFor(v), x, y, (Math.random() - 0.5) * 0.6);
    Body.setVelocity(block.body, { x: (Math.random() - 0.5) * 3, y: 2 });
    this.track(block);
    sfx.playSpawn(v);
    this.dirty = true;
    this.emit();
  }

  /**
   * Fait naître un cube **sous le doigt**, dans la barre, et le confie au
   * glisser en cours. C'est le seul geste qui fabrique de la matière.
   *
   * Il ne tombe pas du ciel : un cube lâché du haut atterrit où il veut, et sur
   * un chantier plus grand que l'écran, souvent hors de vue. Ici, l'enfant le
   * tire de la barre jusqu'à l'endroit exact où il le pose — et s'il le relâche
   * sans être sorti de la barre, le cube y retourne, ce qui est déjà la règle
   * du rangement (rien n'a été créé, rien n'est à annuler).
   */
  prendreDansLaBarre(mat: number, pointerId: number, clientX: number, clientY: number): boolean {
    // Le premier geste de la partie peut être celui-ci : sans ça, le son de
    // pose serait le seul à ne jamais réveiller la carte audio.
    sfx.unlockAudio();
    if (this.world.totalUnits + 1 > this.plafond) {
      sfx.playRefuse();
      return false;
    }
    const rect = this.canvas.getBoundingClientRect();
    const ecran = { x: clientX - rect.left, y: clientY - rect.top };
    const p = toWorld(this.camera, this.vue, ecran);

    // L'état d'avant est mis de côté, pas empilé : voir `Drag.avant`.
    const avant = this.etat();
    // Le doigt est encore *dans la barre*, qui recouvre la bande de sol : né
    // là, le cube naîtrait sous le sol, et le solveur ne l'en sortirait plus.
    // On le fait donc naître à la place que le glisser lui donnerait — il sort
    // de la barre du même mouvement, sans saut.
    const ou = this.tenable(p.x, p.y);
    const block = this.world.add(shapeFor(1), ou.x, ou.y, 0, { x: 0, y: 0 }, undefined, [
      newSkin(mat),
    ]);
    this.track(block);

    const shake = new ShakeDetector();
    shake.reset({ x: p.x, y: p.y, t: performance.now() });
    this.drags.set(pointerId, {
      blockId: block.id,
      // Le cube est pris par son centre : il est né là, il n'a pas d'ailleurs.
      ox: 0,
      oy: 0,
      px: p.x,
      py: p.y,
      ex: ecran.x,
      ey: ecran.y,
      dirX: 0,
      dirY: -1,
      travelled: 0,
      shake,
      candidate: null,
      bordArme: false,
      avant,
    });

    sfx.playPose(matiereFor(mat));
    this.dirty = true;
    this.emit();
    return true;
  }

  /**
   * Pose un cube au milieu de ce qu'on regarde.
   *
   * Chemin de secours du clavier : la barre se tire au doigt, mais un bouton
   * qu'on ne peut qu'activer ne doit pas rester mort.
   */
  poseCube(mat: number = CHENE) {
    if (this.world.totalUnits + 1 > this.plafond) {
      sfx.playRefuse();
      return;
    }
    this.snapshot();
    const haut = toWorld(this.camera, this.vue, { x: this.vue.w / 2, y: 0 });
    const block = this.world.add(
      shapeFor(1),
      clamp(haut.x, UNIT, this.world.width - UNIT),
      Math.max(UNIT, haut.y + UNIT),
      0,
      { x: 0, y: 1 },
      undefined,
      [newSkin(mat)],
    );
    this.track(block);
    sfx.playPose(matiereFor(mat));
    this.dirty = true;
    this.emit();
  }

  undo() {
    const snap = this.undoStack.pop();
    if (!snap) return;
    if (this.chantier) this.loadBuild(snap as SavedPiece[]);
    else this.load(snap as SavedBlock[]);
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
        shapeFor(Math.min(MAX_VALUE, Math.max(1, Math.round(s.v)))),
        clamp(s.x * ratio, UNIT, this.world.width - UNIT),
        Math.min(s.y, this.world.groundY),
        s.a,
      );
      this.track(block, 0);
    }
  }

  private serializeBuild(): SavedPiece[] {
    return [...this.world.blocks.values()].map((b) => ({
      cells: b.shape.cells.map((c, i) => ({
        x: c.x,
        y: c.y,
        m: b.skin[i]?.mat ?? CHENE,
        g: b.skin[i]?.seed ?? 0,
      })),
      x: Math.round(b.body.position.x),
      y: Math.round(b.body.position.y),
      a: Number(Math.atan2(Math.sin(b.body.angle), Math.cos(b.body.angle)).toFixed(3)),
    }));
  }

  private loadBuild(saved: SavedPiece[], savedWidth: number = this.world.width) {
    this.world.clear();
    this.visuals.clear();
    this.drags.clear();
    this.slices.clear();
    const ratio = savedWidth > 0 ? this.world.width / savedWidth : 1;
    for (const piece of saved) {
      // Une pièce enregistrée avant un ajout de matières peut porter un
      // identifiant qu'on ne connaît plus : `matiereFor` la ramène sur la
      // première plutôt que de rendre un cube sans couleur.
      const shape = shapeOf(piece.cells);
      const skin: Skin[] = piece.cells.map((c) => ({ mat: c.m, seed: c.g }));
      const block = this.world.add(
        shape,
        clamp(piece.x * ratio, UNIT, this.world.width - UNIT),
        Math.min(piece.y, this.world.groundY),
        piece.a,
        undefined,
        undefined,
        skin,
      );
      this.track(block, 0);
    }
  }

  private restore() {
    // Même vide : charger, c'est aussi vider la scène précédente.
    if (this.chantier) {
      const saved = loadBuild(this.spaceId);
      this.camChantier = saved?.cam ? clampCamera(saved.cam, this.vue) : cameraDepart(this.vue);
      this.camera = this.camChantier;
      this.loadBuild(saved?.blocks ?? [], saved?.w);
    } else {
      const saved = loadScene(this.spaceId);
      this.load(saved?.blocks ?? [], saved?.w);
    }
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
   * Change de rayon : l'espace d'un autre enfant, l'autre scène du même
   * espace, ou les deux. La scène en cours part d'abord sur son propre rayon,
   * sinon elle finirait chez le suivant — et le chantier chez les nombres.
   *
   * Rester sur le même rayon ne coûte rien : recharger une scène qu'on ne
   * quitte pas reconstruirait tous les corps et leur ferait perdre leur
   * élan.
   */
  useSpace(id: string, kind: SceneKind = this.kind) {
    if (id === this.spaceId && kind === this.kind) return;
    this.flush();
    this.spaceId = id;
    this.kind = kind;
    this.camChantier = null;
    this.undoStack.length = 0;
    this.particles.length = 0;
    // Les bornes du monde changent avec le mode : on les repose avant de
    // relire, sinon un chantier atterrirait dans le monde des nombres.
    this.poseLeMonde(this.vue.w, this.vue.h);
    this.restore();
  }

  /** L'état de la table, dans la forme que l'annulation sait remettre. */
  private etat(): Snapshot {
    return this.chantier ? this.serializeBuild() : this.serialize();
  }

  private snapshot() {
    this.empile(this.etat());
  }

  private empile(snap: Snapshot) {
    this.undoStack.push(snap);
    if (this.undoStack.length > UNDO_DEPTH) this.undoStack.shift();
  }

  private flush = () => {
    if (this.chantier)
      saveBuild(this.spaceId, {
        w: this.world.width,
        blocks: this.serializeBuild(),
        cam: this.camChantier ?? undefined,
      });
    else saveScene(this.spaceId, { w: this.world.width, blocks: this.serialize() });
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

  /** Position à l'écran, en pixels CSS depuis le coin du canvas. */
  private toEcran(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  /**
   * Position dans le monde. C'est l'unique endroit où l'écran devient du
   * monde : au mode nombre la caméra est l'identité, et cette fonction rend
   * exactement ce que rendait `clientX - rect.left`.
   */
  private toLocal(e: PointerEvent) {
    return toWorld(this.camera, this.vue, this.toEcran(e));
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
      const ecran = this.toEcran(e);
      this.drags.set(e.pointerId, {
        blockId: block.id,
        ox: block.body.position.x - p.x,
        oy: block.body.position.y - p.y,
        px: p.x,
        py: p.y,
        ex: ecran.x,
        ey: ecran.y,
        dirX: 0,
        dirY: -1,
        travelled: 0,
        shake,
        candidate: null,
        bordArme: false,
        avant: null,
      });
    } else {
      // Doigt posé dans le vide : c'est peut-être le début d'une coupe. Mais un
      // **second** doigt dans le vide la remplace par la navigation — deux
      // doigts ne peuvent être que ça, puisqu'un glisser exige d'avoir attrapé
      // un bloc. Le second doigt annule donc la coupe que le premier avait
      // commencée.
      this.navs.set(e.pointerId, this.toEcran(e));
      if (this.chantier && this.navs.size >= 2) {
        this.slices.clear();
        this.demarreNav();
      } else {
        this.slices.set(e.pointerId, { path: [{ x: p.x, y: p.y, t: e.timeStamp }] });
      }
    }
  };

  private demarreNav() {
    const doigts = [...this.navs.values()];
    if (doigts.length < 2) {
      this.navDepart = null;
      return;
    }
    const [a, b] = doigts;
    this.navDepart = {
      cam: { ...this.camera },
      centre: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      ecart: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
    };
  }

  /**
   * Déplacement et zoom d'un seul geste : le point du monde qui était sous le
   * milieu des deux doigts y reste. Sans cette ancre, l'image fuit sous la main
   * dès qu'on pince.
   */
  private bougeLaCamera() {
    const d = this.navDepart;
    const doigts = [...this.navs.values()];
    if (!d || doigts.length < 2) return;
    const [a, b] = doigts;
    const centre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const k = (d.cam.k * Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))) / d.ecart;
    const sous = toWorld(d.cam, this.vue, d.centre);
    const c = centreVue(this.vue);
    this.cadre({ x: sous.x - (centre.x - c.x) / k, y: sous.y - (centre.y - c.y) / k, k });
  }

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
      const ecran = this.toEcran(e);
      drag.ex = ecran.x;
      drag.ey = ecran.y;
      if (drag.shake.push({ x: p.x, y: p.y, t: e.timeStamp })) this.peel(drag);
      return;
    }

    const nav = this.navs.get(e.pointerId);
    if (nav) {
      const ecran = this.toEcran(e);
      nav.x = ecran.x;
      nav.y = ecran.y;
      if (this.navDepart) {
        this.bougeLaCamera();
        return;
      }
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

    if (this.navs.delete(e.pointerId) && this.navs.size < 2) this.navDepart = null;

    if (this.drags.size === 0 && this.slices.size === 0) this.pointer = null;
  };

  private onPointerLeave = () => {
    if (this.drags.size === 0 && this.slices.size === 0) this.pointer = null;
  };

  // --- manipulation -----------------------------------------------------

  /** Où un bloc tenu peut aller : jamais dans un mur, jamais dans le sol. */
  private tenable(x: number, y: number) {
    return {
      x: clamp(x, UNIT * 0.6, this.world.width - UNIT * 0.6),
      y: clamp(y, -240, this.world.groundY - UNIT * 0.4),
    };
  }

  private applyDrags() {
    for (const drag of this.drags.values()) {
      const block = this.world.blocks.get(drag.blockId);
      if (!block) continue;
      const { x: tx, y: ty } = this.tenable(drag.px + drag.ox, drag.py + drag.oy);

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

  /**
   * Le geste finit-il hors du jeu ?
   *
   * Sur un chantier on ne jette pas dans le sol : on **rend le cube à la
   * barre**, d'où il vient. La cible est fixée à l'écran, donc toujours
   * atteignable quel que soit le cadrage, et elle n'occupe aucune case du
   * monde — l'objection exacte qui avait fait descendre la corbeille sous le
   * sol. Avec une caméra, une trappe creusée dans le sol devient injoignable
   * dès qu'on cadre une tour, et une suppression qu'on ne peut pas atteindre
   * est pire que pas de suppression du tout.
   */
  private jete(drag: Drag): boolean {
    return this.chantier
      ? drag.ey > this.vue.h - this.vue.inset
      : this.world.isOverTrash({ x: drag.px, y: drag.py });
  }

  private releaseDrag(drag: Drag) {
    const block = this.world.blocks.get(drag.blockId);
    if (!block) return;

    if (this.jete(drag)) {
      // Un cube tiré de la barre et rendu à la barre n'a jamais existé : il
      // s'en va sans le bruit de la corbeille et sans rien laisser à annuler.
      if (drag.avant) {
        this.world.remove(block.id);
        this.visuals.delete(block.id);
        this.dirty = true;
        this.emit();
      } else {
        this.trash(block);
      }
      return;
    }

    // Le cube né sous le doigt est gardé : c'est ici qu'il entre dans
    // l'histoire, et une seule annulation défait tout le geste — la naissance
    // du cube et la soudure qui l'a suivi.
    const neuf = drag.avant !== null;
    if (drag.avant) this.empile(drag.avant);

    // Un simple tap ne fusionne pas : sans déplacement, il n'y a pas d'intention.
    const candidate =
      drag.travelled > MERGE_MIN_TRAVEL && drag.candidate != null
        ? this.world.blocks.get(drag.candidate)
        : null;
    if (candidate) {
      if (this.chantier) this.weldBlocks(block, candidate, !neuf);
      else if (this.canMerge(block.value + candidate.value)) this.merge(block, candidate);
      else sfx.playRefuse();
    }
    this.dirty = true;
    this.emit();
  }

  /** La fusion s'arrête au plafond, et avant si le bloc ne tient pas à l'écran. */
  private canMerge(sum: number): boolean {
    return sum <= MAX_VALUE && this.world.fits(shapeFor(sum));
  }

  /**
   * Où les cases du bloc tiré iraient se poser sur la cible, dans la grille de
   * celle-ci. `null` s'il n'y a nulle part où les mettre.
   *
   * Tout se joue dans la grille de la cible : on y exprime la pose du bloc
   * tiré, on arrondit au cube près et au quart de tour, et `weld` cherche la
   * place la plus proche qui tienne. Le même calcul sert deux fois — à montrer
   * la place pendant le glisser, à souder au lâcher — pour que ce qu'on voit
   * soit exactement ce qui va se produire.
   */
  private poseSoudee(tire: Block, cible: Block): Cell[] | null {
    const cCentered = centeredOf(cible.shape);
    const tCentered = centeredOf(tire.shape);
    const quart = Math.round((tire.body.angle - cible.body.angle) / (Math.PI / 2));

    // Centre de masse du bloc tiré, ramené dans le repère de la cible, en cubes.
    const cos = Math.cos(cible.body.angle);
    const sin = Math.sin(cible.body.angle);
    const dx = (tire.body.position.x - cible.body.position.x) / UNIT;
    const dy = (tire.body.position.y - cible.body.position.y) / UNIT;
    const px = dx * cos + dy * sin;
    const py = -dx * sin + dy * cos;

    // Où tombe sa première case, en coordonnées entières de la cible.
    const t = rotateCell(tCentered[0], quart);
    const ancre = {
      x: Math.round(px + t.x - cCentered[0].x + cible.shape.cells[0].x),
      y: Math.round(py + t.y - cCentered[0].y + cible.shape.cells[0].y),
    };

    const pose = weld(cible.shape.cells, tire.shape.cells, quart, ancre);
    if (!pose) return null;
    return this.world.fits(shapeOf([...cible.shape.cells, ...pose])) ? pose : null;
  }

  /**
   * Soude le bloc tiré sur le bloc cible, là où le doigt l'a amené.
   *
   * L'assemblage garde l'inclinaison de la cible, et **la cible ne bouge pas
   * d'un pixel** — c'est autour d'elle qu'on construit, et voir sa maison se
   * recentrer à chaque brique serait insupportable.
   */
  private weldBlocks(tire: Block, cible: Block, aNoter = true) {
    const pose = this.poseSoudee(tire, cible);
    if (!pose) {
      sfx.playRefuse();
      return;
    }

    const cCentered = centeredOf(cible.shape);
    const cos = Math.cos(cible.body.angle);
    const sin = Math.sin(cible.body.angle);
    const shape = shapeOf([...cible.shape.cells, ...pose]);

    // La cible garde sa place : on décale le corps de ce que le nouveau centre
    // de masse a bougé, pour que sa première case retombe exactement dessus.
    const centered = centeredOf(shape);
    const ox = (cCentered[0].x - centered[0].x) * UNIT;
    const oy = (cCentered[0].y - centered[0].y) * UNIT;

    if (aNoter) this.snapshot();
    const skin = [...cible.skin, ...tire.skin];
    const velocity = { x: cible.body.velocity.x, y: cible.body.velocity.y };
    const angle = cible.body.angle;
    const x = cible.body.position.x + ox * cos - oy * sin;
    const y = cible.body.position.y + ox * sin + oy * cos;

    this.world.remove(tire.id);
    this.world.remove(cible.id);
    this.visuals.delete(tire.id);
    this.visuals.delete(cible.id);

    const merged = this.world.add(shape, x, y, angle, velocity, undefined, skin);
    this.track(merged);
    // Le son est celui du cube qu'on vient de poser, pas du mur qui le reçoit.
    sfx.playSoudure(matiereFor(tire.skin[0]?.mat ?? CHENE));
    this.dirty = true;
    this.emit();
  }

  /**
   * Repose un morceau là où ses cubes se trouvent déjà : la position du corps
   * se calcule pour que sa première case retombe exactement sur la sienne.
   * Sans ça, couper ou détacher ferait sauter ce qui reste.
   */
  private placePiece(
    cells: Cell[],
    skin: Skin[],
    at: Array<{ x: number; y: number }>,
    angle: number,
    velocity: { x: number; y: number },
  ): Block {
    const shape = shapeOf(cells);
    const centered = centeredOf(shape);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const ox = centered[0].x * UNIT;
    const oy = centered[0].y * UNIT;
    const piece = this.world.add(
      shape,
      clamp(at[0].x - (ox * cos - oy * sin), UNIT, this.world.width - UNIT),
      at[0].y - (ox * sin + oy * cos),
      angle,
      velocity,
      undefined,
      skin,
    );
    this.track(piece);
    return piece;
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

    const merged = this.world.add(shapeFor(value), clamp(x, UNIT, this.world.width - UNIT), y, 0, {
      x: vx * 0.4,
      y: vy * 0.4,
    });
    this.track(merged);
    sfx.playMerge(value);
    sfx.say(value);
    this.dirty = true;
    this.emit();
  }

  /**
   * Une secousse détache le cube que le doigt tient.
   *
   * C'est le geste qui répare l'erreur ancienne : l'annulation ne défait que le
   * dernier geste, et une brique mal posée se voit trois briques plus tard.
   * Sans lui, il faudrait couper la maison en deux pour la corriger.
   */
  private detach(drag: Drag) {
    const block = this.world.blocks.get(drag.blockId);
    if (!block) return;
    if (block.value <= 1) {
      this.visual(block.id).shake = 1;
      return;
    }

    const positions = cubePositions(block);
    let pick = 0;
    let best = Infinity;
    positions.forEach((p, i) => {
      const d = (p.x - drag.px) ** 2 + (p.y - drag.py) ** 2;
      if (d < best) {
        best = d;
        pick = i;
      }
    });

    this.snapshot();
    const angle = block.body.angle;
    const velocity = { x: block.body.velocity.x, y: block.body.velocity.y };
    const side = drag.dirX >= 0 ? -1 : 1;
    const partie = positions[pick];
    const restCells = block.shape.cells.filter((_, i) => i !== pick);
    const restSkin = block.skin.filter((_, i) => i !== pick);
    const restAt = positions.filter((_, i) => i !== pick);

    this.world.remove(block.id);
    this.visuals.delete(block.id);

    // Retirer un cube peut couper l'assemblage : ôter le milieu d'un pont en
    // laisse deux. Ce qui reste se recompose en autant de morceaux qu'il y a de
    // groupes qui se tiennent par une arête.
    for (const part of connectedParts(restCells)) {
      const piece = this.placePiece(
        part.map((i) => restCells[i]),
        part.map((i) => restSkin[i]),
        part.map((i) => restAt[i]),
        angle,
        velocity,
      );
      this.visual(piece.id).shake = 1;
    }

    const unit = this.world.add(
      shapeFor(1),
      partie.x + side * UNIT * 0.6,
      partie.y - UNIT * 0.4,
      angle,
      { x: velocity.x + side * 7, y: velocity.y - 6 },
      undefined,
      [block.skin[pick] ?? newSkin()],
    );
    Body.setAngularVelocity(unit.body, side * 0.25);
    this.track(unit);
    this.burst(unit, 4);
    sfx.playPeel();
    this.dirty = true;
    this.emit();
  }

  /** Une secousse détache une unité du bloc tenu. */
  private peel(drag: Drag) {
    if (this.chantier) return this.detach(drag);
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
    const reduced = this.world.reshape(block.id, shapeFor(block.value - 1));
    if (!reduced) return;
    this.visual(reduced.id).shake = 1;

    const unit = this.world.add(shapeFor(1), x + side * (halfW + UNIT * 1.1), y - UNIT * 0.4, 0, {
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
      // L'indice voyage avec le point, pour que la matière suive sa case.
      const marques = cubePositions(block).map((p, i) => ({ ...p, i }));
      const [plus, minus] = partitionByCut(cut, marques);
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

      const halves: Array<[typeof plus, number]> = [
        [plus, 1],
        [minus, -1],
      ];
      this.world.remove(block.id);
      this.visuals.delete(block.id);

      if (this.chantier) {
        for (const [group, sign] of halves) {
          const cells = group.map((g) => block.shape.cells[g.i]);
          const at = group.map((g) => ({
            x: g.x + normal.x * sign * UNIT * 0.6,
            y: g.y + normal.y * sign * UNIT * 0.6,
          }));
          // Un trait droit ne rend pas deux morceaux mais autant qu'il en
          // détache : un U tranché en travers de ses branches en donne trois.
          for (const part of connectedParts(cells)) {
            this.placePiece(
              part.map((k) => cells[k]),
              part.map((k) => block.skin[group[k].i]),
              part.map((k) => at[k]),
              angle,
              {
                x: velocity.x + normal.x * sign * 4.5,
                y: velocity.y + normal.y * sign * 4.5 - 1,
              },
            );
          }
        }
        this.sparkleLine(cut);
        continue;
      }

      for (const [group, sign] of halves) {
        const cx = group.reduce((s, p) => s + p.x, 0) / group.length;
        const cy = group.reduce((s, p) => s + p.y, 0) / group.length;
        const piece = this.world.add(
          shapeFor(group.length),
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
    const color = this.couleur(block);
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

  /**
   * Le monde défile quand le doigt approche d'un bord pendant un glisser.
   *
   * Sans lui, poser un cube dont la place est hors champ redemanderait de
   * cadrer d'abord et de poser ensuite : le geste unique de la barre à la
   * scène ne survivrait pas à un monde plus grand que l'écran.
   */
  private defileAuBord(dt: number) {
    if (!this.chantier || this.navDepart || this.drags.size === 0) return;
    const MARGE = 64;
    const VITESSE = 0.5;
    const utile = this.vue.h - this.vue.inset;
    const pousse = (v: number, taille: number) => {
      if (v < MARGE) return -(MARGE - v) / MARGE;
      if (v > taille - MARGE) return (v - (taille - MARGE)) / MARGE;
      return 0;
    };

    let dx = 0;
    let dy = 0;
    for (const drag of this.drags.values()) {
      const px = pousse(drag.ex, this.vue.w);
      const py = pousse(drag.ey, utile);
      if (!drag.bordArme) {
        if (px === 0 && py === 0) drag.bordArme = true;
        continue;
      }
      dx += px;
      dy += py;
    }
    if (dx === 0 && dy === 0) return;

    const pas = (VITESSE * dt) / this.camera.k;
    this.cadre({ ...this.camera, x: this.camera.x + dx * pas, y: this.camera.y + dy * pas });
    // Le doigt n'a pas bougé, mais le monde sous lui, si : le bloc doit suivre
    // la contrée qu'on vient de découvrir.
    for (const drag of this.drags.values()) {
      const p = toWorld(this.camera, this.vue, { x: drag.ex, y: drag.ey });
      drag.px = p.x;
      drag.py = p.y;
    }
  }

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
        // Sur un chantier, c'est la matière qui donne au choc sa couleur.
        const id = (a as Matter.Body & { blockId?: number }).blockId;
        const skin = id == null ? undefined : this.world.blocks.get(id)?.skin;
        sfx.playImpact(relative, skin?.length ? matiereFor(skin[0].mat) : undefined);
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

    this.defileAuBord(dt);
    this.updateCandidates();
    this.updateVisuals(dt);
    this.stepParticles(dt);
    this.trashGulp = Math.max(0, this.trashGulp - dt / 260);

    // Elle apparaît dès qu'un bloc est tenu, et repart dès qu'on lâche.
    const visible = !this.chantier && (this.drags.size > 0 || this.trashGulp > 0);
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
      // Pas de candidat quand le geste part à la corbeille — ou, sur un
      // chantier, quand le doigt est revenu dans la barre : ce qu'on montrerait
      // là ne se produira pas.
      if (drag.travelled <= MERGE_MIN_TRAVEL || this.jete(drag)) {
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

  /**
   * La place que le bloc tiré va prendre, montrée à l'avance.
   *
   * Sur un chantier, l'ancien aperçu ne voulait plus rien dire : il annonçait
   * `4 + 1 = 5` et dessinait la forme canonique du 5, quand la soudure allait
   * poser un cube contre un mur. Ni le compte ni la forme n'étaient vrais. On
   * montre donc la seule chose qui le soit — les cases du bloc tiré là où
   * elles vont se coller, calculées par le calcul même qui les y collera.
   */
  private apercuSoudure(): Apercu | null {
    for (const drag of this.drags.values()) {
      if (drag.candidate == null) continue;
      const tire = this.world.blocks.get(drag.blockId);
      const cible = this.world.blocks.get(drag.candidate);
      if (!tire || !cible) continue;
      const pose = this.poseSoudee(tire, cible);
      if (!pose) continue;

      // Les cases sont dans la grille de la cible : on les ramène dans le monde
      // par le repère de la cible, qui ne bougera pas.
      const centered = centeredOf(cible.shape);
      return {
        angle: cible.body.angle,
        cubes: pose.map((c) =>
          caseEnMonde(
            cible.shape.cells,
            centered,
            cible.body.position,
            cible.body.angle,
            UNIT,
            c,
          ),
        ),
      };
    }
    return null;
  }

  private buildScene(): Scene {
    const blocks: BlockVisual[] = [];
    for (const block of this.world.blocks.values()) {
      const v = this.visual(block.id);
      blocks.push({
        id: block.id,
        value: block.value,
        cle: block.cle,
        shape: block.shape,
        skin: block.skin,
        body: block.body,
        pop: v.pop,
        squash: v.squash,
        shake: v.shake,
        blink: v.blink,
        dragged: this.isDragged(block.id),
        sink: this.plongeurs.has(block.id) ? this.trashHot : 0,
      });
    }

    // Sur un chantier, l'aperçu n'est plus une addition mais une place : voir
    // `apercuSoudure`.
    let ghost: Ghost | null = null;
    for (const drag of this.drags.values()) {
      if (this.chantier) break;
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
      apercu: this.chantier ? this.apercuSoudure() : null,
      slice: slicePath,
      trash: {
        ...this.world.trash,
        hot: this.trashHot,
        gulp: this.trashGulp,
        show: this.trashShow,
      },
      groundY: this.world.groundY,
      camera: this.camera,
      vue: this.vue,
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
  return centeredOf(block.shape).map((cell) => {
    const ox = cell.x * UNIT;
    const oy = cell.y * UNIT;
    return {
      x: block.body.position.x + ox * cos - oy * sin,
      y: block.body.position.y + ox * sin + oy * cos,
    };
  });
}

/**
 * Hauteur réservée à la barre de blocs, sous le sol. Large, les dix blocs
 * tiennent sur une seule rangée : le sol descend d'autant, sinon il flotte
 * au-dessus d'une bande vide. Le seuil est celui de la feuille de style.
 */
function margeBas(width: number): number {
  return width >= LARGE_MIN ? BOTTOM_SAFE_LARGE : BOTTOM_SAFE;
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
