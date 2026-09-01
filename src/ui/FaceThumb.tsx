import { lookSignature } from '../core/wardrobe';
import type { ResolvedLook } from '../core/wardrobe';
import { drawFaceThumb } from '../render/paint';
import Painter from './Painter';

interface Props {
  base: string;
  look: ResolvedLook;
  className?: string;
}

/** Une tête seule, au plus grand possible : c'est la taille où on choisit. */
export default function FaceThumb({ base, look, className = 'face-art' }: Props) {
  return (
    <Painter
      className={className}
      sig={`${base}|${lookSignature(look)}`}
      draw={(ctx, w, h) => drawFaceThumb(ctx, base, look, w, h)}
    />
  );
}
