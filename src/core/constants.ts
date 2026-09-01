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
 * Corbeille : elle ne se montre que pendant un glisser, et n'est plus un corps
 * physique. C'est ça qui libère le terrain — pas sa position. Elle reste donc
 * posée au sol, à portée de pouce : le haut d'un écran de téléphone est occupé
 * par la barre du navigateur et l'encoche, et un doigt ne va pas y déposer
 * quoi que ce soit.
 */
export const TRASH_W = 104;
