const SCENE_KEY = 'blocks.scene.v1';
const PREFS_KEY = 'blocks.prefs.v1';

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

export interface Prefs {
  muted: boolean;
  hintsSeen: boolean;
}

const DEFAULT_PREFS: Prefs = { muted: false, hintsSeen: false };

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

export function loadScene(): SavedScene | null {
  const data = read<SavedScene>(SCENE_KEY);
  if (!data || !Array.isArray(data.blocks) || !Number.isFinite(data.w)) return null;
  const blocks = data.blocks.filter(
    (b) => typeof b?.v === 'number' && Number.isFinite(b.x) && Number.isFinite(b.y),
  );
  return blocks.length ? { w: data.w, blocks } : null;
}

export function saveScene(scene: SavedScene) {
  write(SCENE_KEY, scene);
}

export function loadPrefs(): Prefs {
  return { ...DEFAULT_PREFS, ...(read<Partial<Prefs>>(PREFS_KEY) ?? {}) };
}

export function savePrefs(prefs: Prefs) {
  write(PREFS_KEY, prefs);
}
