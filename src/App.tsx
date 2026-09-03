import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MAX_UNITS } from './core/constants';
import { Game } from './game/game';
import type { GameState } from './game/game';
import { playWin, say, setSound } from './audio/sfx';
import { MISSIONS, missionById, nextMission, paletteFor } from './core/missions';
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
  sceneKindFor,
} from './game/persist';
import type { Mode, Progress, Space, SpaceBook } from './game/persist';
import { defaultLook, pieceFor, pieceKey } from './core/wardrobe';
import type { SlotKey, Wardrobe } from './core/wardrobe';
import Hints from './ui/Hints';
import MissionBar from './ui/MissionBar';
import MissionMap from './ui/MissionMap';
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
    plafond: MAX_UNITS,
    values: [],
  });
  const [prefs, setPrefs] = useState(loadPrefs);
  const [book, setBook] = useState<SpaceBook>(loadSpaces);
  const [wardrobe, setWardrobe] = useState<Wardrobe>(() => loadWardrobe(book.currentId));
  const [progress, setProgress] = useState<Progress>(() => loadProgress(book.currentId));
  const [prix, setPrix] = useState<Prix | null>(null);
  /** Mission réussie, le temps de la fêter dans la scène avant le panneau. */
  const [fete, setFete] = useState<{ mission: Mission; prix: Prix | null } | null>(null);
  const [carteOpen, setCarteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [hintsOpen, setHintsOpen] = useState(() => !prefs.hintsSeen);

  // Le jeu naît une fois pour toutes : il lit ici l'espace en cours, et c'est
  // ensuite `useSpace` qui le fait changer de rayon.
  const firstSpace = useRef(book.currentId);
  const firstWardrobe = useRef(wardrobe);
  const firstKind = useRef(sceneKindFor(progress.mode));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new Game(canvas, firstSpace.current, firstKind.current);
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
    setSound({ voix: prefs.voix, bruitages: prefs.bruitages });
    savePrefs(prefs);
  }, [prefs]);

  const closeHints = useCallback(() => {
    setHintsOpen(false);
    setPrefs((p) => (p.hintsSeen ? p : { ...p, hintsSeen: true }));
  }, []);

  const mode = progress.mode;
  const gagnees = useMemo(() => new Set(progress.pieces), [progress.pieces]);
  const faites = useMemo(() => new Set(progress.faites), [progress.faites]);
  // Une mission choisie sur la carte passe devant le parcours. Un identifiant
  // devenu inconnu — une mission retirée depuis — ne bloque pas : on reprend
  // simplement la suite.
  const mission =
    mode !== 'missions'
      ? undefined
      : (progress.choisie ? missionById(progress.choisie) : undefined) ??
        nextMission(faites, new Set(progress.passees));

  const avance = useCallback((id: string, next: Progress) => {
    saveProgress(id, next);
    setProgress(next);
  }, []);

  // Ce qu'on montre : la mission réussie tant qu'on la fête, la suivante après.
  const affichee = fete?.mission ?? mission;

  /** Signature de la scène qui a déjà payé : elle ne paie jamais deux fois. */
  const dernierSucces = useRef('');

  /**
   * Chaque mission commence sur une table vide. Les blocs de la mission
   * précédente validaient souvent la suivante tout seuls : « fabrique un bloc
   * de 3 » était déjà gagné parce qu'un 3 traînait, et l'enfant recevait une
   * récompense sans rien faire.
   */
  const rangeLaTable = useCallback(() => {
    gameRef.current?.tidy();
    dernierSucces.current = '';
  }, []);

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
      if (fete.prix) setPrix(fete.prix);
      // Sans panneau à fermer, c'est la fin de la fête qui range la table.
      else rangeLaTable();
      setFete(null);
    }, 1600);
    return () => clearTimeout(id);
  }, [fete, rangeLaTable]);

  // Le jeu ignore tout des missions : il publie l'état de la scène, et c'est
  // ici qu'on statue. Une mission est un prédicat, pas un script.
  useEffect(() => {
    if (!mission || prix || fete) return;
    const signature = [...state.values].sort((a, b) => a - b).join(',');
    // Deuxième garde-fou, derrière le rangement de la table : une même scène
    // ne paie jamais deux fois.
    if (signature === dernierSucces.current) return;
    if (!mission.check({ values: state.values })) return;

    dernierSucces.current = signature;
    const dejaFaite = progress.faites.includes(mission.id);
    const cle = pieceKey(mission.prix.slot, mission.prix.piece);
    // La progression est enregistrée tout de suite : quitter pendant la fête
    // ne doit pas coûter la récompense. Et on rend la main au parcours : refaire
    // une mission est un détour, pas un état durable.
    avance(book.currentId, {
      ...progress,
      faites: dejaFaite ? progress.faites : [...progress.faites, mission.id],
      pieces: progress.pieces.includes(cle) ? progress.pieces : [...progress.pieces, cle],
      passees: progress.passees.filter((id) => id !== mission.id),
      choisie: undefined,
    });
    // Refaire une mission se fête pareil dans la scène, mais la pièce est déjà
    // dans l'atelier : un panneau qui la « donne » une seconde fois ment.
    setFete({ mission, prix: dejaFaite ? null : mission.prix });
    gameRef.current?.celebrate(mission.cible);
    playWin();
  }, [state.values, mission, prix, fete, progress, book.currentId, avance]);

  /**
   * Les trois modes s'excluent : changer de mode range la scène en cours sur
   * son rayon et sort l'autre. Les nombres et le chantier ne se voient jamais.
   */
  const changeMode = (next: Mode) => {
    if (next === mode) return;
    avance(book.currentId, { ...progress, mode: next });
    setShopOpen(false);
    setCarteOpen(false);
    setPrix(null);
    setFete(null);
    dernierSucces.current = '';
    dernierDit.current = '';
    gameRef.current?.useSpace(book.currentId, sceneKindFor(next));
    // Entrer en mission, c'est commencer la première : la table se range. Après
    // le changement de scène, jamais avant — sinon c'est le chantier qu'on
    // rangerait.
    if (next === 'missions') rangeLaTable();
  };

  /**
   * Jouer une mission précise, réussie ou non. Elle passe devant le parcours
   * jusqu'à ce qu'elle soit faite, et la table se range comme entre deux
   * missions — sinon la scène en cours la validerait peut-être déjà.
   */
  const choisirMission = (id: string) => {
    avance(book.currentId, {
      ...progress,
      choisie: id,
      // La choisir, c'est la reprendre : elle n'est plus mise de côté.
      passees: progress.passees.filter((x) => x !== id),
    });
    dernierDit.current = '';
    rangeLaTable();
    setCarteOpen(false);
  };

  const commit = useCallback((next: SpaceBook) => {
    saveSpaces(next);
    setBook(next);
  }, []);

  const current = book.spaces.find((s) => s.id === book.currentId) ?? book.spaces[0];

  /** Un espace, c'est une scène ET une garde-robe : les deux suivent. */
  const enterSpace = (id: string) => {
    const tenue = loadWardrobe(id);
    // Le mode fait partie du rayon : un espace quitté sur son chantier le
    // retrouve, et c'est cette scène-là qu'il faut sortir.
    const avancement = loadProgress(id);
    setWardrobe(tenue);
    setProgress(avancement);
    setPrix(null);
    setFete(null);
    setCarteOpen(false);
    dernierSucces.current = '';
    dernierDit.current = '';
    gameRef.current?.useSpace(id, sceneKindFor(avancement.mode));
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
        voix={prefs.voix}
        bruitages={prefs.bruitages}
        onOpenSpaces={() => setMenuOpen(true)}
        mode={mode}
        onMode={changeMode}
        onWorkshop={() => setShopOpen(true)}
        onUndo={() => gameRef.current?.undo()}
        onClear={() => gameRef.current?.clearAll()}
        onToggleVoix={() => setPrefs((p) => ({ ...p, voix: !p.voix }))}
        onToggleBruitages={() => setPrefs((p) => ({ ...p, bruitages: !p.bruitages }))}
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
          onMap={() => setCarteOpen(true)}
          onSkip={() => {
            avance(book.currentId, {
              ...progress,
              passees: [...progress.passees, affichee.id],
              choisie: undefined,
            });
            rangeLaTable();
          }}
        />
      )}

      {mode === 'missions' && !affichee && (
        <div className="mission-bar">
          <div className="mission-mots">
            <span className="mission-enonce">Toutes les missions sont faites !</span>
            <button
              className="mission-compte"
              onClick={() => setCarteOpen(true)}
              aria-label="Voir toutes les missions"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="6" cy="7" r="1.6" />
                <circle cx="6" cy="17" r="1.6" />
                <path d="M11 7h8M11 17h8" />
              </svg>
              En refaire une
            </button>
          </div>
        </div>
      )}

      <Palette
        state={state}
        wardrobe={wardrobe}
        allowed={affichee && paletteFor(affichee)}
        matieres={mode === 'construction'}
        onPick={(v) =>
          mode === 'construction' ? gameRef.current?.poseCube(v) : gameRef.current?.spawn(v)
        }
      />

      {hintsOpen && <Hints wardrobe={wardrobe} onClose={closeHints} />}

      {/* La liste s'efface pendant la saisie : deux voiles empilés
          assombrissaient la scène au point de la faire disparaître. */}
      {prix && pieceFor(prix.slot, prix.piece) && (
        <RewardCard
          slot={prix.slot}
          piece={pieceFor(prix.slot, prix.piece)!}
          wardrobe={wardrobe}
          onClose={() => {
            setPrix(null);
            rangeLaTable();
          }}
        />
      )}

      {carteOpen && (
        <MissionMap
          faites={faites}
          courante={affichee?.id}
          wardrobe={wardrobe}
          onPick={choisirMission}
          onClose={() => setCarteOpen(false)}
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
