import { useState } from 'react';
import { NAME_MAX } from '../game/persist';

interface Props {
  title: string;
  cta: string;
  initial?: string;
  onCancel: () => void;
  onConfirm: (name: string) => void;
}

export default function NameDialog({ title, cta, initial = '', onCancel, onConfirm }: Props) {
  const [name, setName] = useState(initial);
  const ready = name.trim().length > 0;

  return (
    <div className="sheet" onPointerDown={onCancel}>
      <form
        className="sheet-card"
        onPointerDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onConfirm(name);
        }}
      >
        <h2 className="sheet-title">{title}</h2>
        <input
          className="name-input"
          autoFocus
          value={name}
          maxLength={NAME_MAX}
          placeholder="Prénom"
          onChange={(e) => setName(e.target.value)}
        />
        <div className="sheet-row">
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Annuler
          </button>
          <button type="submit" className="btn-main" disabled={!ready}>
            {cta}
          </button>
        </div>
      </form>
    </div>
  );
}
