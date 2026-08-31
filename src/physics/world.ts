import Matter from 'matter-js';
import { DRAG_MAX_SPIN, DRAG_STRAIGHTEN, GRAVITY_Y, TRASH_W, UNIT } from '../core/constants';
import { rectanglesFor, shapeFor } from '../core/shape';
import type { Shape } from '../core/shape';

const { Bodies, Body, Composite, Engine, Query, Sleeping } = Matter;

export interface Block {
  id: number;
  value: number;
  shape: Shape;
  body: Matter.Body;
}

export interface Bounds {
  x: number;
  y: number;
}

let nextId = 1;

/**
 * Un bloc = UN corps rigide composé de n boîtes. Pas de contraintes de
 * soudure : elles sont molles et coûteuses, un corps composé est indéformable
 * et gratuit. Fusionner et séparer reviennent alors à détruire puis recréer.
 */
function buildBody(value: number, x: number, y: number, angle: number): Matter.Body {
  const material = { friction: 0.42, frictionStatic: 0.7, restitution: 0.05 };
  const parts = rectanglesFor(value).map((r) =>
    Bodies.rectangle(x + r.x * UNIT, y + r.y * UNIT, r.w * UNIT, r.h * UNIT, material),
  );
  const body = Body.create({ ...material, parts, frictionAir: 0.014, slop: 0.04 });
  Body.setPosition(body, { x, y });
  Body.setAngle(body, angle);
  return body;
}

export class World {
  readonly engine: Matter.Engine;
  readonly blocks = new Map<number, Block>();

  width = 0;
  height = 0;
  groundY = 0;
  trash = { x: 0, y: 0, w: TRASH_W, h: TRASH_W * 0.82 };

  private walls: Matter.Body[] = [];
  private trashBody: Matter.Body | null = null;

  constructor() {
    this.engine = Engine.create({ enableSleeping: true });
    this.engine.gravity.y = GRAVITY_Y;
  }

  get totalUnits(): number {
    let n = 0;
    for (const b of this.blocks.values()) n += b.value;
    return n;
  }

  get bodies(): Matter.Body[] {
    return [...this.blocks.values()].map((b) => b.body);
  }

  resize(width: number, height: number, bottomInset: number) {
    this.width = width;
    this.height = height;
    this.groundY = height - bottomInset;

    Composite.remove(this.engine.world, this.walls);
    if (this.trashBody) Composite.remove(this.engine.world, this.trashBody);

    const T = 400;
    const opts = { isStatic: true, friction: 0.6, restitution: 0.02 };
    this.walls = [
      Bodies.rectangle(width / 2, this.groundY + T / 2, width * 3, T, opts),
      Bodies.rectangle(-T / 2, height / 2, T, height * 6, opts),
      Bodies.rectangle(width + T / 2, height / 2, T, height * 6, opts),
      Bodies.rectangle(width / 2, -height - T / 2, width * 3, T, opts),
    ];
    Composite.add(this.engine.world, this.walls);

    // Sur un écran de téléphone, une corbeille à taille fixe mangerait un
    // quart du sol : elle suit la largeur disponible.
    const tw = Math.round(Math.min(TRASH_W, Math.max(64, width * 0.19)));
    const th = Math.round(tw * 0.82);
    this.trash = { x: width - tw / 2 - 16, y: this.groundY - th / 2, w: tw, h: th };
    this.trashBody = Bodies.rectangle(this.trash.x, this.trash.y, tw, th, {
      isStatic: true,
      friction: 0.9,
    });
    Composite.add(this.engine.world, this.trashBody);
  }

  add(value: number, x: number, y: number, angle = 0, velocity?: Matter.Vector, id?: number): Block {
    const body = buildBody(value, x, y, angle);
    if (velocity) Body.setVelocity(body, velocity);
    const block: Block = { id: id ?? nextId++, value, shape: shapeFor(value), body };
    (body as Matter.Body & { blockId: number }).blockId = block.id;
    this.blocks.set(block.id, block);
    Composite.add(this.engine.world, body);
    return block;
  }

  remove(id: number) {
    const block = this.blocks.get(id);
    if (!block) return;
    Composite.remove(this.engine.world, block.body);
    this.blocks.delete(id);
  }

