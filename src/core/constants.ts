/** Taille d'un cube unité, en pixels monde. */
export const UNIT = 36;

/** Valeur maximale d'un bloc. Au-delà, la fusion est refusée. */
export const MAX_VALUE = 20;

/** Nombre total de cubes autorisés dans la scène (garde-fou perfs). */
export const MAX_UNITS = 150;

/** Physique. */
export const GRAVITY_Y = 1.15;
export const FIXED_DT = 1000 / 60;
export const MAX_SUBSTEPS = 3;

/** Drag cinématique : gain du correcteur proportionnel et vitesse max par pas. */
export const DRAG_GAIN = 0.34;
export const DRAG_MAX_SPEED = 48;

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

/** Mise en page. */
export const GROUND_HEIGHT = 26;
export const BOTTOM_SAFE = 96;
export const TRASH_W = 96;
