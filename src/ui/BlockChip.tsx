import { colorFor } from '../core/palette';
import type { Wardrobe } from '../render/faces';
import BlockThumb from './BlockThumb';

interface Props {
  value: number;
  wardrobe: Wardrobe;
  disabled: boolean;
  onPick: (value: number) => void;
}

/** Un bouton = un bloc. Appuyer dessus le fait tomber dans la scène. */
export default function BlockChip({ value, wardrobe, disabled, onPick }: Props) {
  return (
    <button
      className="chip"
      onClick={() => onPick(value)}
      disabled={disabled}
      aria-label={`Ajouter le bloc ${value}`}
      title={`Bloc ${value}`}
    >
      <BlockThumb value={value} wardrobe={wardrobe} />
      <span className="chip-num" style={{ background: colorFor(value) }}>
        {value}
      </span>
    </button>
  );
}
