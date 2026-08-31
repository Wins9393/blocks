import { useEffect, useState } from 'react';
import type { GameState } from '../game/game';

interface Props {
  state: GameState;
  muted: boolean;
  onAdd: () => void;
  onUndo: () => void;
  onClear: () => void;
  onToggleMute: () => void;
}

export default function Toolbar({ state, muted, onAdd, onUndo, onClear, onToggleMute }: Props) {
  const [armed, setArmed] = useState(false);

  // Le bouton « tout effacer » demande deux appuis : un enfant ne vide pas
  // sa construction par accident.
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 2600);
    return () => clearTimeout(id);
  }, [armed]);

  return (
    <div className="toolbar">
      <button
        className="icon-btn"
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

      <button className="add-btn" onClick={onAdd} disabled={state.full} aria-label="Ajouter un cube">
        <span className="add-sign">+1</span>
      </button>

      <button
        className={`icon-btn ${armed ? 'armed' : ''}`}
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

      {state.full && <div className="warning">C&apos;est plein !</div>}
    </div>
  );
}
