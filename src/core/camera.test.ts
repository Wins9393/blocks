import { describe, expect, it } from 'vitest';
import {
  MONDE,
  ZOOM_MAX,
  cameraDepart,
  cameraIdentite,
  clampCamera,
  toScreen,
  toWorld,
  zoomMin,
} from './camera';
import type { Vue } from './camera';

const vues: Vue[] = [
  { w: 390, h: 700, inset: 178 },
  { w: 430, h: 930, inset: 178 },
  { w: 1280, h: 800, inset: 136 },
];

describe('la caméra', () => {
  it('fait un aller-retour exact entre l’écran et le monde', () => {
    // C'est l'invariant qui garde le cube sous le doigt : dès que le pointeur
    // cesse d'être `clientX - rect.left`, une erreur de repère se voit comme un
    // cube qui se pose à côté de la main.
    for (const vue of vues) {
      for (const k of [zoomMin(vue), 0.5, 1, ZOOM_MAX]) {
        const cam = { x: 640, y: 500, k };
        for (const p of [{ x: 0, y: 0 }, { x: 137, y: 42 }, { x: vue.w, y: vue.h }]) {
          const retour = toScreen(cam, vue, toWorld(cam, vue, p));
          expect(retour.x).toBeCloseTo(p.x, 6);
          expect(retour.y).toBeCloseTo(p.y, 6);
        }
      }
    }
  });

  it('ne transforme rien au mode nombre', () => {
    // Le monde y est l'écran : tout ce qui a été mesuré au pixel le reste.
    for (const vue of vues) {
      const cam = cameraIdentite(vue);
      for (const p of [{ x: 0, y: 0 }, { x: 211, y: 333 }]) {
        expect(toScreen(cam, vue, p)).toEqual(p);
        expect(toWorld(cam, vue, p)).toEqual(p);
      }
    }
  });

  it('ne laisse jamais le chantier dériver hors de vue', () => {
    // Sur chaque axe : ou bien la vue est entièrement dans le monde, ou bien le
    // monde tient tout entier dans la vue et s'y centre. Jamais entre les deux,
    // ce qui donnerait une bande de vide sur un bord.
    for (const vue of vues) {
      for (const [cx, cy] of [[-9000, 9000], [9000, -9000], [700, 400]]) {
        for (const k of [zoomMin(vue), 0.6, 1, 3]) {
          const cam = clampCamera({ x: cx, y: cy, k }, vue, MONDE);
          const a = toWorld(cam, vue, { x: 0, y: 0 });
          const b = toWorld(cam, vue, { x: vue.w, y: vue.h - vue.inset });
          const tenu = (min: number, max: number, taille: number) =>
            (min >= -0.001 && max <= taille + 0.001) ||
            (min <= 0.001 && max >= taille - 0.001 && Math.abs(min + max - taille) < 0.001);
          expect(tenu(a.x, b.x, MONDE.w), `x k=${k}`).toBe(true);
          expect(tenu(a.y, b.y, MONDE.h), `y k=${k}`).toBe(true);
        }
      }
    }
  });

  it('centre ce qui tient déjà tout entier dans la vue', () => {
    // Dézoomé à fond, le chantier ne coulisse plus : il se pose au milieu.
    const vue = vues[0];
    const cam = clampCamera({ x: 0, y: 0, k: zoomMin(vue) }, vue, MONDE);
    expect(cam.x).toBeCloseTo(MONDE.w / 2, 6);
  });

  it('borne le zoom des deux côtés', () => {
    for (const vue of vues) {
      expect(clampCamera({ x: 0, y: 0, k: 99 }, vue, MONDE).k).toBe(ZOOM_MAX);
      expect(clampCamera({ x: 0, y: 0, k: 0.001 }, vue, MONDE).k).toBeCloseTo(zoomMin(vue), 6);
    }
  });

  it('démarre le sol en vue', () => {
    for (const vue of vues) {
      const cam = cameraDepart(vue);
      const bas = toWorld(cam, vue, { x: 0, y: vue.h - vue.inset });
      expect(bas.y).toBeGreaterThan(MONDE.h - 1);
    }
  });
});
