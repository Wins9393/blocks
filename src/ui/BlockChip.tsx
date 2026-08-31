import { colorFor } from '../core/palette';
import BlockThumb from './BlockThumb';

interface Props {
  value: number;
  disabled: boolean;
  onPick: (value: number) => void;
}

/** Un bouton = un bloc. Appuyer dessus le fait tomber dans la scène. */
export default function BlockChip({ value, disabled, onPick }: Props) {
  return (
    <button
      className="chip"
      onClick={() => onPick(value)}
      disabled={disabled}
      aria-label={`Ajouter le bloc ${value}`}
      title={`Bloc ${value}`}
    >
      <BlockThumb value={value} />
      <span className="chip-num" style={{ background: colorFor(value) }}>
        {value}
      </span>
    </button>
  );
}
