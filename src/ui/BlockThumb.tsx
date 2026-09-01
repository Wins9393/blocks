import { colorFor } from '../core/palette';
import { lookFor, lookSignature } from '../core/wardrobe';
import type { Wardrobe } from '../core/wardrobe';
import { drawBlockThumb, drawBlockThumb3D } from '../render/paint';
import Painter from './Painter';

interface Props {
  value: number;
  wardrobe?: Wardrobe;
  /** Montrer le bloc en volume, comme la scène quand le relief est allumé. */
  relief?: boolean;
  className?: string;
}

/**
 * Le bloc dessiné hors de la scène, par le même code qu'elle. Un bouton doit
 * montrer exactement ce qu'il pose, personnage compris : deux dessins séparés
 * auraient divergé au premier changement de coiffure.
 */
export default function BlockThumb({ value, wardrobe, relief, className = 'chip-art' }: Props) {
  const base = colorFor(value);
  return (
    <Painter
      className={className}
      sig={`${value}|${base}|${lookSignature(lookFor(value, wardrobe))}|${relief ? '3d' : '2d'}`}
      draw={(ctx, w, h, dpr) => {
        // Le volume peut manquer (pas de WebGL) : le trait reprend la main.
        if (relief && drawBlockThumb3D(ctx, value, base, w, h, dpr, wardrobe)) return;
        drawBlockThumb(ctx, value, base, w, h, wardrobe);
      }}
    />
  );
}
