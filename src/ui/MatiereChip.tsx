import { matiereFor } from '../core/matieres';
import { drawCubeThumb } from '../render/paint';
import Painter from './Painter';

interface Props {
  mat: number;
  disabled: boolean;
  onPick: (mat: number) => void;
}

/**
 * Un bouton = une matière. Appuyer dessus pose un cube de cette matière-là.
 *
 * La barre n'offre jamais de formes : poser un cube est le seul geste qui
 * fabrique de la matière, et assembler est le seul qui fabrique une forme. Le
 * cube du bouton est dessiné par le moteur de la scène — il montre donc
 * exactement ce qu'il pose, grain compris.
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
      <Painter
        className="chip-art"
        sig={`matiere:${mat}`}
        draw={(ctx, w, h, dpr) => drawCubeThumb(ctx, mat, w, h, dpr)}
      />
    </button>
  );
}
