import { describe, expect, it } from 'vitest';
import {
  MONDE,
  ZOOM_MAX,
  ZOOM_PAS,
  ZOOM_REPOS,
  cameraDepart,
  cameraIdentite,
  clampCamera,
  toScreen,
  toWorld,
  zoomMin,
  zoomPourK,
  zoomPourcent,
  zoomVoisin,
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

describe('le niveau de zoom affiché', () => {
  it('dit toujours 50 % du zoom de repos, quel que soit l’écran', () => {
    // C'est la seule raison d'avoir deux pentes : sur un téléphone le monde
    // entier tient à 0,28 et sur un grand écran à 0,72, mais « la vue normale »
    // doit se lire au même endroit de la commande dans les deux cas.
    for (const vue of vues) expect(zoomPourcent(ZOOM_REPOS, vue)).toBe(50);
  });

  it('met le monde entier à 0 et le plus gros à 100', () => {
    for (const vue of vues) {
      expect(zoomPourcent(zoomMin(vue), vue)).toBe(0);
      expect(zoomPourcent(ZOOM_MAX, vue)).toBe(100);
    }
  });

  it('ne sort jamais de 0 à 100, même hors des bornes', () => {
    for (const vue of vues) {
      expect(zoomPourcent(0.001, vue)).toBe(0);
      expect(zoomPourcent(99, vue)).toBe(100);
    }
  });

  it('fait un aller-retour exact entre le nombre montré et l’échelle', () => {
    // Le nombre et le bouton doivent parler de la même chose : sans cet
    // aller-retour, appuyer sur + afficherait un palier qu'on n'a pas demandé.
    for (const vue of vues) {
      for (let p = 0; p <= 100; p += 5) expect(zoomPourcent(zoomPourK(p, vue), vue)).toBe(p);
    }
  });

  it('avance d’un cran rond à chaque appui', () => {
    // Un zoom arrivé au pincement entre deux crans retombe sur le multiple, et
    // cinq appuis mènent bien du repos au maximum.
    const vue = vues[0];
    expect(zoomPourcent(zoomVoisin(zoomPourK(43, vue), vue, 1), vue)).toBe(50);
    expect(zoomPourcent(zoomVoisin(zoomPourK(43, vue), vue, -1), vue)).toBe(40);
    let k = ZOOM_REPOS;
    for (let i = 0; i < 100 / ZOOM_PAS / 2; i++) k = zoomVoisin(k, vue, 1);
    expect(zoomPourcent(k, vue)).toBe(100);
  });

  it('ne dépasse pas les bornes à force d’appuyer', () => {
    const vue = vues[0];
    let k = ZOOM_REPOS;
    for (let i = 0; i < 30; i++) k = zoomVoisin(k, vue, -1);
    expect(k).toBeCloseTo(zoomMin(vue), 6);
    for (let i = 0; i < 30; i++) k = zoomVoisin(k, vue, 1);
    expect(k).toBeCloseTo(ZOOM_MAX, 6);
  });

  it('reste continu sur un écran qui tient déjà le monde entier', () => {
    // Là, il n'y a plus de moitié basse à parcourir. L'échelle doit rester une
    // pente unique : une marche au passage des 50 % ferait sauter le zoom d'un
    // appui à l'autre.
    const vue: Vue = { w: 2000, h: 1200, inset: 136 };
    expect(zoomMin(vue)).toBeGreaterThan(ZOOM_REPOS);
    expect(zoomPourcent(zoomMin(vue), vue)).toBe(0);
    expect(zoomPourcent(ZOOM_MAX, vue)).toBe(100);
    for (let p = 0; p <= 100; p += 5) expect(zoomPourcent(zoomPourK(p, vue), vue)).toBe(p);
  });
});
