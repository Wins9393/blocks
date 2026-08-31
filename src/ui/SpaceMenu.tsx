import { useEffect, useState } from 'react';
import { colorFor } from '../core/palette';
import type { Space } from '../game/persist';

interface Props {
  spaces: Space[];
  currentId: string;
  onPick: (id: string) => void;
  onNew: () => void;
  onRename: (space: Space) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function SpaceMenu({
  spaces,
  currentId,
  onPick,
  onNew,
  onRename,
  onDelete,
  onClose,
}: Props) {
  // Supprimer un espace efface la construction d'un enfant : deux appuis.
  const [armed, setArmed] = useState<string | null>(null);

  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(null), 3000);
    return () => clearTimeout(id);
  }, [armed]);

  return (
    <div className="sheet" onPointerDown={onClose}>
      <div className="sheet-card" onPointerDown={(e) => e.stopPropagation()}>
        <h2 className="sheet-title">Les espaces</h2>

        <ul className="space-list">
          {spaces.map((s) => (
            <li key={s.id} className={s.id === currentId ? 'space-item current' : 'space-item'}>
              <button className="space-pick" onClick={() => onPick(s.id)}>
                <span className="space-dot" style={{ background: colorFor(s.tint) }}>
                  {s.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="space-name">{s.name}</span>
              </button>

              <button
                className="icon-btn tiny"
                onClick={() => onRename(s)}
                aria-label={`Renommer ${s.name}`}
                title="Renommer"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 20h4l10-10-4-4L4 16z" />
                  <path d="M14 6l4 4" />
                </svg>
              </button>

              <button
                className={`icon-btn tiny ${armed === s.id ? 'armed' : ''}`}
                onClick={() => (armed === s.id ? (onDelete(s.id), setArmed(null)) : setArmed(s.id))}
                disabled={spaces.length < 2}
                aria-label={armed === s.id ? `Confirmer la suppression de ${s.name}` : `Supprimer ${s.name}`}
                title={armed === s.id ? 'Confirmer' : 'Supprimer'}
              >
                {armed === s.id ? (
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
            </li>
          ))}
        </ul>

        <button className="btn-main wide" onClick={onNew}>
          + Nouvel espace
        </button>
        <button className="btn-ghost wide" onClick={onClose}>
          Fermer
        </button>
      </div>
    </div>
  );
}
