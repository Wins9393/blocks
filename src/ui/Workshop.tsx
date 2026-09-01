import { useState } from 'react';
import { colorFor } from '../core/palette';
import { SLOTS, isUnlocked, lookFor } from '../core/wardrobe';
import type { SlotKey, Wardrobe } from '../core/wardrobe';
import BlockThumb from './BlockThumb';
import FaceThumb from './FaceThumb';

const VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

interface Props {
  wardrobe: Wardrobe;
  /** Les pièces gagnées en mission, sous la forme « emplacement:pièce ». */
  gagnees: ReadonlySet<string>;
  onChange: (value: number, slot: SlotKey, option: string) => void;
  onReset: (value: number) => void;
  onClose: () => void;
}

/**
 * L'atelier : chaque enfant habille ses blocs.
 *
 * La couleur n'est pas réglable — c'est elle qui dit quel nombre on regarde,
 * et deux blocs repeints à l'identique ne se distingueraient plus.
 */
export default function Workshop({ wardrobe, gagnees, onChange, onReset, onClose }: Props) {
  const [value, setValue] = useState(1);
  const [slotKey, setSlotKey] = useState<SlotKey>('eyes');

  const slot = SLOTS.find((s) => s.key === slotKey) ?? SLOTS[0];
  const look = lookFor(value, wardrobe);
  const base = colorFor(value);
  const touche = Object.keys(wardrobe[value] ?? {}).length > 0;

  return (
    <div className="sheet workshop">
      <div className="sheet-card workshop-card">
        <div className="workshop-head">
          <h2 className="sheet-title">Atelier</h2>
          <button className="icon-btn tiny" onClick={onClose} aria-label="Fermer l'atelier">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 7l10 10M17 7L7 17" />
            </svg>
          </button>
        </div>

        <div className="value-row">
          {VALUES.map((v) => (
            <button
              key={v}
              className={v === value ? 'value-pick current' : 'value-pick'}
              onClick={() => setValue(v)}
              aria-label={`Habiller le bloc ${v}`}
              aria-pressed={v === value}
            >
              <BlockThumb value={v} wardrobe={wardrobe} />
              <span className="value-num">{v}</span>
            </button>
          ))}
        </div>

        <div className="workshop-preview">
          <BlockThumb value={value} wardrobe={wardrobe} className="preview-art" />
        </div>

        <div className="slot-tabs">
          {SLOTS.map((s) => (
            <button
              key={s.key}
              className={s.key === slotKey ? 'slot-tab current' : 'slot-tab'}
              onClick={() => setSlotKey(s.key)}
              aria-pressed={s.key === slotKey}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="option-grid">
          {slot.pieces.map((piece) => {
            // Une pièce fermée reste visible : c'est ce qu'on voit sans
            // l'avoir qui donne envie de la gagner.
            const ouverte = isUnlocked(slot.key, piece.id, gagnees);
            const classes = [
              'option',
              look[slot.key] === piece.id ? 'current' : '',
              ouverte ? '' : 'fermee',
            ]
              .filter(Boolean)
              .join(' ');
            return (
            <button
              key={piece.id}
              className={classes}
              onClick={() => ouverte && onChange(value, slot.key, piece.id)}
              disabled={!ouverte}
              aria-label={ouverte ? piece.label : `${piece.label} — à gagner en mission`}
              title={ouverte ? piece.label : 'À gagner en mission'}
              aria-pressed={look[slot.key] === piece.id}
            >
              {/* Chaque essayage montre le bloc en cours, pas un mannequin :
                  on voit la pièce sur le personnage qu'on est en train d'habiller. */}
              <FaceThumb base={base} look={{ ...look, [slot.key]: piece.id }} />
              {!ouverte && (
                <svg viewBox="0 0 24 24" aria-hidden="true" className="cadenas">
                  <rect x="5" y="11" width="14" height="9" rx="2.5" />
                  <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
                </svg>
              )}
            </button>
            );
          })}
        </div>

        <button className="btn-ghost wide" onClick={() => onReset(value)} disabled={!touche}>
          Remettre le {value} comme au début
        </button>
      </div>
    </div>
  );
}
