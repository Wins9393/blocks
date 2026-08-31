import { useEffect, useState } from 'react';
import { colorFor } from '../core/palette';
import type { GameState } from '../game/game';
import type { Space } from '../game/persist';

interface Props {
  space: Space;
  state: GameState;
  muted: boolean;
  onOpenSpaces: () => void;
  onWorkshop: () => void;
  onUndo: () => void;
  onClear: () => void;
  onToggleMute: () => void;
  onHelp: () => void;
}

/**
 * Les commandes d'adulte en haut, les blocs en bas : les petites mains ne
 * croisent jamais le bouton « tout effacer ».
 */
export default function TopBar({
  space,
  state,
  muted,
  onOpenSpaces,
  onWorkshop,
  onUndo,
  onClear,
  onToggleMute,
  onHelp,
}: Props) {
  const [armed, setArmed] = useState(false);

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

        <button
          className="icon-btn small"
          onClick={onToggleMute}
          aria-label={muted ? 'Activer le son' : 'Couper le son'}
          title={muted ? 'Activer le son' : 'Couper le son'}
        >
          {muted ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 9h3l4-4v14l-4-4H5z" />
              <path d="M16 9l5 6M21 9l-5 6" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 9h3l4-4v14l-4-4H5z" />
              <path d="M16 9a4 4 0 0 1 0 6" />
            </svg>
          )}
        </button>

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
