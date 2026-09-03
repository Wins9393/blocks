import { describe, expect, it } from 'vitest';
import { World, rightingSpin } from './world';
import { DRAG_MAX_SPIN, MAX_CUBES, UNIT } from '../core/constants';
import { MONDE, MONDE_H, MONDE_W, SOL_Y } from '../core/camera';
import { shapeFor, shapeOf } from '../core/shape';

const TOUR = Math.PI * 2;

describe('rightingSpin', () => {
  it('ne fait rien sur un bloc déjà droit', () => {
    expect(rightingSpin(0)).toBeCloseTo(0, 10);
  });

  it('tourne dans le sens qui redresse', () => {
    expect(rightingSpin(0.3)).toBeLessThan(0);
    expect(rightingSpin(-0.3)).toBeGreaterThan(0);
  });

  it('ignore les tours déjà accumulés : c était la cause du bug', () => {
    // Matter cumule l angle. Un bloc qui a culbuté plusieurs fois paraît droit
    // mais affiche des dizaines de radians.
    for (const tours of [1, 2, 5, 20, -3]) {
      expect(rightingSpin(tours * TOUR)).toBeCloseTo(0, 6);
      expect(rightingSpin(tours * TOUR + 0.3)).toBeCloseTo(rightingSpin(0.3), 6);
    }
  });

  it('reste borné quel que soit l angle, même absurde', () => {
    for (const angle of [0.5, 3, 35.09, -151.85, 657.16, -2843.92, 12307.38]) {
      expect(Math.abs(rightingSpin(angle))).toBeLessThanOrEqual(DRAG_MAX_SPIN);
    }
  });

  it('ne peut pas diverger : réappliquer la correction converge vers zéro', () => {
    let angle = 35.09; // l angle relevé sur le bug reproduit
    for (let i = 0; i < 400; i++) angle += rightingSpin(angle);
    const reste = Math.atan2(Math.sin(angle), Math.cos(angle));
    expect(Math.abs(reste)).toBeLessThan(0.01);
  });
});

describe('les bornes du monde', () => {
  const ligne = (n: number) => shapeOf(Array.from({ length: n }, (_, x) => ({ x, y: 0 })));

  it('refuse ce qui ne tient pas entre les murs', () => {
    // Un bloc plus large que le monde y resterait coincé, et le solveur
    // finirait par l'éjecter.
    const w = new World();
    w.resize(MONDE.w, MONDE.h, SOL_Y);
    // Quatre pixels de marge : une forme qui remplit le monde bord à bord se
    // coincerait entre les murs.
    expect(w.fits(ligne(MONDE_W - 1))).toBe(true);
    expect(w.fits(ligne(MONDE_W + 1))).toBe(false);
  });

  it('laisse de la place pour manœuvrer au plafond de cubes', () => {
    // 400 cubes dans 40 x 24 cases, c'est 42 % du chantier : le reste est l'air
    // qu'il faut pour poser, glisser et couper.
    expect(MAX_CUBES).toBeLessThan(MONDE_W * MONDE_H * 0.5);
  });

  it('garde le monde des nombres tel qu il était', () => {
    // Le mode nombre n'a pas de caméra : son monde est l'écran, et le sol
    // remonte de la hauteur de la barre.
    const w = new World();
    w.resize(320, 700, 700 - 178);
    expect(w.width).toBe(320);
    expect(w.groundY).toBe(522);
    // Sur le plus étroit des téléphones, les formes de dix cubes de large
    // restent hors d'atteinte — c'est la règle d'avant, inchangée.
    expect(w.fits(shapeFor(100))).toBe(false);
    expect(w.fits(shapeFor(4))).toBe(true);
  });

  it('accepte sur un chantier ce que l écran refusait', () => {
    // Sur un téléphone, les formes de dix cubes de large étaient hors
    // d'atteinte. Le chantier, lui, fait quarante cases.
    const ecran = new World();
    ecran.resize(320, 700, 522);
    const chantier = new World();
    chantier.resize(MONDE.w, MONDE.h, SOL_Y);
    expect(ecran.fits(shapeFor(100))).toBe(false);
    expect(chantier.fits(shapeFor(100))).toBe(true);
    expect(320 / UNIT).toBeLessThan(MONDE_W);
  });
});

describe('prendre et rendre un bloc', () => {
  const monde = () => {
    const w = new World();
    w.resize(MONDE.w, MONDE.h, SOL_Y);
    return w;
  };

  it('sort le bloc du monde pour de bon', () => {
    // Tenu sous la ligne de pose, un bloc ne doit plus exister pour personne :
    // sinon il bouscule les blocs bâtis avec un corps qu'on ne voit pas.
    const w = monde();
    const bloc = w.add(shapeFor(3), 400, 400);
    const autre = w.add(shapeFor(1), 800, 400);
    expect(w.prendre(bloc.id)).not.toBeNull();
    expect(w.blocks.has(bloc.id)).toBe(false);
    expect(w.engine.world.bodies).not.toContain(bloc.body);
    expect(w.totalUnits).toBe(autre.value);
    expect(w.blockAt({ x: 400, y: 400 })).toBeNull();
  });

  it('le refait à l identique, identité comprise', () => {
    // Il remonte : c est le même bloc qui reparaît, pas un neuf. Sa forme
    // soudée, sa matière et son inclinaison sont celles qu il avait.
    const w = monde();
    const skin = [
      { mat: 4, seed: 11 },
      { mat: 7, seed: 22 },
    ];
    const bloc = w.add(shapeOf([{ x: 0, y: 0 }, { x: 1, y: 0 }]), 300, 200, 0.4, undefined, undefined, skin);
    const cle = bloc.cle;
    const empreinte = w.prendre(bloc.id)!;
    const revenu = w.rendre(empreinte, 500, 250);
    expect(revenu.id).toBe(bloc.id);
    expect(revenu.value).toBe(bloc.value);
    expect(revenu.cle).toBe(cle);
    expect(revenu.skin).toEqual(skin);
    expect(revenu.body.angle).toBeCloseTo(0.4, 6);
    expect(revenu.body.position.x).toBeCloseTo(500, 6);
    expect(revenu.body.position.y).toBeCloseTo(250, 6);
    expect(w.engine.world.bodies).toContain(revenu.body);
    expect(w.blockAt({ x: 500, y: 250 })?.id).toBe(bloc.id);
  });

  it('ne rend rien d un bloc qui n existe pas', () => {
    expect(monde().prendre(4242)).toBeNull();
  });
});
