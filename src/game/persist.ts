import { cleanWardrobe } from '../core/wardrobe';
import type { Wardrobe } from '../core/wardrobe';

const PREFS_KEY = 'blocks.prefs.v1';
const SPACES_KEY = 'blocks.spaces.v1';
const SCENE_PREFIX = 'blocks.scene.v2:';
const BUILD_PREFIX = 'blocks.build.v1:';
const LOOK_PREFIX = 'blocks.look.v1:';
const PROGRESS_PREFIX = 'blocks.progress.v1:';
/** Sauvegarde d'avant les espaces : elle devient la scène du premier espace. */
const LEGACY_SCENE_KEY = 'blocks.scene.v1';

export const DEFAULT_SPACE_ID = 'defaut';
export const NAME_MAX = 16;

export interface SavedBlock {
  v: number;
  x: number;
  y: number;
  a: number;
}

export interface SavedScene {
  /** Largeur de l'écran au moment de la sauvegarde, pour la remettre à l'échelle. */
  w: number;
  blocks: SavedBlock[];
}

/**
 * Un cube de chantier : sa case, sa matière, et le grain figé à sa naissance.
 *
 * Ce n'est pas une valeur qui décrit un assemblage — il n'en a pas — mais ses
 * cases, une par une. La matière est **par cube**, jamais par bloc : un mur
 * mêle le chêne et la brique, et souder ne repeint rien.
 */
export interface SavedCube {
  x: number;
  y: number;
  m: number;
  g: number;
}

export interface SavedPiece {
  cells: SavedCube[];
  x: number;
  y: number;
  a: number;
}

export interface SavedBuild {
  w: number;
  blocks: SavedPiece[];
  /**
   * Le cadrage. On quitte un jeu en plein milieu d'une tour : retrouver la vue
   * d'ensemble à la place du détail sur lequel on travaillait, c'est perdre le
   * fil — d'autant que le monde fait trois écrans.
   */
  cam?: { x: number; y: number; k: number };
}

/**
 * Les trois modes s'excluent : on est en jeu libre, en missions, ou sur un
 * chantier. Deux interrupteurs indépendants ne diraient jamais lequel est
 * actif — c'est un choix à trois, pas deux bascules.
 */
export type Mode = 'libre' | 'missions' | 'construction';

/**
 * Un espace tient deux scènes qui ne se voient jamais : les nombres d'un côté,
 * le chantier de l'autre. Changer de mode range l'une et sort l'autre, tout
 * comme changer d'espace passe d'un rayon à l'autre.
 */
export type SceneKind = 'nombres' | 'chantier';

export function sceneKindFor(mode: Mode): SceneKind {
  return mode === 'construction' ? 'chantier' : 'nombres';
}

export interface Space {
  id: string;
  name: string;
  /** Indice de couleur dans la palette, pour reconnaître l'espace d'un coup d'œil. */
  tint: number;
}

export interface SpaceBook {
  spaces: Space[];
  currentId: string;
}

export interface Prefs {
  /** La voix qui dit les nombres à haute voix. */
  voix: boolean;
  /** Les notes, les chocs, la fanfare. */
  bruitages: boolean;
  hintsSeen: boolean;
}

const DEFAULT_PREFS: Prefs = { voix: true, bruitages: true, hintsSeen: false };

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Navigation privée, quota plein : perdre la sauvegarde n'est pas grave.
  }
}

function drop(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Idem : rien de vital.
  }
}

// --- espaces --------------------------------------------------------------

/** Nom propre : coupé, borné, et jamais vide. */
export function cleanName(raw: string): string {
  const name = raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  return name || 'Sans nom';
}

/**
 * L'identifiant relie un espace à sa scène : deux espaces qui le partagent
 * partageraient la construction. La part aléatoire est donc large, et de
 * longueur fixe pour ne pas se confondre avec l'horodatage qui la précède.
 */
export function newSpaceId(): string {
  const alea = Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  return `e${Date.now().toString(36)}-${alea}`;
}

export function makeSpace(name: string, tint: number): Space {
  return { id: newSpaceId(), name: cleanName(name), tint };
}

/**
 * Le carnet d'espaces. Il en contient toujours au moins un, et `currentId`
 * en désigne toujours un qui existe : le reste de l'application n'a jamais
 * à se demander quoi faire d'une liste vide.
 */
export function loadSpaces(): SpaceBook {
  const data = read<Partial<SpaceBook>>(SPACES_KEY);
  const spaces = (Array.isArray(data?.spaces) ? data.spaces : [])
    .filter((s): s is Space => typeof s?.id === 'string' && typeof s?.name === 'string')
    .map((s) => ({ id: s.id, name: cleanName(s.name), tint: Number(s.tint) || 1 }));

  if (!spaces.length) {
    spaces.push({ id: DEFAULT_SPACE_ID, name: 'Mon espace', tint: 1 });
  }
  const currentId = spaces.some((s) => s.id === data?.currentId)
    ? (data!.currentId as string)
    : spaces[0].id;
  return { spaces, currentId };
}

export function saveSpaces(book: SpaceBook) {
  write(SPACES_KEY, book);
}

// --- scènes ---------------------------------------------------------------

function sceneKey(id: string, kind: SceneKind): string {
  return (kind === 'chantier' ? BUILD_PREFIX : SCENE_PREFIX) + id;
}

