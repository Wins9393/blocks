import type { Mission } from '../core/missions';
import BlockThumb from './BlockThumb';
import type { Wardrobe } from '../core/wardrobe';

interface Props {
  mission: Mission;
  wardrobe: Wardrobe;
  /** La mission vient d'être réussie : le bandeau la fête au lieu de la poser. */
  gagne: boolean;
  faites: number;
  total: number;
  onSay: () => void;
  onSkip: () => void;
  onMap: () => void;
}

/**
 * L'énoncé est une image : le bloc à fabriquer, en vrai, avec son chiffre. Un
 * enfant de quatre ans ne lit pas « fabrique un bloc de 7 » — il reconnaît la
 * forme et il l'écoute.
 */
export default function MissionBar({
  mission,
  wardrobe,
  gagne,
  faites,
  total,
  onSay,
  onSkip,
  onMap,
}: Props) {
  const combien = mission.nombre ?? 1;

  return (
    <div className={gagne ? 'mission-bar gagne' : 'mission-bar'}>
      <button className="mission-cible" onClick={onSay} aria-label={`Réécouter : ${mission.enonce}`}>
        {Array.from({ length: combien }, (_, i) => (
          <span className="mission-bloc" key={i}>
            <BlockThumb value={mission.cible} wardrobe={wardrobe} className="mission-art" />
          </span>
        ))}
        <svg viewBox="0 0 24 24" aria-hidden="true" className="mission-voix">
          <path d="M5 9h3l4-4v14l-4-4H5z" />
          <path d="M16 9a4 4 0 0 1 0 6" />
        </svg>
      </button>

      <div className="mission-mots">
        <span className="mission-enonce">{gagne ? 'Bravo, tu l’as fabriqué !' : mission.enonce}</span>
        {/* Le compteur est la porte de la carte : c'est là qu'on regarde où on
            en est, donc c'est là qu'on cherche à revenir en arrière. */}
        <button className="mission-compte" onClick={onMap} aria-label="Voir toutes les missions">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="6" cy="7" r="1.6" />
            <circle cx="6" cy="17" r="1.6" />
            <path d="M11 7h8M11 17h8" />
          </svg>
          {faites} / {total}
        </button>
      </div>

      {gagne ? (
        <span className="mission-coche" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <polyline points="5 13 10 18 19 6" />
          </svg>
        </span>
      ) : (
        <button
          className="icon-btn tiny"
          onClick={onSkip}
          aria-label="Une autre mission"
          title="Une autre"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </button>
      )}
    </div>
  );
}
