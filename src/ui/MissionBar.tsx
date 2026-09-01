import type { Mission } from '../core/missions';
import BlockThumb from './BlockThumb';
import type { Wardrobe } from '../core/wardrobe';

interface Props {
  mission: Mission;
  wardrobe: Wardrobe;
  faites: number;
  total: number;
  onSay: () => void;
  onSkip: () => void;
}

/**
 * L'énoncé est une image : le bloc à fabriquer, en vrai, avec son chiffre. Un
 * enfant de quatre ans ne lit pas « fabrique un bloc de 7 » — il reconnaît la
 * forme et il l'écoute.
 */
export default function MissionBar({ mission, wardrobe, faites, total, onSay, onSkip }: Props) {
  const combien = mission.nombre ?? 1;

  return (
    <div className="mission-bar">
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
        <span className="mission-enonce">{mission.enonce}</span>
        <span className="mission-compte">
          {faites} / {total}
        </span>
      </div>

      <button className="icon-btn tiny" onClick={onSkip} aria-label="Une autre mission" title="Une autre">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <polyline points="9 6 15 12 9 18" />
        </svg>
      </button>
    </div>
  );
}
