interface Props {
  /** L'échelle de la vue, de 0 à 100. */
  zoom: number;
  onZoom: (sens: 1 | -1) => void;
}

/**
 * Le réglage du zoom, sur le bord droit de la scène.
 *
 * Il n'est pas dans la barre du haut : le sélecteur à trois modes y a déjà
 * coûté deux largeurs de bouton, et deux boutons de plus plus un nombre la
 * feraient déborder sur un téléphone de 320 px. Flottant sur le côté, il ne
 * dispute la place à personne et ne paraît que sur un chantier.
 *
 * Le nombre est là parce qu'un + et un − seuls ne disent jamais où l'on en est :
 * dézoomé à fond puis rezoomé, on ne sait plus si l'on est revenu à la vue de
 * départ. 50 %, c'est cette vue-là — et les boutons tombent sur des paliers
 * ronds, si bien que cinq appuis mènent exactement d'un bout à l'autre.
 */
export default function ZoomBar({ zoom, onZoom }: Props) {
  return (
    <div className="zoom-bar">
      <button
        className="icon-btn small"
        onClick={() => onZoom(1)}
        disabled={zoom >= 100}
        aria-label="Zoomer"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 6v12M6 12h12" />
        </svg>
      </button>
      <div className="zoom-niveau">{zoom}%</div>
      <button
        className="icon-btn small"
        onClick={() => onZoom(-1)}
        disabled={zoom <= 0}
        aria-label="Dézoomer"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 12h12" />
        </svg>
      </button>
    </div>
  );
}
