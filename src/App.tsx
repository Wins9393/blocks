import { useCallback, useEffect, useRef, useState } from 'react';
import { Game } from './game/game';
import type { GameState } from './game/game';
import { setMuted } from './audio/sfx';
import { loadPrefs, savePrefs } from './game/persist';
import Hints from './ui/Hints';
import Toolbar from './ui/Toolbar';

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new Game(canvas);
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

  const dismissHints = useCallback(() => {
    setPrefs((p) => (p.hintsSeen ? p : { ...p, hintsSeen: true }));
  }, []);

  return (
    <div className="app">
      <canvas ref={canvasRef} className="stage" onPointerDown={dismissHints} />
      {!prefs.hintsSeen && <Hints onDismiss={dismissHints} />}
      <Toolbar
        state={state}
        muted={prefs.muted}
        onAdd={() => {
          dismissHints();
          gameRef.current?.spawnOne();
        }}
        onUndo={() => gameRef.current?.undo()}
        onClear={() => gameRef.current?.clearAll()}
        onToggleMute={() => setPrefs((p) => ({ ...p, muted: !p.muted }))}
      />
    </div>
  );
}
