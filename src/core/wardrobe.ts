import { MAX_VALUE } from './constants';

/**
 * Le vestiaire : ce que les blocs peuvent porter, et ce que chaque nombre
 * porte par défaut.
 *
 * Séparé du dessin, parce que c'est une donnée : les missions y piochent les
 * pièces à débloquer, la sauvegarde le valide, l'atelier l'affiche. Rien ici
 * ne touche à un canvas.
 *
 * Règle de matière, respectée par le dessin : **les cheveux appartiennent au
 * personnage, les accessoires sont des objets**. Une chevelure prend une
 * teinte du bloc ; un bonnet est en laine rouge, une casquette en denim, une
 * couronne en or. C'est ce qui fait la différence entre un bloc habillé et un
 * bloc teinté.
 */

export type EyeKind =
  | 'ronds'
  | 'grands'
  | 'malins'
  | 'endormis'
  | 'etoiles'
  | 'coeurs'
  | 'spirale';

export type BrowKind = 'rien' | 'arcs' | 'droits' | 'hauts' | 'faches';

export type MouthKind =
  | 'sourire'
  | 'large'
  | 'rond'
  | 'dent'
  | 'coin'
  | 'trait'
  | 'langue'
  | 'dents';

export type HairKind =
  | 'rien'
  | 'epi'
  | 'couettes'
  | 'pics'
  | 'carre'
  | 'boucles'
  | 'chignon'
  | 'meche'
  | 'tresses';

export type HatKind =
  | 'rien'
  | 'couronne'
  | 'casquette'
  | 'bonnet'
  | 'fete'
  | 'plume'
  | 'etoile'
  | 'sorcier'
  | 'hautForme'
  | 'viking'
  | 'chat'
  | 'bois'
  | 'fleurs'
  | 'helice'
  | 'chantier'
  | 'bandana'
  | 'aureole';

export type GlassKind = 'rien' | 'rondes' | 'carrees' | 'soleil' | 'plongee' | 'cache' | 'coeur';

export type StacheKind = 'rien' | 'moustache' | 'bouc' | 'blanche' | 'bucheron';

export type CheekKind = 'rien' | 'roses' | 'taches' | 'deux';

export type ScarfKind =
  | 'rien'
  | 'echarpe'
  | 'noeud'
  | 'foulard'
  | 'medaille'
  | 'cape'
  | 'colRoule';

export interface Look {
  eyes: EyeKind;
  brows: BrowKind;
  mouth: MouthKind;
  hair: HairKind;
  hat: HatKind;
  glasses: GlassKind;
  stache: StacheKind;
  cheeks: CheekKind;
  scarf: ScarfKind;
}

export type SlotKey = keyof Look;

/** Ce qu'un espace a changé, pièce par pièce, pour les blocs de 1 à 10. */
export type Wardrobe = Record<number, Partial<Look>>;

export type ResolvedLook = Look;

export interface Piece {
  id: string;
  /** Nom montré sur la carte de récompense. */
  label: string;
  /** Disponible sans rien avoir gagné. Le reste s'ouvre par les missions. */
  starter?: true;
  /** Le dessin bouge : il ne peut pas être mis en cache. */
  anime?: true;
}

export interface Slot {
  key: SlotKey;
  label: string;
  pieces: readonly Piece[];
}

const p = (id: string, label: string, starter?: true, anime?: true): Piece => ({
  id,
  label,
  ...(starter ? { starter } : {}),
  ...(anime ? { anime } : {}),
});

/** Le vestiaire, dans l'ordre des onglets de l'atelier. */
export const SLOTS: readonly Slot[] = [
  {
    key: 'eyes',
    label: 'Yeux',
    pieces: [
      p('ronds', 'les yeux ronds', true),
      p('grands', 'les grands yeux', true),
      p('malins', 'les yeux malins', true),
      p('endormis', 'les yeux endormis'),
      p('etoiles', 'les yeux étoiles'),
      p('coeurs', 'les yeux en cœur'),
      p('spirale', 'les yeux tourbillon'),
    ],
  },
  {
    key: 'brows',
    label: 'Sourcils',
    pieces: [
      p('rien', 'pas de sourcils', true),
      p('arcs', 'les sourcils arqués', true),
      p('droits', 'les sourcils droits', true),
      p('hauts', 'les sourcils étonnés', true),
      p('faches', 'les sourcils fâchés'),
    ],
  },
  {
    key: 'mouth',
    label: 'Bouche',
    pieces: [
      p('sourire', 'le sourire', true),
      p('large', 'le grand sourire', true),
      p('rond', 'la bouche ronde', true),
      p('dent', 'la petite dent', true),
      p('coin', 'le sourire en coin', true),
      p('trait', 'la bouche sérieuse', true),
      p('langue', 'la langue tirée', true),
      p('dents', 'les belles dents'),
    ],
  },
  {
    key: 'hair',
    label: 'Cheveux',
    pieces: [
      p('rien', 'pas de cheveux', true),
      p('epi', "l'épi", true),
      p('couettes', 'les couettes', true),
      p('pics', 'les épis en pointe', true),
      p('carre', 'le carré', true),
      p('boucles', 'les boucles', true),
      p('chignon', 'le chignon', true),
      p('meche', 'la mèche', true),
      p('tresses', 'les tresses'),
    ],
  },
  {
    key: 'hat',
    label: 'Chapeau',
    pieces: [
      p('rien', 'tête nue', true),
      p('couronne', "la couronne d'or", true),
      p('etoile', "la barrette étoile", true),
      p('plume', 'le bandeau à plume', true),
      p('casquette', 'la casquette', true),
      p('bonnet', 'le bonnet de laine'),
      p('fete', 'le chapeau de fête'),
      p('sorcier', 'le chapeau de sorcier'),
      p('hautForme', 'le haut-de-forme'),
      p('viking', 'le casque viking'),
      p('chat', 'les oreilles de chat'),
      p('bois', 'les bois de cerf'),
      p('fleurs', 'la couronne de fleurs'),
      p('chantier', 'le casque de chantier'),
      p('bandana', 'le bandana de pirate'),
      p('helice', "la casquette à hélice", undefined, true),
      p('aureole', "l'auréole", undefined, true),
    ],
  },
  {
    key: 'glasses',
    label: 'Lunettes',
    pieces: [
      p('rien', 'pas de lunettes', true),
      p('rondes', 'les lunettes rondes', true),
      p('carrees', 'les lunettes carrées', true),
      p('soleil', 'les lunettes de soleil'),
      p('coeur', 'les lunettes en cœur'),
      p('plongee', 'le masque de plongée'),
      p('cache', "le cache-œil"),
    ],
  },
  {
    key: 'stache',
    label: 'Barbe',
    pieces: [
      p('rien', 'pas de barbe', true),
      p('moustache', 'la moustache', true),
      p('bouc', 'le bouc'),
      p('blanche', 'la grande barbe blanche'),
      p('bucheron', 'la barbe de bûcheron'),
    ],
  },
  {
    key: 'cheeks',
    label: 'Joues',
    pieces: [
      p('rien', 'joues nues', true),
      p('roses', 'les joues roses', true),
      p('taches', 'les taches de rousseur', true),
      p('deux', 'joues roses et taches', true),
    ],
  },
  {
    key: 'scarf',
    label: 'Cou',
    pieces: [
      p('rien', 'rien au cou', true),
      p('echarpe', "l'écharpe", true),
      p('noeud', 'le nœud papillon', true),
      p('foulard', 'le foulard'),
      p('colRoule', 'le col roulé'),
      p('medaille', "la médaille d'or"),
      p('cape', 'la cape', undefined, true),
    ],
  },
];

