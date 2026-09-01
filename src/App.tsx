import { useCallback, useEffect, useRef, useState } from 'react';
import { Game } from './game/game';
import type { GameState } from './game/game';
import { setMuted } from './audio/sfx';
import {
  cleanName,
  dropScene,
  loadPrefs,
  loadSpaces,
  loadWardrobe,
  makeSpace,
  savePrefs,
  saveSpaces,
  saveWardrobe,
} from './game/persist';
import type { Space, SpaceBook } from './game/persist';
import { defaultLook } from './core/wardrobe';
import type { SlotKey, Wardrobe } from './core/wardrobe';
import Hints from './ui/Hints';
import NameDialog from './ui/NameDialog';
import Palette from './ui/Palette';
import SpaceMenu from './ui/SpaceMenu';
import TopBar from './ui/TopBar';
import Workshop from './ui/Workshop';

type Dialog = { kind: 'new' } | { kind: 'rename'; space: Space } | null;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [state, setState] = useState<GameState>({
    blocks: 0,
    units: 0,
    canUndo: false,
    full: false,
  });
  const [prefs, setPrefs] = useState(loadPrefs);
  const [book, setBook] = useState<SpaceBook>(loadSpaces);
  const [wardrobe, setWardrobe] = useState<Wardrobe>(() => loadWardrobe(book.currentId));
  const [menuOpen, setMenuOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [hintsOpen, setHintsOpen] = useState(() => !prefs.hintsSeen);

  // Le jeu naît une fois pour toutes : il lit ici l'espace en cours, et c'est
  // ensuite `useSpace` qui le fait changer de rayon.
  const firstSpace = useRef(book.currentId);
  const firstWardrobe = useRef(wardrobe);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new Game(canvas, firstSpace.current);
    gameRef.current = game;
    if (import.meta.env.DEV) (window as unknown as { __game?: Game }).__game = game;
    game.mount();
    game.setWardrobe(firstWardrobe.current);
    const unsubscribe = game.subscribe(setState);
    return () => {
      unsubscribe();
      game.unmount();
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    setMuted(prefs.muted);
    savePrefs(prefs);
  }, [prefs]);

  const closeHints = useCallback(() => {
    setHintsOpen(false);
    setPrefs((p) => (p.hintsSeen ? p : { ...p, hintsSeen: true }));
  }, []);

  const commit = useCallback((next: SpaceBook) => {
    saveSpaces(next);
    setBook(next);
  }, []);

  const current = book.spaces.find((s) => s.id === book.currentId) ?? book.spaces[0];

  /** Un espace, c'est une scène ET une garde-robe : les deux suivent. */
  const enterSpace = (id: string) => {
    const tenue = loadWardrobe(id);
    setWardrobe(tenue);
    gameRef.current?.useSpace(id);
    gameRef.current?.setWardrobe(tenue);
  };

  const pickSpace = (id: string) => {
    enterSpace(id);
    commit({ ...book, currentId: id });
    setMenuOpen(false);
  };

  const dressBlock = (value: number, slot: SlotKey, option: string) => {
    const patch: Record<string, string> = { ...(wardrobe[value] ?? {}) };
    // Reprendre la pièce d'origine, c'est l'oublier : la garde-robe ne garde
    // que les écarts, et « remettre comme au début » redevient exact.
    if (option === defaultLook(value)[slot]) delete patch[slot];
    else patch[slot] = option;

    const next: Wardrobe = { ...wardrobe };
    if (Object.keys(patch).length) next[value] = patch as Wardrobe[number];
    else delete next[value];

    setWardrobe(next);
    saveWardrobe(book.currentId, next);
    gameRef.current?.setWardrobe(next);
  };

  const resetBlock = (value: number) => {
    const next = { ...wardrobe };
    delete next[value];
    setWardrobe(next);
    saveWardrobe(book.currentId, next);
    gameRef.current?.setWardrobe(next);
  };

  const createSpace = (name: string) => {
    const space = makeSpace(name, (book.spaces.length % 10) + 1);
    enterSpace(space.id);
    commit({ spaces: [...book.spaces, space], currentId: space.id });
    setDialog(null);
    setMenuOpen(false);
  };

  const renameSpace = (id: string, name: string) => {
    commit({
      ...book,
      // L'identifiant ne bouge pas : c'est lui qui relie l'espace à sa scène.
      spaces: book.spaces.map((s) => (s.id === id ? { ...s, name: cleanName(name) } : s)),
    });
    setDialog(null);
  };

  const deleteSpace = (id: string) => {
    if (book.spaces.length < 2) return;
    const spaces = book.spaces.filter((s) => s.id !== id);
    const currentId = id === book.currentId ? spaces[0].id : book.currentId;
    // On quitte l'espace AVANT d'effacer sa scène : partir en dernier la
    // réécrirait aussitôt, et l'espace supprimé ressusciterait au rechargement.
    if (currentId !== book.currentId) enterSpace(currentId);
    dropScene(id);
    commit({ spaces, currentId });
  };

  return (
    <div className="app">
      <canvas ref={canvasRef} className="stage" />

      <TopBar
        space={current}
        state={state}
        muted={prefs.muted}
        onOpenSpaces={() => setMenuOpen(true)}
        onWorkshop={() => setShopOpen(true)}
        onUndo={() => gameRef.current?.undo()}
        onClear={() => gameRef.current?.clearAll()}
        onToggleMute={() => setPrefs((p) => ({ ...p, muted: !p.muted }))}
        onHelp={() => {
          setMenuOpen(false);
          setShopOpen(false);
          setHintsOpen(true);
        }}
      />

      <Palette state={state} wardrobe={wardrobe} onPick={(v) => gameRef.current?.spawn(v)} />

      {hintsOpen && <Hints wardrobe={wardrobe} onClose={closeHints} />}

      {/* La liste s'efface pendant la saisie : deux voiles empilés
          assombrissaient la scène au point de la faire disparaître. */}
      {shopOpen && (
        <Workshop
          wardrobe={wardrobe}
          onChange={dressBlock}
          onReset={resetBlock}
          onClose={() => setShopOpen(false)}
        />
      )}

      {menuOpen && !dialog && (
        <SpaceMenu
          spaces={book.spaces}
          currentId={book.currentId}
          onPick={pickSpace}
          onNew={() => setDialog({ kind: 'new' })}
          onRename={(space) => setDialog({ kind: 'rename', space })}
          onDelete={deleteSpace}
          onClose={() => setMenuOpen(false)}
        />
      )}

      {dialog?.kind === 'new' && (
        <NameDialog
          title="Nouvel espace"
          cta="Créer"
          onCancel={() => setDialog(null)}
          onConfirm={createSpace}
        />
      )}

      {dialog?.kind === 'rename' && (
        <NameDialog
          title="Renommer"
          cta="Enregistrer"
          initial={dialog.space.name}
          onCancel={() => setDialog(null)}
          onConfirm={(name) => renameSpace(dialog.space.id, name)}
        />
      )}
    </div>
  );
}
