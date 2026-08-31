import { useEffect, useRef } from 'react';
import { colorFor } from '../core/palette';
import { drawBlockThumb } from '../render/paint';

interface Props {
  value: number;
  className?: string;
}

/**
 * Le bloc dessiné hors de la scène, par le même code qu'elle. Un bouton doit
 * montrer exactement ce qu'il pose, personnage compris : deux dessins séparés
 * auraient divergé au premier changement de coiffure.
 */
export default function BlockThumb({ value, className = 'chip-art' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const paint = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w < 2 || h < 2) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.save();
      ctx.scale(dpr, dpr);
      drawBlockThumb(ctx, value, colorFor(value), w, h);
      ctx.restore();
    };

    paint();
    // Le dessin est en pixels : il doit être refait à chaque changement de
    // taille, sinon il reste flou après une rotation d'écran.
    const observer = new ResizeObserver(paint);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [value]);

  return <canvas ref={canvasRef} className={className} />;
}
