import { colorFor } from '../core/palette';
import { lookFor } from '../core/wardrobe';
import type { Piece, SlotKey, Wardrobe } from '../core/wardrobe';
import FaceThumb from './FaceThumb';

interface Props {
  piece: Piece;
  slot: SlotKey;
  wardrobe: Wardrobe;
  /** La pièce gagnée se montre en volume si la scène l'est. */
  relief: boolean;
  onClose: () => void;
}

/** Le bloc du 5 sert de mannequin : sa tête est bien dégagée. */
const MANNEQUIN = 5;

export default function RewardCard({ piece, slot, wardrobe, relief, onClose }: Props) {
  const base = colorFor(MANNEQUIN);
  const look = { ...lookFor(MANNEQUIN, wardrobe), [slot]: piece.id };

  return (
    <div className="sheet" onPointerDown={onClose}>
      <div className="sheet-card reward-card" onPointerDown={(e) => e.stopPropagation()}>
        <h2 className="reward-titre">Bravo !</h2>
        {/* La récompense est montrée portée, pas décrite : c'est ce qu'on voit
            sur le personnage qui donne envie de gagner la suivante. */}
        <FaceThumb base={base} look={look} relief={relief} className="reward-art" />
        <p className="reward-nom">Tu as gagné {piece.label}</p>
        <button className="btn-main wide" onClick={onClose}>
          Continuer
        </button>
      </div>
    </div>
  );
}
