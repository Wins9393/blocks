interface Props {
  onDismiss: () => void;
}

const HINTS = [
  { icon: '➕', label: 'Appuie sur +1' },
  { icon: '\u{1F91D}', label: 'Colle deux blocs' },
  { icon: '\u{1F91A}', label: 'Secoue pour détacher' },
  { icon: '✂️', label: 'Trace un trait pour couper' },
];

export default function Hints({ onDismiss }: Props) {
  return (
    <div className="hints" onPointerDown={onDismiss}>
      <div className="hints-card">
        {HINTS.map((h) => (
          <div className="hint" key={h.label}>
            <span className="hint-icon">{h.icon}</span>
            <span className="hint-label">{h.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
