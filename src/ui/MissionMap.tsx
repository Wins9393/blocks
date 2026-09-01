import { CHAPITRES } from '../core/missions';
import type { Wardrobe } from '../core/wardrobe';
import BlockThumb from './BlockThumb';

interface Props {
  faites: ReadonlySet<string>;
  /** Celle qui est affichée dans le bandeau en ce moment. */
  courante?: string;
  wardrobe: Wardrobe;
  onPick: (id: string) => void;
  onClose: () => void;
}

/**
 * La carte du parcours : les cinq chapitres, toutes leurs missions, ouvertes.
 *
 * Rien n'est verrouillé. Le parcours donne l'ordre conseillé, il ne le garde
 * pas : on refait une mission réussie parce qu'on l'a aimée, on va chercher
 * plus loin parce qu'on est prêt. Sans cette carte, la seule navigation était
 * « une autre » — on avançait, on ne revenait jamais.
 */
export default function MissionMap({ faites, courante, wardrobe, onPick, onClose }: Props) {
  return (
    <div className="sheet">
      <div className="sheet-card carte-card">
        <div className="workshop-head">
          <h2 className="sheet-title">Les missions</h2>
          <button className="icon-btn tiny" onClick={onClose} aria-label="Fermer la carte">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 7l10 10M17 7L7 17" />
            </svg>
          </button>
        </div>

        <div className="carte-corps">
          {CHAPITRES.map((chapitre) => {
            const gagnees = chapitre.missions.filter((m) => faites.has(m.id)).length;
            return (
              <section className="carte-chapitre" key={chapitre.id}>
                <h3 className="carte-titre">
                  <span>{chapitre.titre}</span>
                  <span className="carte-part">
                    {gagnees} / {chapitre.missions.length}
                  </span>
                </h3>

                <div className="carte-grille">
                  {chapitre.missions.map((mission) => {
                    const faite = faites.has(mission.id);
                    const combien = mission.nombre ?? 1;
                    const classes = [
                      'carte-case',
                      faite ? 'faite' : '',
                      mission.id === courante ? 'current' : '',
                    ]
                      .filter(Boolean)
                      .join(' ');
                    return (
                      <button
                        key={mission.id}
                        className={classes}
                        onClick={() => onPick(mission.id)}
                        aria-label={mission.enonce}
                        title={mission.enonce}
                      >
                        {/* Le bloc à fabriquer, comme dans le bandeau : c'est
                            l'image qui dit la mission, pas son titre. */}
                        <BlockThumb
                          value={mission.cible}
                          wardrobe={wardrobe}
                          className="carte-art"
                        />
                        {combien > 1 && <span className="carte-nombre">×{combien}</span>}
                        {faite && (
                          <svg viewBox="0 0 24 24" aria-hidden="true" className="carte-coche">
                            <polyline points="5 13 10 18 19 6" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
