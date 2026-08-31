import { colorFor } from '../core/palette';
import { lookFor, lookSignature } from '../render/faces';
import type { Wardrobe } from '../render/faces';
import { drawBlockThumb } from '../render/paint';
import Painter from './Painter';

interface Props {
  value: number;
  wardrobe?: Wardrobe;
  className?: string;
}

/**
 * Le bloc dessiné hors de la scène, par le même code qu'elle. Un bouton doit
 * montrer exactement ce qu'il pose, personnage compris : deux dessins séparés
 * auraient divergé au premier changement de coiffure.
 */
export default function BlockThumb({ value, wardrobe, className = 'chip-art' }: Props) {
  const base = colorFor(value);
  return (
    <Painter
      className={className}
      sig={`${value}|${base}|${lookSignature(lookFor(value, wardrobe))}`}
      draw={(ctx, w, h) => drawBlockThumb(ctx, value, base, w, h, wardrobe)}
    />
  );
}
