import { isPrime, shapeFor } from './shape';
import type { SlotKey } from './wardrobe';

/**
 * Les missions.
 *
 * Règle d'architecture : **une mission est un prédicat sur la scène, jamais
 * une séquence scriptée.** « Il existe un bloc de 8 », « il existe deux blocs
 * de 4 », « il existe un bloc à bosse ». L'enfant y arrive comme il veut — en
 * fusionnant, en coupant, en secouant. C'est meilleur pédagogiquement, et ça
 * garde tout ça pur et testable.
 *
 * Les contraintes de moyens ne sont pas dans le prédicat : « avec seulement
 * des 3 » se traduit par une barre de blocs qui ne montre que le 3. La règle
 * est dans ce qui est disponible, il n'y a rien à lire et rien à enfreindre.
 */

/** Ce que la mission regarde : l'état de la scène, rien d'autre. */
export interface Snapshot {
  /** Valeurs des blocs présents, sans ordre. */
  values: number[];
}

export interface Prix {
  slot: SlotKey;
  piece: string;
}

export interface Mission {
  id: string;
  /** Dit à voix haute, et lisible par l'adulte. */
  enonce: string;
  /**
   * Le bloc montré en fantôme dans la scène. Il donne **une** solution, pas la
   * seule : le prédicat en accepte souvent d'autres, et c'est voulu.
   */
  cible: number;
  /** Combien d'exemplaires du fantôme. */
  nombre?: number;
  /** Les blocs offerts dans la barre. Absent = tous. */
  palette?: number[];
  prix: Prix;
  check(s: Snapshot): boolean;
}

export interface Chapitre {
  id: string;
  titre: string;
  missions: readonly Mission[];
}

// --- prédicats ------------------------------------------------------------

const compte = (s: Snapshot, v: number) => s.values.filter((x) => x === v).length;
const aUnBloc = (v: number) => (s: Snapshot) => compte(s, v) > 0;
const aDeuxBlocs = (v: number) => (s: Snapshot) => compte(s, v) >= 2;
/** N blocs identiques, quelle que soit leur valeur — pourvu qu'elle dépasse 1. */
const aNPareils = (n: number) => (s: Snapshot) =>
  s.values.some((v) => v >= 2 && compte(s, v) >= n);

/** Un carré d'au moins `cote` cubes de large : 4, 9, 16, 25… Le 1 ne compte pas. */
export function estCarre(value: number, cote = 2): boolean {
  const shape = shapeFor(value);
  return shape.w >= cote && shape.w === shape.h;
}

/** Une bosse, donc un nombre premier à partir de 5. */
export function aUneBosse(value: number): boolean {
  return value >= 5 && isPrime(value);
}

/** Une colonne d'un seul cube de large : 2 et 3, les petits premiers. */
export function estColonne(value: number): boolean {
  return value >= 2 && shapeFor(value).w === 1;
}

/** Un rectangle plein, donc un nombre composé : pas de bosse qui dépasse. */
export function estPlein(value: number): boolean {
  const shape = shapeFor(value);
  return value >= 4 && shape.w * shape.h === value;
}

// --- le contenu -----------------------------------------------------------

const m = (mission: Mission): Mission => mission;

const CHAPITRE_1: Chapitre = {
  id: 'compter',
  titre: 'Compter jusqu’à 5',
  missions: [
    m({
      id: 'faire-2',
      enonce: 'Fabrique un bloc de 2',
      cible: 2,
      prix: { slot: 'hat', piece: 'chat' },
      check: aUnBloc(2),
    }),
    m({
      id: 'faire-3',
      enonce: 'Fabrique un bloc de 3',
      cible: 3,
      prix: { slot: 'mouth', piece: 'dents' },
      check: aUnBloc(3),
    }),
    m({
      id: 'faire-5',
      enonce: 'Fabrique un bloc de 5',
      cible: 5,
      prix: { slot: 'eyes', piece: 'etoiles' },
      check: aUnBloc(5),
    }),
    m({
      // Seuls des 4 sont offerts : pour obtenir un 3, il faut en retirer un.
      // La soustraction naît de ce qui manque dans la barre.
      id: 'enlever-1',
      enonce: 'Enlève 1 à un bloc de 4',
      cible: 3,
      palette: [4],
      prix: { slot: 'hat', piece: 'fete' },
      check: aUnBloc(3),
    }),
    m({
      id: 'deux-2',
      enonce: 'Fabrique deux blocs de 2',
      cible: 2,
      nombre: 2,
      prix: { slot: 'glasses', piece: 'coeur' },
      check: aDeuxBlocs(2),
    }),
    m({
      id: 'carre',
      enonce: 'Fabrique un bloc tout carré',
      cible: 4,
      prix: { slot: 'hat', piece: 'fleurs' },
      // Surtout pas `some(estCarre)` : `some` passe l'indice en second argument,
      // le côté minimal tombait à 0 et un simple bloc de 1 gagnait la mission.
      check: (s) => s.values.some((v) => estCarre(v)),
    }),
  ],
};

