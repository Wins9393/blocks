import { useEffect, useState } from 'react';
import { colorFor } from '../core/palette';
import type { GameState } from '../game/game';
import type { Space } from '../game/persist';

interface Props {
  space: Space;
  state: GameState;
  voix: boolean;
  bruitages: boolean;
  onOpenSpaces: () => void;
  missionsOn: boolean;
  onToggleMissions: () => void;
  onWorkshop: () => void;
  onUndo: () => void;
  onClear: () => void;
  onToggleVoix: () => void;
  onToggleBruitages: () => void;
  onHelp: () => void;
}

/**
 * Les commandes d'adulte en haut, les blocs en bas : les petites mains ne
 * croisent jamais le bouton « tout effacer ».
 */
export default function TopBar({
  space,
  state,
  voix,
  bruitages,
  onOpenSpaces,
  missionsOn,
  onToggleMissions,
  onWorkshop,
  onUndo,
  onClear,
  onToggleVoix,
  onToggleBruitages,
  onHelp,
}: Props) {
  const [armed, setArmed] = useState(false);
  const [sonOuvert, setSonOuvert] = useState(false);

  // Le bouton « tout effacer » demande deux appuis : un enfant ne vide pas
  // sa construction par accident.
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 2600);
    return () => clearTimeout(id);
  }, [armed]);

  return (
    <div className="topbar">
      <button className="space-btn" onClick={onOpenSpaces} title="Changer d'espace">
        <span className="space-dot" style={{ background: colorFor(space.tint) }}>
          {space.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="space-name">{space.name}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true" className="chevron">
          <polyline points="8 10 12 14 16 10" />
        </svg>
      </button>

      <div className="topbar-tools">
        <button
          className={`icon-btn small ${missionsOn ? 'allume' : ''}`}
          onClick={onToggleMissions}
          aria-pressed={missionsOn}
          aria-label={missionsOn ? 'Revenir au jeu libre' : 'Passer en missions'}
          title={missionsOn ? 'Jeu libre' : 'Missions'}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 21V4h11l-1.6 3.4L17 11H6" />
          </svg>
        </button>

        <button
          className="icon-btn small"
          onClick={onWorkshop}
          aria-label="Atelier : habiller les blocs"
          title="Atelier"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 20c0-2 1.4-3.2 3-3.2S10 18 10 20c0 .8-1 1.4-3 1.4S4 20.8 4 20z" />
            <path d="M8.6 16.2 18.4 5.1a2 2 0 0 1 3 2.6L11 18" />
          </svg>
        </button>

        <button
          className="icon-btn small"
          onClick={onUndo}
          disabled={!state.canUndo}
          aria-label="Annuler"
          title="Annuler"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 7H15a5 5 0 0 1 0 10H8" />
            <polyline points="12 4 8.5 7 12 10" />
          </svg>
        </button>

        <button
          className={`icon-btn small ${armed ? 'armed' : ''}`}
          onClick={() => (armed ? (onClear(), setArmed(false)) : setArmed(true))}
          disabled={state.blocks === 0}
          aria-label={armed ? 'Confirmer : tout effacer' : 'Tout effacer'}
          title={armed ? 'Confirmer' : 'Tout effacer'}
        >
          {armed ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <polyline points="5 13 10 18 19 6" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 7h14" />
              <path d="M8 7V5h8v2" />
              <path d="M7 7l1 12h8l1-12" />
            </svg>
          )}
        </button>

        {/* Un seul interrupteur ne disait pas quoi couper : la voix qui répète
            les nombres fatigue bien avant les notes, et l'inverse arrive tout
            autant. Le bouton ouvre donc les deux robinets, et son dessin dit
            d'un coup d'œil ce qui reste allumé. */}
        <div className="son-outil">
          <button
            className={`icon-btn small ${sonOuvert ? 'allume' : ''}`}
            onClick={() => setSonOuvert((o) => !o)}
            aria-expanded={sonOuvert}
            aria-label="Réglages du son"
            title="Son"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 9h3l4-4v14l-4-4H5z" />
              {voix || bruitages ? (
                <path d="M16 9a4 4 0 0 1 0 6" />
              ) : (
                <path d="M16 9l5 6M21 9l-5 6" />
              )}
              {/* Une seule des deux coupée : la pastille prévient qu'il manque
                  quelque chose, le menu dit quoi. */}
              {voix !== bruitages && <circle cx="19.5" cy="6" r="2.2" className="son-pastille" />}
            </svg>
          </button>

          {sonOuvert && (
            <>
              <div className="son-fond" onPointerDown={() => setSonOuvert(false)} />
              <div className="son-menu" role="group" aria-label="Son">
                <button
                  className={`son-ligne ${voix ? 'on' : ''}`}
                  onClick={onToggleVoix}
                  aria-pressed={voix}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 7.5A2.5 2.5 0 0 1 7.5 5h9A2.5 2.5 0 0 1 19 7.5v5a2.5 2.5 0 0 1-2.5 2.5H11l-4 3.2V15h-.5A2.5 2.5 0 0 1 4 12.5z" />
                    <path d="M8.5 10h7" />
                  </svg>
                  <span>Voix</span>
                  <span className="son-bascule" aria-hidden="true" />
                </button>
                <button
                  className={`son-ligne ${bruitages ? 'on' : ''}`}
                  onClick={onToggleBruitages}
                  aria-pressed={bruitages}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 17V5.6l10-1.8v11" />
                    <circle cx="6.6" cy="17.2" r="2.6" />
                    <circle cx="16.6" cy="15.4" r="2.6" />
                  </svg>
                  <span>Bruitages</span>
                  <span className="son-bascule" aria-hidden="true" />
                </button>
              </div>
            </>
          )}
        </div>

        <button
          className="icon-btn small"
          onClick={onHelp}
          aria-label="Comment jouer"
          title="Comment jouer"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9.2 9.3a2.9 2.9 0 1 1 3.9 2.7c-.7.3-1.1.9-1.1 1.7v.5" />
            <path d="M12 17.6v.01" />
          </svg>
        </button>
      </div>
    </div>
  );
}
