import { matiereFor } from '../core/matieres';

interface Props {
  mat: number;
  disabled: boolean;
  onPick: (mat: number) => void;
}

/**
 * Un bouton = une matière. Appuyer dessus pose un cube de cette matière-là.
 *
 * La barre n'offre jamais de formes : poser un cube est le seul geste qui
 * fabrique de la matière, et assembler est le seul qui fabrique une forme.
 */
export default function MatiereChip({ mat, disabled, onPick }: Props) {
  const matiere = matiereFor(mat);
  return (
    <button
      className="chip"
      onClick={() => onPick(mat)}
      disabled={disabled}
      aria-label={`Poser un cube en ${matiere.nom.toLowerCase()}`}
      title={matiere.nom}
    >
      <svg className="chip-art" viewBox="0 0 100 100" aria-hidden="true">
        <rect
          x="27"
          y="27"
          width="46"
          height="46"
          rx="7"
          fill={matiere.couleur}
          stroke="rgba(0, 0, 0, 0.28)"
          strokeWidth="2"
        />
      </svg>
    </button>
  );
}
