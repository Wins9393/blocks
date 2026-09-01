import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Game } from './game/game';
import type { GameState } from './game/game';
import { playWin, say, setMuted } from './audio/sfx';
import { MISSIONS, nextMission } from './core/missions';
import type { Mission, Prix } from './core/missions';
import {
  cleanName,
  dropScene,
  loadPrefs,
  loadSpaces,
  loadWardrobe,
  loadProgress,
  makeSpace,
  savePrefs,
  saveProgress,
  saveSpaces,
  saveWardrobe,
} from './game/persist';
import type { Progress, Space, SpaceBook } from './game/persist';
import { defaultLook, pieceFor, pieceKey } from './core/wardrobe';
import type { SlotKey, Wardrobe } from './core/wardrobe';
import Hints from './ui/Hints';
import MissionBar from './ui/MissionBar';
import NameDialog from './ui/NameDialog';
import Palette from './ui/Palette';
import RewardCard from './ui/RewardCard';
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
    values: [],
  });
  const [prefs, setPrefs] = useState(loadPrefs);
  const [book, setBook] = useState<SpaceBook>(loadSpaces);
  const [wardrobe, setWardrobe] = useState<Wardrobe>(() => loadWardrobe(book.currentId));
  const [progress, setProgress] = useState<Progress>(() => loadProgress(book.currentId));
  const [prix, setPrix] = useState<Prix | null>(null);
  /** Mission réussie, le temps de la fêter dans la scène avant le panneau. */
  const [fete, setFete] = useState<{ mission: Mission; prix: Prix } | null>(null);
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

  const gagnees = useMemo(() => new Set(progress.pieces), [progress.pieces]);
  const mission = progress.actif
    ? nextMission(new Set(progress.faites), new Set(progress.passees))
    : undefined;

  const avance = useCallback((id: string, next: Progress) => {
    saveProgress(id, next);
    setProgress(next);
  }, []);

  // Ce qu'on montre : la mission réussie tant qu'on la fête, la suivante après.
  const affichee = fete?.mission ?? mission;

  // L'énoncé est dit dès qu'il change : c'est ce qui rend le mode utilisable
  // par un enfant qui ne lit pas encore. Pas pendant la fête, la fanfare parle
  // déjà.
  const dernierDit = useRef('');
  useEffect(() => {
    if (fete || prix || !mission) return;
    if (dernierDit.current === mission.id) return;
    dernierDit.current = mission.id;
    say(mission.enonce);
  }, [mission, fete, prix]);

  // Le panneau attend que la fête soit passée : ouvert aussitôt, il cachait la
  // forme au moment précis où l'enfant veut la regarder.
  useEffect(() => {
    if (!fete) return;
    const id = setTimeout(() => {
      setPrix(fete.prix);
      setFete(null);
    }, 1600);
    return () => clearTimeout(id);
  }, [fete]);

  // Le jeu ignore tout des missions : il publie l'état de la scène, et c'est
  // ici qu'on statue. Une mission est un prédicat, pas un script.
  const dernierSucces = useRef('');
  useEffect(() => {
    if (!mission || prix || fete) return;
    const signature = [...state.values].sort((a, b) => a - b).join(',');
    // Sans ce garde-fou, une scène qui satisfait déjà la mission suivante
    // enchaînerait les récompenses sans que l'enfant ait rien fait.
    if (signature === dernierSucces.current) return;
    if (!mission.check({ values: state.values })) return;

    dernierSucces.current = signature;
    const cle = pieceKey(mission.prix.slot, mission.prix.piece);
    // La progression est enregistrée tout de suite : quitter pendant la fête
    // ne doit pas coûter la récompense.
    avance(book.currentId, {
      ...progress,
      faites: [...progress.faites, mission.id],
      pieces: progress.pieces.includes(cle) ? progress.pieces : [...progress.pieces, cle],
      passees: progress.passees.filter((id) => id !== mission.id),
    });
    setFete({ mission, prix: mission.prix });
    gameRef.current?.celebrate(mission.cible);
    playWin();
  }, [state.values, mission, prix, fete, progress, book.currentId, avance]);

  const commit = useCallback((next: SpaceBook) => {
    saveSpaces(next);
    setBook(next);
  }, []);

  const current = book.spaces.find((s) => s.id === book.currentId) ?? book.spaces[0];

  /** Un espace, c'est une scène ET une garde-robe : les deux suivent. */
  const enterSpace = (id: string) => {
    const tenue = loadWardrobe(id);
    setWardrobe(tenue);
    setProgress(loadProgress(id));
    setPrix(null);
    setFete(null);
    dernierSucces.current = '';
    dernierDit.current = '';
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
        missionsOn={progress.actif}
        onToggleMissions={() => avance(book.currentId, { ...progress, actif: !progress.actif })}
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

      {affichee && (
        <MissionBar
          mission={affichee}
          wardrobe={wardrobe}
          gagne={Boolean(fete)}
          faites={progress.faites.length}
          total={MISSIONS.length}
          onSay={() => say(affichee.enonce)}
          onSkip={() =>
            avance(book.currentId, {
              ...progress,
              passees: [...progress.passees, affichee.id],
            })
          }
        />
      )}

      {progress.actif && !affichee && (
        <div className="mission-bar">
          <div className="mission-mots">
            <span className="mission-enonce">Toutes les missions sont faites !</span>
            <span className="mission-compte">
              {MISSIONS.length} / {MISSIONS.length}
            </span>
          </div>
        </div>
      )}

      <Palette
        state={state}
        wardrobe={wardrobe}
        allowed={affichee?.palette}
        onPick={(v) => gameRef.current?.spawn(v)}
      />

      {hintsOpen && <Hints wardrobe={wardrobe} onClose={closeHints} />}

      {/* La liste s'efface pendant la saisie : deux voiles empilés
          assombrissaient la scène au point de la faire disparaître. */}
      {prix && pieceFor(prix.slot, prix.piece) && (
        <RewardCard
          slot={prix.slot}
          piece={pieceFor(prix.slot, prix.piece)!}
          wardrobe={wardrobe}
          onClose={() => setPrix(null)}
        />
      )}

      {shopOpen && (
        <Workshop
          wardrobe={wardrobe}
          gagnees={gagnees}
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
