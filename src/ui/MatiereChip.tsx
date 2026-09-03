import { useRef } from 'react';
import type { PointerEvent } from 'react';
import { matiereFor } from '../core/matieres';
import { drawCubeThumb } from '../render/paint';
import Painter from './Painter';

interface Props {
  mat: number;
  disabled: boolean;
  /** Le doigt s'est posé sur le bouton : le cube naît là et suit la main. */
  onTirer: (mat: number, e: PointerEvent<HTMLButtonElement>) => void;
  /** Chemin du clavier, où il n'y a pas de doigt à suivre. */
  onPoser: (mat: number) => void;
}

/**
 * Un bouton = une matière. Le cube naît **sous le doigt** et se tire hors de la
 * barre jusqu'à sa place ; rien ne tombe du ciel. Le relâcher sans être sorti
 * de la barre l'y range, ce qui est déjà la règle pour jeter un bloc.
 *
 * La barre n'offre jamais de formes : tirer un cube est le seul geste qui
 * fabrique de la matière, et assembler est le seul qui fabrique une forme. Le
 * cube du bouton est dessiné par le moteur de la scène — il montre donc
 * exactement ce qu'il pose, grain compris.
 */
export default function MatiereChip({ mat, disabled, onTirer, onPoser }: Props) {
  const matiere = matiereFor(mat);
  /**
   * Un clic qui suit un pointeur n'a rien à poser : le cube est déjà né sous le
   * doigt. Le distinguer par `e.detail === 0` paraissait suffire — un clic sans
   * pointeur vient du clavier — mais dans Firefox le `preventDefault` du
   * `pointerdown` supprime le `mousedown`, et le compteur de clics reste à
   * zéro : **chaque vrai clic** prenait le chemin du clavier et posait un
   * second cube au milieu de la scène. On retient donc le pointeur nous-mêmes,
   * seul témoin qui ne dépende pas du navigateur.
   */
  const tirait = useRef(false);
  return (
    <button
      className="chip tirable"
      onPointerDown={(e) => {
        if (disabled) return;
        // Sinon le navigateur ouvre son propre glisser, ou fait défiler la page,
        // et le cube reste collé à la barre.
        e.preventDefault();
        tirait.current = true;
        onTirer(mat, e);
      }}
      // Un glisser abandonné ne rend pas la main au bouton : sans cette remise
      // à zéro, il mangerait l'appui de touche suivant.
      onKeyDown={() => {
        tirait.current = false;
      }}
      // Reste le clic sans pointeur — le clavier, ou un lecteur d'écran : le
      // bouton ne doit pas rester mort pour qui ne peut pas tirer.
      onClick={() => {
        if (tirait.current) tirait.current = false;
        else onPoser(mat);
      }}
      disabled={disabled}
      aria-label={`Tirer un cube en ${matiere.nom.toLowerCase()}`}
      title={matiere.nom}
    >
      <Painter
        className="chip-art"
        sig={`matiere:${mat}`}
        draw={(ctx, w, h, dpr) => drawCubeThumb(ctx, mat, w, h, dpr)}
      />
    </button>
  );
}