const CHAPITRE_2: Chapitre = {
  id: 'jusqua-dix',
  titre: 'Jusqu’à 10',
  missions: [
    m({
      id: 'faire-7',
      enonce: 'Fabrique un bloc de 7',
      cible: 7,
      prix: { slot: 'hat', piece: 'bandana' },
      check: aUnBloc(7),
    }),
    m({
      id: 'faire-10',
      enonce: 'Fabrique un bloc de 10',
      cible: 10,
      prix: { slot: 'hat', piece: 'chantier' },
      check: aUnBloc(10),
    }),
    m({
      id: 'dix-avec-2',
      enonce: 'Fabrique un 10 avec seulement des 2',
      cible: 10,
      palette: [2],
      prix: { slot: 'glasses', piece: 'soleil' },
      check: aUnBloc(10),
    }),
    m({
      id: 'neuf-avec-3',
      enonce: 'Fabrique un 9 avec seulement des 3',
      cible: 9,
      palette: [3],
      prix: { slot: 'stache', piece: 'bucheron' },
      check: aUnBloc(9),
    }),
    m({
      // Seuls des 8 sont offerts : deux 4 ne s'obtiennent qu'en coupant.
      id: 'couper-8',
      enonce: 'Coupe un 8 en deux blocs de 4',
      cible: 4,
      nombre: 2,
      palette: [8],
      prix: { slot: 'hat', piece: 'viking' },
      check: aDeuxBlocs(4),
    }),
    m({
      id: 'bosse',
      enonce: 'Fabrique un bloc qui a une bosse',
      cible: 5,
      prix: { slot: 'hat', piece: 'sorcier' },
      check: (s) => s.values.some(aUneBosse),
    }),
  ],
};

const CHAPITRE_3: Chapitre = {
  id: 'formes',
  titre: 'Les formes',
  missions: [
    m({
      id: 'colonne',
      enonce: 'Fabrique un bloc tout en hauteur',
      cible: 3,
      prix: { slot: 'scarf', piece: 'foulard' },
      check: (s) => s.values.some(estColonne),
    }),
    m({
      id: 'carre-9',
      enonce: 'Fabrique un carré plus grand',
      cible: 9,
      prix: { slot: 'hat', piece: 'bonnet' },
      check: (s) => s.values.some((v) => estCarre(v, 3)),
    }),
    m({
      id: 'plein',
      enonce: 'Fabrique un bloc bien plein, sans bosse',
      cible: 6,
      prix: { slot: 'eyes', piece: 'endormis' },
      check: (s) => s.values.some(estPlein),
    }),
    m({
      id: 'trois-pareils',
      enonce: 'Fabrique trois blocs pareils',
      cible: 2,
      nombre: 3,
      prix: { slot: 'stache', piece: 'bouc' },
      check: aNPareils(3),
    }),
    m({
      // Seuls des 10 sont offerts : deux 5 ne s'obtiennent qu'en coupant.
      id: 'moitie-10',
      enonce: 'Coupe un 10 en deux blocs de 5',
      cible: 5,
      nombre: 2,
      palette: [10],
      prix: { slot: 'hat', piece: 'bois' },
      check: aDeuxBlocs(5),
    }),
    m({
      id: 'carre-16',
      enonce: 'Fabrique un très grand carré',
      cible: 16,
      prix: { slot: 'glasses', piece: 'plongee' },
      check: (s) => s.values.some((v) => estCarre(v, 4)),
    }),
  ],
};

const CHAPITRE_4: Chapitre = {
  id: 'dizaine',
  titre: 'La dizaine',
  missions: [
    m({
      id: 'vingt',
      enonce: 'Fabrique un bloc de 20',
      cible: 20,
      prix: { slot: 'hat', piece: 'aureole' },
      check: aUnBloc(20),
    }),
    m({
      id: 'deux-dix',
      enonce: 'Fabrique deux blocs de 10',
      cible: 10,
      nombre: 2,
      prix: { slot: 'hair', piece: 'tresses' },
      check: aDeuxBlocs(10),
    }),
    m({
      id: 'treize',
      enonce: 'Fabrique un 13 avec un 10 et des 1',
      cible: 13,
      palette: [1, 10],
      prix: { slot: 'eyes', piece: 'coeurs' },
      check: aUnBloc(13),
    }),
    m({
      id: 'quinze-5',
      enonce: 'Fabrique un 15 avec seulement des 5',
      cible: 15,
      palette: [5],
      prix: { slot: 'scarf', piece: 'medaille' },
      check: aUnBloc(15),
    }),
    m({
      id: 'douze-4',
      enonce: 'Fabrique un 12 avec seulement des 4',
      cible: 12,
      palette: [4],
      prix: { slot: 'brows', piece: 'faches' },
      check: aUnBloc(12),
    }),
    m({
      id: 'trente',
      enonce: 'Fabrique un bloc de 30',
      cible: 30,
      prix: { slot: 'scarf', piece: 'colRoule' },
      check: aUnBloc(30),
    }),
  ],
};