const PAR_CLE = new Map(SLOTS.map((s) => [s.key, s]));

export function slotFor(key: SlotKey): Slot {
  return PAR_CLE.get(key) ?? SLOTS[0];
}

export function pieceFor(key: SlotKey, id: string): Piece | undefined {
  return slotFor(key).pieces.find((piece) => piece.id === id);
}

/** Les pièces dont le dessin bouge : elles ne peuvent pas être mises en cache. */
export const ANIMEES = new Set<string>(
  SLOTS.flatMap((s) => s.pieces.filter((piece) => piece.anime).map((piece) => `${s.key}:${piece.id}`)),
);

function mk(patch: Partial<Look>): Look {
  return {
    eyes: 'ronds',
    brows: 'rien',
    mouth: 'sourire',
    hair: 'rien',
    hat: 'rien',
    glasses: 'rien',
    stache: 'rien',
    cheeks: 'rien',
    scarf: 'rien',
    ...patch,
  };
}

const DEFAULTS: Record<number, Look> = {
  1: mk({ mouth: 'rond', hair: 'epi', cheeks: 'deux' }),
  2: mk({ eyes: 'grands', mouth: 'large', hair: 'couettes', cheeks: 'roses' }),
  3: mk({ brows: 'arcs', hair: 'pics', stache: 'moustache' }),
  4: mk({ brows: 'droits', mouth: 'trait', hair: 'carre' }),
  5: mk({ eyes: 'grands', mouth: 'langue', hair: 'meche', hat: 'etoile' }),
  6: mk({ mouth: 'dent', hair: 'boucles', cheeks: 'taches' }),
  7: mk({ eyes: 'malins', brows: 'arcs', mouth: 'coin', hat: 'plume' }),
  8: mk({ hair: 'meche', glasses: 'rondes' }),
  9: mk({ eyes: 'grands', brows: 'hauts', mouth: 'large', hair: 'chignon', cheeks: 'roses' }),
  10: mk({ mouth: 'langue', hat: 'couronne', cheeks: 'roses' }),
};

/** La tenue livrée d'origine, sans les réglages de l'espace. */
export function defaultLook(value: number): Look {
  return DEFAULTS[Math.min(10, Math.max(1, Math.round(value)))];
}

/**
 * La tenue d'un nombre, réglages de l'espace compris.
 *
 * Au-dessus de dix, le personnage garde son visage d'unité et coiffe le
 * chapeau du 10 : c'est ce chapeau, quel qu'il soit, qui marque la dizaine.
 */
export function lookFor(value: number, wardrobe?: Wardrobe): ResolvedLook {
  const v = Math.min(MAX_VALUE, Math.max(1, Math.round(value)));
  if (v <= 10) return { ...DEFAULTS[v], ...(wardrobe?.[v] ?? {}) };
  const unite = lookFor(v - 10, wardrobe);
  return { ...unite, hat: lookFor(10, wardrobe).hat };
}

/** De quoi savoir si deux tenues donnent le même dessin. */
export function lookSignature(look: ResolvedLook): string {
  return SLOTS.map((s) => look[s.key]).join('.');
}

/** Ne garde d'une sauvegarde que des pièces qui existent encore. */
export function cleanWardrobe(raw: unknown): Wardrobe {
  const out: Wardrobe = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(key);
    if (!Number.isInteger(n) || n < 1 || n > 10) continue;
    if (!value || typeof value !== 'object') continue;
    const patch: Record<string, string> = {};
    for (const slot of SLOTS) {
      const pick = (value as Record<string, unknown>)[slot.key];
      if (typeof pick === 'string' && slot.pieces.some((piece) => piece.id === pick)) {
        patch[slot.key] = pick;
      }
    }
    if (Object.keys(patch).length) out[n] = patch as Partial<Look>;
  }
  return out;
}
