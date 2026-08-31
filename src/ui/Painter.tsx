import { useEffect, useRef } from 'react';

interface Props {
  /** Change quand le dessin doit être refait. */
  sig: string;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  className?: string;
}

/**
 * Un canvas piloté par une signature plutôt que par ses dépendances : les
 * vignettes se repeignent quand leur contenu change, pas à chaque rendu React.
 */
export default function Painter({ sig, draw, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

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
      drawRef.current(ctx, w, h);
      ctx.restore();
    };

    paint();
    // Le dessin est en pixels : il doit être refait à chaque changement de
    // taille, sinon il reste flou après une rotation d'écran.
    const observer = new ResizeObserver(paint);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [sig]);

  return <canvas ref={canvasRef} className={className} />;
}
