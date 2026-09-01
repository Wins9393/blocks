import { cleanWardrobe } from '../core/wardrobe';
import type { Wardrobe } from '../core/wardrobe';

const PREFS_KEY = 'blocks.prefs.v1';
const SPACES_KEY = 'blocks.spaces.v1';
const SCENE_PREFIX = 'blocks.scene.v2:';
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
  /** Blocs et objets en volume plutôt qu'au trait. */
  relief: boolean;
}

const DEFAULT_PREFS: Prefs = { voix: true, bruitages: true, hintsSeen: false, relief: false };

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

function sceneKey(id: string): string {
  return SCENE_PREFIX + id;
}

export function loadScene(spaceId: string): SavedScene | null {
  // Le tout premier espace hérite de la scène d'avant : on ne fait pas
  // disparaître la construction en cours en livrant les espaces.
  const data =
    read<SavedScene>(sceneKey(spaceId)) ??
    (spaceId === DEFAULT_SPACE_ID ? read<SavedScene>(LEGACY_SCENE_KEY) : null);
  if (!data || !Array.isArray(data.blocks) || !Number.isFinite(data.w)) return null;
  const blocks = data.blocks.filter(
    (b) => typeof b?.v === 'number' && Number.isFinite(b.x) && Number.isFinite(b.y),
  );
  return blocks.length ? { w: data.w, blocks } : null;
}

export function saveScene(spaceId: string, scene: SavedScene) {
  write(sceneKey(spaceId), scene);
}

export function dropScene(spaceId: string) {
  drop(sceneKey(spaceId));
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
  /** Le mode mission est allumé pour cet espace. */
  actif: boolean;
  /**
   * Mission choisie à la main sur la carte du parcours. Absente, c'est la
   * suite du parcours qui est jouée : refaire une mission est un détour, pas
   * un état durable.
   */
  choisie?: string;
}

const AUCUNE_PROGRESSION: Progress = { faites: [], pieces: [], passees: [], actif: false };

const listeDeTextes = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

export function loadProgress(spaceId: string): Progress {
  const data = read<Partial<Progress>>(PROGRESS_PREFIX + spaceId);
  if (!data) return AUCUNE_PROGRESSION;
  return {
    faites: listeDeTextes(data.faites),
    pieces: listeDeTextes(data.pieces),
    passees: listeDeTextes(data.passees),
    actif: data.actif === true,
    choisie: typeof data.choisie === 'string' ? data.choisie : undefined,
  };
}

export function saveProgress(spaceId: string, progress: Progress) {
  write(PROGRESS_PREFIX + spaceId, progress);
}

// --- préférences ----------------------------------------------------------

export function loadPrefs(): Prefs {
  // `muted` est l'interrupteur d'avant la séparation du son : il coupait tout.
  // On le relit une dernière fois plutôt que de rallumer la voix dans le dos
  // de quelqu'un qui avait justement demandé le silence.
  const { muted, ...garde } = read<Partial<Prefs> & { muted?: boolean }>(PREFS_KEY) ?? {};
  const prefs = { ...DEFAULT_PREFS, ...garde };
  return muted ? { ...prefs, voix: false, bruitages: false } : prefs;
}

export function savePrefs(prefs: Prefs) {
  write(PREFS_KEY, prefs);
}