  /** Change la valeur d'un bloc en place : même identité, même pose, nouvelle forme. */
  reshape(id: number, value: number): Block | null {
    const old = this.blocks.get(id);
    if (!old) return null;
    const { x, y } = old.body.position;
    const angle = old.body.angle;
    const velocity = { x: old.body.velocity.x, y: old.body.velocity.y };
    const angularVelocity = old.body.angularVelocity;
    this.remove(id);
    const next = this.add(value, x, y, angle, velocity, id);
    Body.setAngularVelocity(next.body, angularVelocity);
    return next;
  }

  clear() {
    for (const id of [...this.blocks.keys()]) this.remove(id);
  }

  blockAt(point: Bounds): Block | null {
    const hits = Query.point(this.bodies, point);
    if (hits.length === 0) return null;
    // Le plus récemment ajouté gagne : c'est celui qui est visuellement devant.
    const ids = hits.map((b) => (b as Matter.Body & { blockId: number }).blockId);
    const id = ids[ids.length - 1];
    return this.blocks.get(id) ?? null;
  }

  wake(block: Block) {
    Sleeping.set(block.body, false);
  }

  isOverTrash(point: Bounds): boolean {
    const t = this.trash;
    return (
      point.x > t.x - t.w / 2 - 12 &&
      point.x < t.x + t.w / 2 + 12 &&
      point.y > t.y - t.h / 2 - 56 &&
      point.y < t.y + t.h / 2 + 12
    );
  }

  step(dt: number) {
    Engine.update(this.engine, dt);
  }
}

/**
 * Vitesse angulaire à appliquer pour redresser un bloc tenu au doigt.
 *
 * `angle` est cumulatif dans Matter : un bloc qui a culbuté deux fois vaut
 * 12 rad tout en paraissant droit. On vise donc l'orientation droite la plus
 * proche, et on plafonne : sans borne, la correction devient une gifle
 * proportionnelle au nombre de tours déjà faits, et chaque prise multiplie la
 * rotation au lieu de la calmer.
 */
export function rightingSpin(angle: number): number {
  const tilt = Math.atan2(Math.sin(angle), Math.cos(angle));
  const spin = -tilt * DRAG_STRAIGHTEN;
  return Math.max(-DRAG_MAX_SPIN, Math.min(DRAG_MAX_SPIN, spin));
}

/**
 * Plus petit écart réel entre les formes de collision de deux blocs.
 *
 * Mesuré arête contre arête, pas boîte contre boîte : une pièce de plusieurs
 * cubes inclinée a une boîte englobante bien plus large qu'elle, et la fusion
 * se proposerait alors que les blocs sont encore visiblement séparés.
 */
export function minPartGap(a: Matter.Body, b: Matter.Body): number {
  let best = Infinity;
  for (let i = 1; i < a.parts.length; i++) {
    const va = a.parts[i].vertices;
    for (let j = 1; j < b.parts.length; j++) {
      const vb = b.parts[j].vertices;
      for (let m = 0; m < va.length; m++) {
        const a1 = va[m];
        const a2 = va[(m + 1) % va.length];
        for (let n = 0; n < vb.length; n++) {
          const b1 = vb[n];
          const b2 = vb[(n + 1) % vb.length];
          best = Math.min(best, segmentGap(a1, a2, b1, b2));
          if (best === 0) return 0;
        }
      }
    }
  }
  return best;
}

interface Point {
  x: number;
  y: number;
}

function pointSegmentGap(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function segmentGap(a1: Point, a2: Point, b1: Point, b2: Point): number {
  const d1x = a2.x - a1.x;
  const d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x;
  const d2y = b2.y - b1.y;
  const denom = d1x * d2y - d1y * d2x;
  if (denom !== 0) {
    const s = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denom;
    const t = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / denom;
    if (s >= 0 && s <= 1 && t >= 0 && t <= 1) return 0; // les segments se croisent
  }
  return Math.min(
    pointSegmentGap(a1, b1, b2),
    pointSegmentGap(a2, b1, b2),
    pointSegmentGap(b1, a1, a2),
    pointSegmentGap(b2, a1, a2),
  );
}
