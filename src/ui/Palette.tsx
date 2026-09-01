import { MAX_UNITS } from '../core/constants';
import type { GameState } from '../game/game';
import type { Wardrobe } from '../core/wardrobe';
import BlockChip from './BlockChip';

const VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

interface Props {
  state: GameState;
  wardrobe: Wardrobe;
  onPick: (value: number) => void;
}

export default function Palette({ state, wardrobe, onPick }: Props) {
  return (
    <div className="palette">
      {VALUES.map((v) => (
        <BlockChip
          key={v}
          value={v}
          wardrobe={wardrobe}
          // Un bloc de 10 est refusé bien avant un bloc de 1 : chaque bouton
          // sait s'il tient encore dans la scène.
          disabled={state.units + v > MAX_UNITS}
          onPick={onPick}
        />
      ))}
      {state.full && <div className="warning">C&apos;est plein !</div>}
    </div>
  );
}
