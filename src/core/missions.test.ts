import { describe, expect, it } from 'vitest';
import { MAX_UNITS } from './constants';
import { CHAPITRES, MISSIONS, aUneBosse, estCarre, missionById, nextMission, paletteFor } from './missions';
import { SLOTS, pieceFor } from './wardrobe';

describe('le parcours', () => {
  it('ne répète pas un identifiant', () => {
    expect(new Set(MISSIONS.map((m) => m.id)).size).toBe(MISSIONS.length);
  });

  it('offre une récompense qui existe et qui était fermée', () => {
    for (const m of MISSIONS) {
      const piece = pieceFor(m.prix.slot, m.prix.piece);
      expect(piece, `${m.id} : pièce inconnue`).toBeDefined();
      // Offrir une pièce déjà disponible ne récompense rien.
      expect(piece?.starter, `${m.id} : ${m.prix.piece} est déjà donnée`).toBeUndefined();
    }
  });

  it('ne donne jamais deux fois la même pièce', () => {
    const prix = MISSIONS.map((m) => `${m.prix.slot}:${m.prix.piece}`);
    expect(new Set(prix).size).toBe(prix.length);
  });

  it('rend toute pièce fermée gagnable', () => {
    // Une pièce qu'aucune mission ne donne se voit derrière son cadenas sans
    // qu'aucun chemin n'y mène : c'est une promesse qu'on ne tient pas.
    const donnees = new Set(MISSIONS.map((m) => `${m.prix.slot}:${m.prix.piece}`));
    for (const slot of SLOTS) {
      for (const piece of slot.pieces) {
        if (piece.starter) continue;
        expect(donnees.has(`${slot.key}:${piece.id}`), `${slot.key}:${piece.id}`).toBe(true);
      }
    }
  });

  it('accepte la solution que le fantôme montre', () => {
    // Le fantôme donne une solution : la fabriquer doit valider la mission,
    // sinon l'enfant fait exactement ce qu'on lui montre et il ne se passe rien.
    for (const m of MISSIONS) {
      const values = Array.from({ length: m.nombre ?? 1 }, () => m.cible);
      expect(m.check({ values }), `${m.id}`).toBe(true);
    }
  });

  it('ne se valide pas sur une scène vide', () => {
    for (const m of MISSIONS) {
      expect(m.check({ values: [] }), `${m.id}`).toBe(false);
    }
  });

  it('ne propose que des blocs de la barre', () => {
    for (const m of MISSIONS) {
      for (const v of m.palette ?? []) {
        expect(v, `${m.id}`).toBeGreaterThanOrEqual(1);
        expect(v, `${m.id}`).toBeLessThanOrEqual(10);
      }
    }
  });

  it('reste atteignable avec la barre qu on laisse', () => {
    // Une barre restreinte doit pouvoir amener au moins autant de cubes que la
    // cible en demande. En dessous, la mission est un mur : couper et secouer
    // savent réduire un bloc, jamais en fabriquer de la matière.
    for (const m of MISSIONS) {
      const barre = paletteFor(m);
      const besoin = m.cible * (m.nombre ?? 1);
      const sommes = new Set<number>([0]);
      for (let i = 0; i < MAX_UNITS; i++) {
        for (const somme of [...sommes]) {
          for (const v of barre) if (somme + v <= MAX_UNITS) sommes.add(somme + v);
        }
      }
      const assez = [...sommes].some((s) => s >= besoin);
      expect(assez, `${m.id} : ${besoin} cubes hors d'atteinte`).toBe(true);
    }
  });

  it('laisse toujours de quoi jouer dans la barre', () => {
    for (const m of MISSIONS) expect(paletteFor(m).length, `${m.id}`).toBeGreaterThan(0);
  });

  it('ne se gagne jamais en posant seulement des blocs', () => {
    // C'est la règle de la barre : le bloc qui donne la réponse n'y est pas.
    // Sans ça, « fabrique un bloc de 2 » se réglait d'un doigt sur le 2 — pas
    // de recherche, pas de réflexion. Il doit rester au moins un geste à faire.
    for (const m of MISSIONS) {
      const barre = paletteFor(m);
      // Une de plus que ce que la mission demande : la marge attrape une
      // mission qui se laisserait gagner en posant un bloc de trop.
      for (const main of mains(barre, (m.nombre ?? 1) + 1)) {
        expect(m.check({ values: main }), `${m.id} : ${main.join('+')} suffit`).toBe(false);
      }
    }
  });

  it('ne se gagne pas en posant un bloc de 1', () => {
    // `some(estCarre)` passait l'indice du tableau en second argument : le côté
    // minimal tombait à 0 et « fabrique un bloc tout carré » était gagné par
    // n'importe quel 1 traînant dans la scène.
    for (const m of MISSIONS) expect(m.check({ values: [1] }), `${m.id}`).toBe(false);
    expect(missionById('carre')!.check({ values: [1] })).toBe(false);
  });
});

/** Toutes les mains qu'on peut poser sans rien assembler, jusqu'à `taille` blocs. */
function mains(barre: number[], taille: number): number[][] {
  const out: number[][] = [];
  const marche = (debut: number, courante: number[]) => {
    if (courante.length) out.push([...courante]);
    if (courante.length === taille) return;
    for (let i = debut; i < barre.length; i++) {
      courante.push(barre[i]);
      marche(i, courante);
      courante.pop();
    }
  };
  marche(0, []);
  return out;
}

describe('les formes', () => {
  it('reconnaît les carrés, sauf le 1', () => {
    expect(estCarre(1)).toBe(false);
    for (const n of [4, 9, 16, 25, 36, 100]) expect(estCarre(n), `${n}`).toBe(true);
    for (const n of [2, 3, 5, 6, 8, 12]) expect(estCarre(n), `${n}`).toBe(false);
  });

  it('reconnaît les bosses, donc les premiers à partir de 5', () => {
    for (const n of [5, 7, 11, 13, 97]) expect(aUneBosse(n), `${n}`).toBe(true);
    for (const n of [1, 2, 3, 4, 6, 9, 100]) expect(aUneBosse(n), `${n}`).toBe(false);
  });
});

describe('nextMission', () => {
  it('suit l ordre du parcours', () => {
    expect(nextMission(new Set())?.id).toBe(CHAPITRES[0].missions[0].id);
    const toutes = new Set(MISSIONS.map((m) => m.id));
    expect(nextMission(toutes)).toBeUndefined();
  });
});
