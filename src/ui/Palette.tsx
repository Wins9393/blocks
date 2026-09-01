import { MAX_UNITS } from '../core/constants';
import type { GameState } from '../game/game';
import type { Wardrobe } from '../core/wardrobe';
import BlockChip from './BlockChip';

const VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

interface Props {
  state: GameState;
  wardrobe: Wardrobe;
  /** Les seuls blocs offerts. Absent = tous. */
  allowed?: number[];
  onPick: (value: number) => void;
}

export default function Palette({ state, wardrobe, allowed, onPick }: Props) {
  // Une mission sous contrainte se lit dans la barre : les blocs interdits ne
  // sont pas grisés, ils ne sont pas là. Rien à comprendre, rien à enfreindre.
  const offerts = allowed ? VALUES.filter((v) => allowed.includes(v)) : VALUES;

  return (
    <div className={allowed ? 'palette restreinte' : 'palette'}>
      {offerts.map((v) => (
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
