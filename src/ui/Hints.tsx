import type { Wardrobe } from '../render/faces';
import BlockThumb from './BlockThumb';

interface Props {
  wardrobe: Wardrobe;
  onClose: () => void;
}

interface Hint {
  label: string;
  icon?: string;
  /** Réplique miniature d'un bouton, plus parlante qu'un pictogramme. */
  block?: number;
}

const HINTS: Hint[] = [
  { block: 3, label: 'Choisis un bloc en bas' },
  { icon: '\u{1F91D}', label: 'Colle deux blocs' },
  { icon: '\u{1F91A}', label: 'Secoue pour détacher' },
  { icon: '✂️', label: 'Trace un trait pour couper' },
  { icon: '\u{1F5D1}\uFE0F', label: 'Glisse un bloc dans la corbeille pour le jeter' },
];

/**
 * Volontairement modale : un enfant balaie l'écran des qu'il s'allume, donc une
 * carte qui se ferme au premier contact disparaît avant d'avoir été lue.
 */
export default function Hints({ wardrobe, onClose }: Props) {
  return (
    <div className="hints">
      <div className="hints-card">
        <h1 className="hints-title">Comment jouer</h1>
        <div className="hints-grid">
          {HINTS.map((h) => (
            <div className="hint" key={h.label}>
              {h.block ? (
                <BlockThumb value={h.block} wardrobe={wardrobe} className="hint-chip" />
              ) : (
                <span className="hint-icon">{h.icon}</span>
              )}
              <span className="hint-label">{h.label}</span>
            </div>
          ))}
        </div>
        <button className="hints-close" onClick={onClose}>
          C&apos;est parti !
        </button>
      </div>
    </div>
  );
}
