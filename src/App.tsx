import { useCallback, useEffect, useRef, useState } from 'react';
import { Game } from './game/game';
import type { GameState } from './game/game';
import { setMuted } from './audio/sfx';
import {
  cleanName,
  dropScene,
  loadPrefs,
  loadSpaces,
  makeSpace,
  savePrefs,
  saveSpaces,
} from './game/persist';
import type { Space, SpaceBook } from './game/persist';
import Hints from './ui/Hints';
import NameDialog from './ui/NameDialog';
import Palette from './ui/Palette';
import SpaceMenu from './ui/SpaceMenu';
import TopBar from './ui/TopBar';

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [hintsOpen, setHintsOpen] = useState(() => !prefs.hintsSeen);

  // Le jeu naît une fois pour toutes : il lit ici l'espace en cours, et c'est
  // ensuite `useSpace` qui le fait changer de rayon.
  const firstSpace = useRef(book.currentId);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new Game(canvas, firstSpace.current);
    gameRef.current = game;
    if (import.meta.env.DEV) (window as unknown as { __game?: Game }).__game = game;
    game.mount();
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

  const pickSpace = (id: string) => {
    gameRef.current?.useSpace(id);
    commit({ ...book, currentId: id });
    setMenuOpen(false);
  };

  const createSpace = (name: string) => {
    const space = makeSpace(name, (book.spaces.length % 10) + 1);
    gameRef.current?.useSpace(space.id);
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
    if (currentId !== book.currentId) gameRef.current?.useSpace(currentId);
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
        onUndo={() => gameRef.current?.undo()}
        onClear={() => gameRef.current?.clearAll()}
        onToggleMute={() => setPrefs((p) => ({ ...p, muted: !p.muted }))}
        onHelp={() => {
          setMenuOpen(false);
          setHintsOpen(true);
        }}
      />

      <Palette state={state} onPick={(v) => gameRef.current?.spawn(v)} />

      {hintsOpen && <Hints onClose={closeHints} />}

      {/* La liste s'efface pendant la saisie : deux voiles empilés
          assombrissaient la scène au point de la faire disparaître. */}
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
