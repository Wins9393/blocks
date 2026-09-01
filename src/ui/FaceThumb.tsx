import { lookSignature } from '../core/wardrobe';
import type { ResolvedLook } from '../core/wardrobe';
import { drawFaceThumb, drawFaceThumb3D } from '../render/paint';
import Painter from './Painter';

interface Props {
  base: string;
  look: ResolvedLook;
  /** Essayer la pièce en volume, comme sur la scène. */
  relief?: boolean;
  className?: string;
}

/** Une tête seule, au plus grand possible : c'est la taille où on choisit. */
export default function FaceThumb({ base, look, relief, className = 'face-art' }: Props) {
  return (
    <Painter
      className={className}
      sig={`${base}|${lookSignature(look)}|${relief ? '3d' : '2d'}`}
      draw={(ctx, w, h, dpr) => {
        if (relief && drawFaceThumb3D(ctx, base, look, w, h, dpr)) return;
        drawFaceThumb(ctx, base, look, w, h);
      }}
    />
  );
}
