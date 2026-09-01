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

/** Un carré, donc un nombre carré : 4, 9, 16, 25… Le 1 ne compte pas. */
export function estCarre(value: number): boolean {
  const shape = shapeFor(value);
  return shape.w > 1 && shape.w === shape.h;
}

/** Une bosse, donc un nombre premier à partir de 5. */
export function aUneBosse(value: number): boolean {
  return value >= 5 && isPrime(value);
}

// --- le contenu -----------------------------------------------------------

const m = (mission: Mission): Mission => mission;

const CHAPITRE_1: Chapitre = {
  id: 'compter',
  titre: 'Compter jusqu à 5',
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
      check: (s) => s.values.some(estCarre),
    }),
  ],
};

const CHAPITRE_2: Chapitre = {
  id: 'jusqua-dix',
  titre: 'Jusqu à 10',
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

export const CHAPITRES: readonly Chapitre[] = [CHAPITRE_1, CHAPITRE_2];

export const MISSIONS: readonly Mission[] = CHAPITRES.flatMap((c) => c.missions);

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
