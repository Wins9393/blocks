/** Taille d'un cube unité, en pixels monde. */
export const UNIT = 36;

/** Valeur maximale d'un bloc. Au-delà, la fusion est refusée. */
export const MAX_VALUE = 100;

/** Nombre total de cubes autorisés dans la scène (garde-fou perfs). */
export const MAX_UNITS = 150;

/** Physique. */
export const GRAVITY_Y = 1.15;
export const FIXED_DT = 1000 / 60;
export const MAX_SUBSTEPS = 3;

/** Drag cinématique : gain du correcteur proportionnel et vitesse max par pas. */
export const DRAG_GAIN = 0.34;
export const DRAG_MAX_SPEED = 48;

/** Redressement du bloc tenu : gain, et vitesse angulaire max en rad/pas. */
export const DRAG_STRAIGHTEN = 0.18;
export const DRAG_MAX_SPIN = 0.12;

/** Fusion : écart maximal entre deux cubes pour que la fusion soit proposée. */
export const MERGE_GAP = 18;

/** Distance minimale à parcourir avant qu'un glisser puisse fusionner. */
export const MERGE_MIN_TRAVEL = 16;

/** Secousse : paramètres du détecteur d'oscillation. */
export const SHAKE_MIN_AMPLITUDE = 38;
export const SHAKE_MIN_SPEED = 700;
export const SHAKE_REVERSAL_WINDOW = 420;
export const SHAKE_PEEL_COOLDOWN = 170;

/** Découpe : longueur minimale d'un trait pour qu'il compte comme une coupe. */
export const SLICE_MIN_LENGTH = 64;
export const SLICE_MIN_SPEED = 0.25;

/**
 * Taille de repli quand la fenêtre n'est pas mesurable au démarrage (onglet
 * ouvert en arrière-plan, page dans un cadre masqué) : sans elle, le monde
 * resterait sans sol ni murs et la scène tomberait dans le vide.
 */
export const FALLBACK_WIDTH = 390;
export const FALLBACK_HEIGHT = 700;

/** Mise en page. */
export const GROUND_HEIGHT = 26;
// Deux rangees de cinq blocs, plus assez de marge pour que le sol reste
// visible au-dessus : sans bande de sol, les blocs ont l'air de flotter.
export const BOTTOM_SAFE = 178;
/**
 * Largeur a partir de laquelle les dix blocs tiennent sur une seule rangee.
 * La feuille de style connait le meme seuil (`@media (min-width: 880px)`) : les
 * deux doivent basculer ensemble, sinon le sol flotte au-dessus des boutons ou
 * la barre les recouvre.
 */
export const LARGE_MIN = 880;
/** Meme marge, mais pour une seule rangee — un peu plus haute que sur deux. */
export const BOTTOM_SAFE_LARGE = 136;
/**
 * Corbeille : une trappe dans le sol, sous la ligne où les blocs se posent.
 *
 * Elle ne se montre que pendant un glisser. Surtout, elle est **hors du
 * terrain de jeu** : partout ailleurs, elle occupait une place où des blocs
 * vivent, et glisser un bloc vers un voisin pour le fusionner le jetait à la
 * poubelle par accident. Sous le sol, aucune fusion ne passe jamais par là.
 */
export const TRASH_W = 280;
/** Profondeur à franchir sous le sol pour que le lâcher jette le bloc. */
export const TRASH_LIP = 20;
