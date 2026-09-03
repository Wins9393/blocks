import { describe, expect, it } from 'vitest';
import { caseEnMonde, placeCells, rotateCell, weld } from './build';
import { centeredOf, connectedParts, shapeOf } from './shape';
import type { Cell } from './shape';

const cle = (c: Cell) => `${c.x},${c.y}`;

const rect = (w: number, h: number): Cell[] => {
  const out: Cell[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.push({ x, y });
  return out;
};

/** Un L : trois cases en colonne, une quatrième au pied. */
const equerre: Cell[] = [
  { x: 0, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: 2 },
  { x: 1, y: 2 },
];

describe('rotateCell', () => {
  it('revient sur ses pas au bout de quatre quarts', () => {
    const c = { x: 3, y: -2 };
    expect(rotateCell(c, 4)).toEqual(c);
    expect(rotateCell(rotateCell(c, 1), 3)).toEqual(c);
    expect(rotateCell(c, -1)).toEqual(rotateCell(c, 3));
  });

  it('garde la distance à l’origine', () => {
    for (let q = 0; q < 4; q++) {
      const r = rotateCell({ x: 3, y: -2 }, q);
      expect(r.x * r.x + r.y * r.y).toBe(13);
    }
  });
});

describe('placeCells', () => {
  it('pose rigidement : les écarts entre cases ne changent pas', () => {
    for (let q = 0; q < 4; q++) {
      const pose = placeCells(equerre, q, { x: 7, y: -3 });
      expect(pose).toHaveLength(equerre.length);
      expect(pose[0]).toEqual({ x: 7, y: -3 });
      for (let i = 1; i < pose.length; i++) {
        const avant = equerre[i].x - equerre[0].x;
        const apres = pose[i].x - pose[0].x;
        const avantY = equerre[i].y - equerre[0].y;
        const apresY = pose[i].y - pose[0].y;
        expect(apres * apres + apresY * apresY).toBe(avant * avant + avantY * avantY);
      }
    }
  });
});

describe('la soudure', () => {
  const cibles = [rect(1, 1), rect(3, 2), equerre, rect(4, 4)];
  const tires = [rect(1, 1), rect(2, 1), equerre];

  it('conserve le compte de cubes et n’en superpose jamais deux', () => {
    for (const cible of cibles) {
      for (const tire of tires) {
        for (let q = 0; q < 4; q++) {
          for (let ax = -3; ax <= 4; ax++) {
            for (let ay = -3; ay <= 4; ay++) {
              const pose = weld(cible, tire, q, { x: ax, y: ay });
              if (!pose) continue;
              expect(pose).toHaveLength(tire.length);
              const tout = [...cible, ...pose].map(cle);
              expect(new Set(tout).size).toBe(tout.length);
            }
          }
        }
      }
    }
  });

  it('laisse toujours l’assemblage d’un seul tenant', () => {
    for (const cible of cibles) {
      for (const tire of tires) {
        for (let q = 0; q < 4; q++) {
          const pose = weld(cible, tire, q, { x: 2, y: 2 });
          if (!pose) continue;
          expect(connectedParts([...cible, ...pose])).toHaveLength(1);
        }
      }
    }
  });

  it('ne soude jamais par le coin', () => {
    // Visée en diagonale d'un cube isolé : le coin ne compte pas, donc la
    // soudure glisse sur une case qui partage vraiment une arête.
    const pose = weld([{ x: 0, y: 0 }], [{ x: 0, y: 0 }], 0, { x: 1, y: 1 });
    expect(pose).not.toBeNull();
    const [c] = pose as Cell[];
    expect(Math.abs(c.x) + Math.abs(c.y)).toBe(1);
  });

  it('refuse quand il n’y a de place nulle part', () => {
    // Ancré au milieu d'un bloc plein : tout le voisinage tombe sur une case
    // déjà prise, et rien ne se soude — c'est le refus, pas un déplacement.
    expect(weld(rect(9, 9), [{ x: 0, y: 0 }], 0, { x: 4, y: 4 })).toBeNull();
  });

  it('garde la place visée quand elle est libre', () => {
    // Le cas courant : on pose contre le mur, et ça se colle là, pas à côté.
    const pose = weld(rect(3, 1), [{ x: 0, y: 0 }], 0, { x: 1, y: 1 });
    expect(pose).toEqual([{ x: 1, y: 1 }]);
  });

  it('tourne le bloc tiré au quart de tour près', () => {
    // Une barre de trois posée à plat sur une barre de trois : couchée d'un
    // quart de tour, elle occupe une colonne, pas une ligne.
    const pose = weld(rect(3, 1), rect(3, 1), 1, { x: 0, y: 1 });
    expect(pose).not.toBeNull();
    const xs = new Set((pose as Cell[]).map((c) => c.x));
    expect(xs.size).toBe(1);
  });
});

describe('caseEnMonde', () => {
  const U = 36;
  /** Où le dessin met chaque cube d'un bloc : la formule du rendu, écrite à part. */
  const dessin = (cells: Cell[], pos: { x: number; y: number }, angle: number) =>
    centeredOf(shapeOf(cells)).map((o) => {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return {
        x: pos.x + o.x * U * cos - o.y * U * sin,
        y: pos.y + o.x * U * sin + o.y * U * cos,
      };
    });

  const proche = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    expect(a.x).toBeCloseTo(b.x, 6);
    expect(a.y).toBeCloseTo(b.y, 6);
  };

  it('met les cases d’un bloc là où le dessin les met', () => {
    // L'aperçu de soudure se pose par ce calcul, les cubes se dessinent par
    // l'autre : s'ils divergeaient, la place montrée ne serait pas celle prise.
    const cells = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 1 },
    ];
    const shape = shapeOf(cells);
    const centre = centeredOf(shape);
    for (const angle of [0, 0.3, -1.2, Math.PI / 2]) {
      const pos = { x: 205, y: 819 };
      const attendu = dessin(cells, pos, angle);
      shape.cells.forEach((c, i) => {
        proche(caseEnMonde(shape.cells, centre, pos, angle, U, c), attendu[i]);
      });
    }
  });

  it('sait placer une case que le bloc n’occupe pas encore', () => {
    // C'est tout l'objet de l'aperçu : la case (3, 0) d'un mur de trois n'existe
    // pas, et il faut pourtant savoir où elle tomberait.
    const shape = shapeOf(rect(3, 1));
    const centre = centeredOf(shape);
    const pos = { x: 100, y: 200 };
    const voisine = caseEnMonde(shape.cells, centre, pos, 0, U, { x: 3, y: 0 });
    const derniere = caseEnMonde(shape.cells, centre, pos, 0, U, { x: 2, y: 0 });
    proche(voisine, { x: derniere.x + U, y: derniere.y });
  });

  it('tourne avec le bloc', () => {
    // Un quart de tour sur un mur penché doit emmener la place avec lui, sinon
    // l'aperçu s'afficherait à côté de la tour qu'on rallonge.
    const shape = shapeOf(rect(2, 1));
    const centre = centeredOf(shape);
    const pos = { x: 0, y: 0 };
    const droit = caseEnMonde(shape.cells, centre, pos, 0, U, { x: 2, y: 0 });
    const tourne = caseEnMonde(shape.cells, centre, pos, Math.PI / 2, U, { x: 2, y: 0 });
    proche(tourne, { x: -droit.y, y: droit.x });
  });
});