export function loadScene(spaceId: string): SavedScene | null {
  // Le tout premier espace hérite de la scène d'avant : on ne fait pas
  // disparaître la construction en cours en livrant les espaces. C'était celle
  // des nombres, la seule qui existât alors — un chantier n'en hérite jamais.
  const data =
    read<SavedScene>(sceneKey(spaceId, 'nombres')) ??
    (spaceId === DEFAULT_SPACE_ID ? read<SavedScene>(LEGACY_SCENE_KEY) : null);
  if (!data || !Array.isArray(data.blocks) || !Number.isFinite(data.w)) return null;
  const blocks = data.blocks.filter(
    (b) => typeof b?.v === 'number' && Number.isFinite(b.x) && Number.isFinite(b.y),
  );
  return blocks.length ? { w: data.w, blocks } : null;
}

export function saveScene(spaceId: string, scene: SavedScene) {
  write(sceneKey(spaceId, 'nombres'), scene);
}

const entier = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v);

/**
 * Un chantier ne se relit que par morceaux entiers : une pièce sans case n'a
 * pas de forme, un cube sans coordonnées n'a pas de place. On jette la pièce et
 * pas la sauvegarde — perdre un mur vaut mieux que perdre la maison.
 */
export function loadBuild(spaceId: string): SavedBuild | null {
  const data = read<SavedBuild>(sceneKey(spaceId, 'chantier'));
  if (!data || !Array.isArray(data.blocks) || !Number.isFinite(data.w)) return null;
  const blocks = data.blocks
    .filter((b) => b && Array.isArray(b.cells) && entier(b.x) && entier(b.y))
    .map((b) => ({
      x: b.x,
      y: b.y,
      a: entier(b.a) ? b.a : 0,
      cells: b.cells
        .filter((c) => c && entier(c.x) && entier(c.y))
        .map((c) => ({
          x: Math.round(c.x),
          y: Math.round(c.y),
          m: entier(c.m) ? Math.round(c.m) : 0,
          g: entier(c.g) ? Math.round(c.g) : 0,
        })),
    }))
    .filter((b) => b.cells.length > 0);
  const c = data.cam;
  const cam =
    c && entier(c.x) && entier(c.y) && entier(c.k) && c.k > 0
      ? { x: c.x, y: c.y, k: c.k }
      : undefined;
  // Un chantier vide garde quand même son cadrage : on revient où on était.
  return blocks.length || cam ? { w: data.w, blocks, cam } : null;
}

export function saveBuild(spaceId: string, build: SavedBuild) {
  write(sceneKey(spaceId, 'chantier'), build);
}

export function dropScene(spaceId: string) {
  drop(sceneKey(spaceId, 'nombres'));
  drop(sceneKey(spaceId, 'chantier'));
  drop(LOOK_PREFIX + spaceId);
  drop(PROGRESS_PREFIX + spaceId);
  if (spaceId === DEFAULT_SPACE_ID) drop(LEGACY_SCENE_KEY);
}

// --- garde-robe -----------------------------------------------------------

/** Ce que cet espace a changé à la tenue de ses blocs. */
export function loadWardrobe(spaceId: string): Wardrobe {
  return cleanWardrobe(read<unknown>(LOOK_PREFIX + spaceId));
}

export function saveWardrobe(spaceId: string, wardrobe: Wardrobe) {
  write(LOOK_PREFIX + spaceId, wardrobe);
}

// --- progression ----------------------------------------------------------

export interface Progress {
  /** Identifiants des missions réussies. */
  faites: string[];
  /** Pièces gagnées, sous la forme « emplacement:pièce ». */
  pieces: string[];
  /** Missions mises de côté : elles repassent en fin de file. */
  passees: string[];
  /** Le mode dans lequel cet espace a été quitté. */
  mode: Mode;
  /**
   * Mission choisie à la main sur la carte du parcours. Absente, c'est la
   * suite du parcours qui est jouée : refaire une mission est un détour, pas
   * un état durable.
   */
  choisie?: string;
}

const AUCUNE_PROGRESSION: Progress = { faites: [], pieces: [], passees: [], mode: 'libre' };

const MODES: Mode[] = ['libre', 'missions', 'construction'];

/**
 * `actif` est le réglage d'avant les trois modes : un booléen qui ne disait
 * que « en mission ou non ». On le relit une dernière fois — quelqu'un qui a
 * quitté en mission y revient — puis on ne le réécrit plus jamais.
 */
function readMode(data: Partial<Progress> & { actif?: boolean }): Mode {
  if (MODES.includes(data.mode as Mode)) return data.mode as Mode;
  return data.actif === true ? 'missions' : 'libre';
}

const listeDeTextes = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

export function loadProgress(spaceId: string): Progress {
  const data = read<Partial<Progress> & { actif?: boolean }>(PROGRESS_PREFIX + spaceId);
  if (!data) return AUCUNE_PROGRESSION;
  return {
    faites: listeDeTextes(data.faites),
    pieces: listeDeTextes(data.pieces),
    passees: listeDeTextes(data.passees),
    mode: readMode(data),
    choisie: typeof data.choisie === 'string' ? data.choisie : undefined,
  };
}

export function saveProgress(spaceId: string, progress: Progress) {
  write(PROGRESS_PREFIX + spaceId, progress);
}

// --- préférences ----------------------------------------------------------

export function loadPrefs(): Prefs {
  // Deux réglages d'avant, qu'on relit pour ne pas les traîner : `muted`, qui
  // coupait tout le son d'un bloc — le rallumer dans le dos de quelqu'un qui
  // avait demandé le silence serait malvenu — et `relief`, du temps où les
  // blocs pouvaient revenir au trait. Il n'y a plus qu'un dessin, le volume.
  const { muted, relief, ...garde } = read<Partial<Prefs> & { muted?: boolean; relief?: boolean }>(PREFS_KEY) ?? {};
  void relief;
  const prefs = { ...DEFAULT_PREFS, ...garde };
  return muted ? { ...prefs, voix: false, bruitages: false } : prefs;
}

export function savePrefs(prefs: Prefs) {
  write(PREFS_KEY, prefs);
}
