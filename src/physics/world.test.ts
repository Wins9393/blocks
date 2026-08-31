import { describe, expect, it } from 'vitest';
import { rightingSpin } from './world';
import { DRAG_MAX_SPIN } from '../core/constants';

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