const CHAPITRE_5: Chapitre = {
  id: 'defis',
  titre: 'Les défis',
  missions: [
    m({
      id: 'dix-sept',
      enonce: 'Fabrique un 17 avec des 3 et des 1',
      cible: 17,
      palette: [1, 3],
      prix: { slot: 'eyes', piece: 'spirale' },
      check: aUnBloc(17),
    }),
    m({
      id: 'cinq-fois-3',
      enonce: 'Fabrique cinq blocs de 3',
      cible: 3,
      nombre: 5,
      prix: { slot: 'glasses', piece: 'cache' },
      check: (s) => compte(s, 3) >= 5,
    }),
    m({
      id: 'dix-avec-3',
      enonce: 'Fabrique un 10 avec seulement des 3',
      cible: 10,
      palette: [3],
      prix: { slot: 'hat', piece: 'hautForme' },
      check: aUnBloc(10),
    }),
    m({
      id: 'grande-bosse',
      enonce: 'Fabrique un bloc à bosse plus grand que 10',
      cible: 11,
      prix: { slot: 'scarf', piece: 'cape' },
      check: (s) => s.values.some((v) => v > 10 && aUneBosse(v)),
    }),
    m({
      id: 'vingt-quatre',
      enonce: 'Fabrique un bloc de 24',
      cible: 24,
      prix: { slot: 'stache', piece: 'blanche' },
      check: aUnBloc(24),
    }),
    m({
      id: 'cinquante',
      enonce: 'Fabrique un bloc de 50',
      cible: 50,
      prix: { slot: 'hat', piece: 'helice' },
      check: aUnBloc(50),
    }),
  ],
};

export const CHAPITRES: readonly Chapitre[] = [
  CHAPITRE_1,
  CHAPITRE_2,
  CHAPITRE_3,
  CHAPITRE_4,
  CHAPITRE_5,
];

export const MISSIONS: readonly Mission[] = CHAPITRES.flatMap((c) => c.missions);

/** Les dix blocs de la barre, quand la mission n'en retire aucun. */
export const BARRE: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * Les blocs offerts dans la barre pour une mission.
 *
 * **Un bloc qui gagne la mission rien qu'en le posant n'a pas sa place dans la
 * barre.** « Fabrique un bloc de 2 » se réglait d'un doigt sur le 2 : aucune
 * recherche, aucune réflexion. On retire donc tout bloc qui, posé une fois — ou
 * autant de fois que la mission en demande — valide déjà le prédicat. Ce qui
 * reste force au moins un geste : coller, couper ou secouer.
 *
 * C'est une règle, pas une liste : elle se déduit du prédicat, donc une mission
 * ajoutée demain est filtrée sans qu'on y pense. Effet de bord heureux —
 * « fabrique un bloc qui a une bosse » perd le 5 *et* le 7, et « fabrique un
 * bloc bien plein » perd tous les rectangles pleins de la barre.
 */
export function paletteFor(mission: Mission): number[] {
  const base = mission.palette ?? BARRE;
  const combien = mission.nombre ?? 1;
  return base.filter((v) => {
    for (let k = 1; k <= combien; k++) {
      if (mission.check({ values: Array.from({ length: k }, () => v) })) return false;
    }
    return true;
  });
}

export function missionById(id: string): Mission | undefined {
  return MISSIONS.find((mission) => mission.id === id);
}

/**
 * La mission suivante dans l'ordre du parcours, ou rien si tout est fait.
 *
 * Une mission mise de côté repasse en fin de file plutôt que de disparaître :
 * on peut toujours en demander une autre, et rien ne se perd.
 */
export function nextMission(
  faites: ReadonlySet<string>,
  passees: ReadonlySet<string> = new Set(),
): Mission | undefined {
  const reste = MISSIONS.filter((mission) => !faites.has(mission.id));
  return reste.find((mission) => !passees.has(mission.id)) ?? reste[0];
}
