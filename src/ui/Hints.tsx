interface Props {
  onClose: () => void;
}

const HINTS = [
  { icon: '➕', label: 'Appuie sur +1' },
  { icon: '\u{1F91D}', label: 'Colle deux blocs' },
  { icon: '\u{1F91A}', label: 'Secoue pour détacher' },
  { icon: '✂️', label: 'Trace un trait pour couper' },
];

/**
 * Volontairement modale : un enfant balaie l'écran des qu'il s'allume, donc une
 * carte qui se ferme au premier contact disparaît avant d'avoir été lue.
 */
export default function Hints({ onClose }: Props) {
  return (
    <div className="hints">
      <div className="hints-card">
        <h1 className="hints-title">Comment jouer</h1>
        <div className="hints-grid">
          {HINTS.map((h) => (
            <div className="hint" key={h.label}>
              <span className="hint-icon">{h.icon}</span>
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
