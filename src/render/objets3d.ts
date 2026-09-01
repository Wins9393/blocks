/**
 * Les objets de la garde-robe, en volume.
 *
 * **Chaque pièce reprend les cotes exactes de son dessin 2D** (`faces.ts`) :
 * mêmes multiples de `U`, mêmes matières, même position sur la tête. Ce qui
 * s'ajoute, c'est la troisième dimension — et une règle pour la choisir :
 *
 * - ce qui est *plat de face* dans le dessin (étoile, cœur, oreille de chat)
 *   est extrudé du tracé lui-même, découpé en oreilles ;
 * - ce qui coiffe la tête (dômes, cônes, calottes) devient un solide de
 *   révolution assez **profond pour envelopper la dalle** — moins profond, sa
 *   partie basse passerait derrière la face avant du bloc et le chapeau se
 *   mettrait à flotter ;
 * - ce que le dessin étale en bande sur la tête (bord de chapeau, bandeau,
 *   écharpe) devient une **plaque posée devant la dalle** : l'anneau serait
 *   plus juste, mais sur vingt-trois pixels d'épaisseur il ne montre qu'un arc
 *   deux fois plus étroit que la tête ;
 * - et ce que le dessin montre en ellipse pour dire l'horizontale — l'auréole —
 *   est un anneau **incliné de `asin(ry / rx)`**.
 *
 * Les pièces qui ne sont pas des objets — cheveux, sourcils, bouches,
 * moustaches, joues — restent dessinées : c'est le partage qui rend la chose
 * tenable, et c'est celui qu'on a choisi.
 */
import { UNIT } from '../core/constants';
import type { GlassKind, HatKind, ScarfKind } from '../core/wardrobe';
import {
  Forge,
  MAT_GEMME,
  MAT_LUMIERE,
  MAT_MAT,
  MAT_METAL,
  MAT_VERRE,
  arc,
  coeurPts,
  etoile,
  quadratique,
  rectArrondi,
  teinte,
} from './mesh';
import type { Pt } from './mesh';

const U = UNIT;
const TOP = -U * 0.5;
const EYE_X = U * 0.21;
const EYE_Y = -U * 0.07;
const NECK = U * 0.42;

/** Demi-épaisseur d'un bloc : c'est une dalle, pas un cube. */
export const Z = U * 0.32;
/**
 * Le devant de la dalle, plus un cheveu.
 *
 * Tout ce que le dessin 2D pose *sur* le bloc — une barrette, un nasal, un
 * nœud papillon — doit sortir de l'épaisseur, sinon le volume l'avale et la
 * pièce disparaît purement et simplement.
 */
const DEVANT = Z + U * 0.02;

/**
 * Étirement d'un anneau pour qu'il fasse *vraiment* le tour de la dalle.
 *
 * Un anneau plus étroit que l'épaisseur du bloc passe derrière sa face avant :
 * de face, il disparaît sous la tête au lieu de la ceindre. On ne l'étire donc
 * que s'il en a besoin — un grand anneau reste rond.
 */
const autour = (R: number) => Math.max(1, (Z + U * 0.09) / R);

/**
 * Demi-profondeur de tout ce qui se pose sur la tête.
 *
 * C'est la correction qui remet les chapeaux sur le crâne : un dôme moins
 * profond que la dalle voit sa partie basse — celle qui coiffe justement la
 * tête — masquée par la face avant du bloc, et le chapeau se met à flotter.
 */
const PROF_TETE = Z + U * 0.05;

/**
 * Les bandes du dessin — bords de chapeau, bandeaux, écharpes — deviennent des
 * **plaques posées devant la dalle**, et non des anneaux qui l'entourent.
 *
 * L'anneau est plus juste physiquement, mais il ne montre que son arc avant :
 * sur une dalle de vingt-trois pixels d'épaisseur, cet arc est deux fois plus
 * étroit que la tête, et le chapeau se met à flotter. La plaque, elle, rend
 * exactement le tracé d'origine, garde son épaisseur et sa lumière propre.
 */
function plaque(f: Forge, contour: Pt[], epaisseur = U * 0.05, avance = 0) {
  f.extrude(contour, DEVANT + avance, DEVANT + avance + epaisseur);
}

const OR = teinte('#FFD75E');
const OR_OMBRE = teinte('#BF8C1C');
const LAINE = teinte('#E4574B');
const LAINE_OMBRE = teinte('#AB362D');
const DENIM = teinte('#4E7BB5');
const DENIM_OMBRE = teinte('#2F538A');
const BOIS = teinte('#8A6136');
const METAL = teinte('#C6D0DF');
const METAL_OMBRE = teinte('#7B88A0');
const NUIT = teinte('#4A3C86');
const NUIT_OMBRE = teinte('#2A2154');
const NOIR = teinte('#2E323F');
const NOIR_CLAIR = teinte('#4C5265');
const ROSE = teinte('#F58BB0');
const CREME = teinte('#F6EEDC');
const FEUILLE = teinte('#5FB663');
const FEUILLE_OMBRE = teinte('#3A8140');
const JAUNE = teinte('#F4C63F');
const JAUNE_OMBRE = teinte('#BE931C');
const ROUGE = teinte('#DE4E3E');
const ROUGE_OMBRE = teinte('#A5332A');
const CIEL = teinte('#6FC6E8');
const BLANC = teinte('#FDFDFD');
const VERRE_BLEU = teinte('#96DCF5');

/** L'inclinaison qui redonne l'ellipse du dessin. */
const penche = (rx: number, ry: number) => -Math.asin(Math.min(1, ry / rx));

export interface Objet3D {
  /** Géométrie opaque, dans le repère de la case du visage. */
  corps?(f: Forge): void;
  /** Pièce qui bouge toute seule (l'hélice), posée par `poseMobile`. */
  mobile?(f: Forge): void;
  poseMobile?(t: number): { y: number; angle: number };
  /** Verres et voiles : dessinés après, en translucide. */
  verre?(f: Forge): void;
  /** Flottement vertical de l'objet entier (l'auréole). */
  flotte?(t: number): number;
}

// --- chapeaux --------------------------------------------------------------

const CHAPEAUX: Partial<Record<HatKind, Objet3D>> = {
  couronne: {
    corps(f) {
      const base = TOP + U * 0.09;
      const pointe = base - U * 0.24;
      const R = U * 0.42;
      const ep = U * 0.035;
      const SEG = 96;
      const POINTES = 5;
      // Le bandeau et ses cinq pointes, une pile face au spectateur : de face,
      // la silhouette retrouve celle du polygone dessiné.
      f.peint(OR, MAT_METAL);
      const haut = (t: number) => {
        const x = (t * POINTES + 0.5) % 1;
        return base - U * 0.09 - (base - U * 0.09 - pointe) * (1 - Math.abs(x * 2 - 1));
      };
      for (let i = 0; i < SEG; i++) {
        const t0 = i / SEG, t1 = (i + 1) / SEG;
        const a0 = t0 * Math.PI * 2, a1 = t1 * Math.PI * 2;
        const s0: Pt = [Math.sin(a0), Math.cos(a0)], s1: Pt = [Math.sin(a1), Math.cos(a1)];
        const y0 = haut(t0), y1 = haut(t1);
        const cerne = autour(R);
        const pe = (s: Pt, y: number, k: number): [number, number, number] => [s[0] * R * k, y, s[1] * R * cerne * k];
        const n0: [number, number, number] = [s0[0], 0, s0[1] / cerne];
        const n1: [number, number, number] = [s1[0], 0, s1[1] / cerne];
        const d0: [number, number, number] = [-s0[0], 0, -s0[1] / cerne];
        const d1: [number, number, number] = [-s1[0], 0, -s1[1] / cerne];
        const ri = 1 - ep / R;
        f.quad(pe(s0, base, 1), pe(s1, base, 1), pe(s1, y1, 1), pe(s0, y0, 1), n0, n1, n1, n0);
        f.quad(pe(s1, base, ri), pe(s0, base, ri), pe(s0, y0, ri), pe(s1, y1, ri), d1, d0, d0, d1);
        const nh: [number, number, number] = [0, -1, 0];
        f.quad(pe(s0, y0, 1), pe(s1, y1, 1), pe(s1, y1, ri), pe(s0, y0, ri), nh, nh, nh, nh);
        const nb: [number, number, number] = [0, 1, 0];
        f.quad(pe(s0, base, ri), pe(s1, base, ri), pe(s1, base, 1), pe(s0, base, 1), nb, nb, nb, nb);
      }
      // Les trois gemmes du bandeau, aux mêmes abscisses que dans le dessin.
      for (const [i, c] of [ROUGE, CIEL, FEUILLE].entries()) {
        const x = (i - 1) * U * 0.22;
        const dz = Math.sqrt(Math.max(0, 1 - (x / R) ** 2)) * R * autour(R);
        f.peint(c, MAT_GEMME).save();
        f.translate(x, base - U * 0.045, dz);
        f.sphere([U * 0.045, U * 0.045, U * 0.045], 1, 14, 10);
        f.restore();
      }
    },
  },

  etoile: {
    corps(f) {
      f.peint(OR, MAT_METAL);
      f.extrude(etoile(U * 0.33, TOP - U * 0.01, U * 0.16), DEVANT, DEVANT + U * 0.05);
      f.peint(OR_OMBRE, MAT_METAL);
      f.extrude(etoile(U * 0.33, TOP - U * 0.01, U * 0.16), DEVANT - U * 0.02, DEVANT);
    },
  },

  plume: {
    corps(f) {
      // Le bandeau : ce que le dessin montre en barrette est un anneau.
      f.peint(BOIS, MAT_MAT);
      plaque(f, rectArrondi(-U * 0.44, TOP - U * 0.03, U * 0.88, U * 0.13, U * 0.06), U * 0.06);

      const pointe: Pt = [U * 0.48, TOP - U * 0.26];
      const gauche: Pt = [U * 0.26, TOP + U * 0.14];
      const droite: Pt = [U * 0.36, TOP + U * 0.15];
      const contour: Pt[] = [
        gauche,
        ...quadratique(gauche, [U * 0.3, TOP - U * 0.12], pointe, 14),
        ...quadratique(pointe, [U * 0.44, TOP - U * 0.02], droite, 14),
      ];
      f.peint(FEUILLE, MAT_MAT).save();
      f.translate(0, 0, DEVANT);
      f.rotateY(-0.5);
      f.extrude(contour, -U * 0.02, U * 0.02);
      // La nervure, en relief cette fois.
      f.peint(FEUILLE_OMBRE, MAT_MAT);
      const nervure: Pt[] = [
        [U * 0.3, TOP + U * 0.14],
        ...quadratique([U * 0.3, TOP + U * 0.14], [U * 0.36, TOP - U * 0.08], [U * 0.47, TOP - U * 0.25], 12),
      ];
      f.ruban(nervure, U * 0.028, U * 0.02, U * 0.032);
      f.restore();
    },
  },

  casquette: {
    corps(f) {
      f.peint(DENIM, MAT_MAT).save();
      f.translate(0, TOP + U * 0.04, 0);
      f.sphere([U * 0.36, U * 0.26, PROF_TETE], 0.5, 26, 12);
      f.restore();
      // La visière part sur le côté, comme dans le dessin.
      f.peint(DENIM_OMBRE, MAT_MAT);
      plaque(f, arc(U * 0.34, TOP + U * 0.03, U * 0.3, U * 0.08, 0, Math.PI * 2, 28), U * 0.05);
      f.peint(DENIM_OMBRE, MAT_MAT).save();
      f.translate(0, TOP - U * 0.22, 0);
      f.sphere([U * 0.04, U * 0.04, U * 0.04], 1, 12, 8);
      f.restore();
    },
  },

  bonnet: {
    corps(f) {
      f.peint(LAINE, MAT_MAT).save();
      f.translate(0, TOP + U * 0.01, 0);
      f.sphere([U * 0.34, U * 0.27, PROF_TETE], 0.5, 26, 12);
      f.restore();
      // Le revers roulé : un bourrelet, pas une barrette.
      f.peint(LAINE_OMBRE, MAT_MAT);
      plaque(f, rectArrondi(-U * 0.4, TOP - U * 0.06, U * 0.8, U * 0.14, U * 0.07), U * 0.06);
      f.peint(CREME, MAT_MAT).save();
      f.translate(0, TOP - U * 0.3, 0);
      f.sphere([U * 0.1, U * 0.1, U * 0.1], 1, 16, 12);
      f.restore();
    },
  },

  fete: {
    corps(f) {
      // Le cône, en quatre bandes : les rayures du dessin deviennent des
      // anneaux, ce qui les fait tourner avec le chapeau.
      const base = TOP + U * 0.06;
      const sommet = TOP - U * 0.34;
      const R = U * 0.24;
      const bandes = 8;
      for (let i = 0; i < bandes; i++) {
        const t0 = i / bandes, t1 = (i + 1) / bandes;
        f.peint(i % 2 === 0 ? JAUNE : ROSE, MAT_MAT);
        f.revolution(
          [
            [R * (1 - t0), base + (sommet - base) * t0],
            [R * (1 - t1), base + (sommet - base) * t1],
          ],
          26,
          false,
          PROF_TETE / R,
        );
      }
      f.peint(JAUNE_OMBRE, MAT_MAT);
      f.revolution([[0, base], [R, base]], 26, false, PROF_TETE / R);
      f.peint(BLANC, MAT_MAT).save();
      f.translate(0, TOP - U * 0.38, 0);
      f.sphere([U * 0.08, U * 0.08, U * 0.08], 1, 16, 12);
      f.restore();
    },
  },

  sorcier: {
    corps(f) {
      f.peint(NUIT_OMBRE, MAT_MAT);
      plaque(f, arc(0, TOP + U * 0.04, U * 0.52, U * 0.1, 0, Math.PI * 2, 34), U * 0.055);
      // La pointe ploie : on suit la même courbe que le tracé 2D, en cônes.
      f.peint(NUIT, MAT_MAT);
      const axe: Pt[] = [
        [0, TOP + U * 0.04],
        ...quadratique([0, TOP + U * 0.04], [-U * 0.03, TOP - U * 0.27], [U * 0.14, TOP - U * 0.5], 8),
      ];
      for (let i = 0; i + 1 < axe.length; i++) {
        const t0 = i / (axe.length - 1), t1 = (i + 1) / (axe.length - 1);
        f.tube(
          [axe[i][0], axe[i][1], 0],
          [axe[i + 1][0], axe[i + 1][1], 0],
          U * 0.26 * (1 - t0) + U * 0.01,
          U * 0.26 * (1 - t1) + U * 0.01,
          20,
        );
      }
      f.peint(OR, MAT_METAL);
      f.extrude(etoile(-U * 0.05, TOP - U * 0.16, U * 0.07), U * 0.14, U * 0.19);
      f.extrude(etoile(U * 0.09, TOP - U * 0.32, U * 0.05), U * 0.1, U * 0.14);
    },
  },

  hautForme: {
    corps(f) {
      f.peint(NOIR, MAT_MAT);
      plaque(f, arc(0, TOP + U * 0.03, U * 0.46, U * 0.09, 0, Math.PI * 2, 34), U * 0.05);
      f.peint(NOIR_CLAIR, MAT_MAT);
      f.revolution(
        [
          [U * 0.26, TOP + U * 0.05],
          [U * 0.26, TOP - U * 0.36],
          [U * 0.24, TOP - U * 0.4],
          [0, TOP - U * 0.4],
        ],
        30,
        false,
        PROF_TETE / (U * 0.26),
      );
      // Le ruban passe devant la calotte : à son rayon exact, les deux surfaces
      // se disputaient le même pixel.
      f.peint(ROUGE, MAT_MAT);
      plaque(f, rectArrondi(-U * 0.26, TOP - U * 0.09, U * 0.52, U * 0.1, U * 0.02), U * 0.04, U * 0.07);
    },
  },

  viking: {
    corps(f) {
      f.peint(METAL, MAT_METAL).save();
      f.translate(0, TOP + U * 0.05, 0);
      f.sphere([U * 0.33, U * 0.27, PROF_TETE], 0.5, 26, 12);
      f.restore();
      f.peint(METAL_OMBRE, MAT_METAL);
      plaque(f, rectArrondi(-U * 0.36, TOP + U * 0.01, U * 0.72, U * 0.06, U * 0.03), U * 0.04);
      // Le nasal, plaqué sur le devant du casque.
      f.peint(METAL_OMBRE, MAT_METAL);
      f.extrude(rectArrondi(-U * 0.035, TOP - U * 0.22, U * 0.07, U * 0.26, U * 0.02), DEVANT - U * 0.03, DEVANT + U * 0.02);
      // Les cornes suivent la courbe du dessin, en cônes chaînés.
      f.peint(CREME, MAT_MAT);
      for (const s of [-1, 1]) {
        const axe: Pt[] = [
          [s * U * 0.29, TOP - U * 0.02],
          ...quadratique([s * U * 0.29, TOP - U * 0.02], [s * U * 0.5, TOP - U * 0.09], [s * U * 0.49, TOP - U * 0.33], 7),
        ];
        for (let i = 0; i + 1 < axe.length; i++) {
          const t0 = i / (axe.length - 1), t1 = (i + 1) / (axe.length - 1);
          f.tube(
            [axe[i][0], axe[i][1], 0],
            [axe[i + 1][0], axe[i + 1][1], 0],
            U * 0.075 * (1 - t0) + U * 0.008,
            U * 0.075 * (1 - t1) + U * 0.008,
            12,
          );
        }
      }
    },
  },

  chat: {
    corps(f) {
      for (const s of [-1, 1]) {
        f.peint(NOIR_CLAIR, MAT_MAT).save();
        f.translate(0, 0, 0);
        f.rotateY(s * 0.35);
        f.extrude(
          [
            [s * U * 0.1, TOP + U * 0.05],
            [s * U * 0.26, TOP - U * 0.3],
            [s * U * 0.42, TOP + U * 0.02],
          ],
          -U * 0.05,
          U * 0.05,
        );
        f.peint(ROSE, MAT_MAT);
        f.extrude(
          [
            [s * U * 0.18, TOP + U * 0.02],
            [s * U * 0.26, TOP - U * 0.18],
            [s * U * 0.34, TOP + U * 0.01],
          ],
          U * 0.05,
          U * 0.07,
        );
        f.restore();
      }
    },
  },

  bois: {
    corps(f) {
      f.peint(BOIS, MAT_MAT);
      const r = U * 0.03;
      for (const s of [-1, 1]) {
        const tronc: Pt[] = [
          [s * U * 0.16, TOP + U * 0.04],
          ...quadratique([s * U * 0.16, TOP + U * 0.04], [s * U * 0.3, TOP - U * 0.2], [s * U * 0.26, TOP - U * 0.42], 8),
        ];
        for (let i = 0; i + 1 < tronc.length; i++) {
          const k = 1 - (i / tronc.length) * 0.35;
          f.tube([tronc[i][0], tronc[i][1], 0], [tronc[i + 1][0], tronc[i + 1][1], 0], r * k, r * k * 0.96, 10);
        }
        f.tube([s * U * 0.25, TOP - U * 0.14, 0], [s * U * 0.46, TOP - U * 0.26, 0], r * 0.85, r * 0.6, 10);
        f.tube([s * U * 0.28, TOP - U * 0.3, 0], [s * U * 0.44, TOP - U * 0.44, 0], r * 0.8, r * 0.55, 10);
      }
    },
  },

  fleurs: {
    corps(f) {
      // La couronne est une bande courbe posée devant le front, et les fleurs
      // s'y accrochent aux mêmes abscisses que dans le dessin.
      f.peint(FEUILLE, MAT_MAT);
      f.ruban(arc(0, TOP + U * 0.02, U * 0.4, U * 0.14, Math.PI, Math.PI * 2, 24), U * 0.05, DEVANT, DEVANT + U * 0.035);
      for (const [x, y, couleur] of [
        [-U * 0.3, TOP - U * 0.03, BLANC],
        [0, TOP - U * 0.12, ROSE],
        [U * 0.3, TOP - U * 0.03, BLANC],
      ] as const) {
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          f.peint(couleur, MAT_MAT).save();
          f.translate(x + Math.cos(a) * U * 0.06, y + Math.sin(a) * U * 0.06, DEVANT + U * 0.04);
          f.sphere([U * 0.05, U * 0.05, U * 0.04], 1, 12, 8);
          f.restore();
        }
        f.peint(OR, MAT_METAL).save();
        f.translate(x, y, DEVANT + U * 0.06);
        f.sphere([U * 0.045, U * 0.045, U * 0.035], 1, 12, 8);
        f.restore();
      }
    },
  },

  chantier: {
    corps(f) {
      f.peint(JAUNE, MAT_MAT).save();
      f.translate(0, TOP + U * 0.04, 0);
      f.sphere([U * 0.34, U * 0.27, PROF_TETE], 0.5, 26, 12);
      f.restore();
      f.peint(JAUNE_OMBRE, MAT_MAT);
      plaque(f, arc(0, TOP + U * 0.05, U * 0.46, U * 0.09, Math.PI, Math.PI * 2, 30), U * 0.05);
      // La nervure court d'avant en arrière : c'est la crête du casque.
      f.peint(JAUNE_OMBRE, MAT_MAT).save();
      f.translate(0, TOP - U * 0.005, 0);
      f.rotateY(Math.PI / 2);
      f.revolution([[U * 0.005, -PROF_TETE], [U * 0.035, 0], [U * 0.005, PROF_TETE]], 10, false, 1);
      f.restore();
    },
  },

  bandana: {
    corps(f) {
      f.peint(ROUGE, MAT_MAT).save();
      f.translate(0, TOP + U * 0.1, 0);
      f.sphere([U * 0.42, U * 0.32, PROF_TETE], 0.5, 26, 12);
      f.restore();
      // Le nœud sur le côté, extrudé du même triangle que le dessin.
      f.peint(ROUGE_OMBRE, MAT_MAT);
      f.extrude(
        [
          [-U * 0.4, TOP + U * 0.04],
          [-U * 0.56, TOP + U * 0.16],
          [-U * 0.38, TOP + U * 0.16],
        ],
        -U * 0.06,
        U * 0.06,
      );
      f.peint(BLANC, MAT_MAT);
      for (const [x, y] of [
        [-U * 0.24, TOP - U * 0.02],
        [0, TOP - U * 0.08],
        [U * 0.24, TOP - U * 0.02],
      ]) {
        const k = Math.sqrt(Math.max(0, 1 - (x / (U * 0.42)) ** 2 - ((y - (TOP + U * 0.1)) / (U * 0.32)) ** 2));
        f.save();
        f.translate(x, y, k * PROF_TETE);
        f.sphere([U * 0.032, U * 0.032, U * 0.02], 1, 10, 8);
        f.restore();
      }
    },
  },

  helice: {
    corps(f) {
      f.peint(ROUGE, MAT_MAT).save();
      f.translate(0, TOP + U * 0.06, 0);
      f.sphere([U * 0.3, U * 0.21, PROF_TETE], 0.5, 24, 12);
      f.restore();
      f.peint(CIEL, MAT_MAT);
      plaque(f, rectArrondi(-U * 0.34, TOP + U * 0.01, U * 0.68, U * 0.08, U * 0.04), U * 0.045);
      f.peint(JAUNE, MAT_MAT).save();
      f.translate(0, TOP - U * 0.16, 0);
      f.sphere([U * 0.04, U * 0.05, U * 0.04], 1, 12, 8);
      f.restore();
    },
    mobile(f) {
      // Le plan de l'hélice est incliné : à plat, il se verrait de profil et
      // il n'en resterait qu'un trait.
      f.rotateX(-0.42);
      f.peint(BLANC, MAT_MAT);
      for (const s of [-1, 1]) {
        f.save();
        f.translate(s * U * 0.16, 0, 0);
        f.sphere([U * 0.16, U * 0.02, U * 0.045], 1, 14, 8);
        f.restore();
      }
      f.peint(ROUGE_OMBRE, MAT_MAT);
      f.sphere([U * 0.038, U * 0.03, U * 0.038], 1, 12, 8);
    },
    poseMobile(t) {
      return { y: TOP - U * 0.19, angle: t / 260 };
    },
  },

  aureole: {
    corps(f) {
      f.peint(OR, MAT_LUMIERE).save();
      f.rotateX(penche(U * 0.28, U * 0.085));
      f.tore(U * 0.28, U * 0.0375, Math.PI * 2, 40, 10);
      f.restore();
    },
    flotte(t) {
      return TOP - U * 0.24 + Math.sin(t / 520) * U * 0.035;
    },
  },
};

// --- lunettes --------------------------------------------------------------

/** Le pont et les branches, communs aux montures. */
function monture(f: Forge, r: number, epaisseur: number) {
  const z = Z + U * 0.03;
  f.tube([-EYE_X + r * 0.8, EYE_Y, z], [EYE_X - r * 0.8, EYE_Y, z], epaisseur, epaisseur, 8);
  for (const s of [-1, 1]) {
    f.tube(
      [s * (EYE_X + r), EYE_Y - U * 0.02, z],
      [s * (EYE_X + r + U * 0.16), EYE_Y - U * 0.06, z - U * 0.12],
      epaisseur,
      epaisseur * 0.85,
      8,
    );
  }
}

const LUNETTES: Partial<Record<GlassKind, Objet3D>> = {
  rondes: {
    corps(f) {
      const r = U * 0.2;
      f.peint(teinte('#243448'), MAT_METAL);
      for (const s of [-1, 1]) {
        f.save();
        f.translate(s * EYE_X, EYE_Y, Z + U * 0.03);
        f.rotateX(Math.PI / 2);
        f.tore(r, U * 0.0225, Math.PI * 2, 32, 8);
        f.restore();
      }
      monture(f, r, U * 0.0225);
    },
    verre(f) {
      f.peint(VERRE_BLEU, MAT_VERRE);
      for (const s of [-1, 1]) {
        f.save();
        f.translate(s * EYE_X, EYE_Y, Z + U * 0.028);
        f.sphere([U * 0.19, U * 0.19, U * 0.012], 1, 20, 12);
        f.restore();
      }
    },
  },

  carrees: {
    corps(f) {
      const r = U * 0.2;
      f.peint(BOIS, MAT_MAT);
      for (const s of [-1, 1]) {
        f.ruban(
          rectArrondi(s * EYE_X - r, EYE_Y - r * 0.85, 2 * r, 1.7 * r, U * 0.05),
          U * 0.045,
          Z + U * 0.02,
          Z + U * 0.045,
          true,
        );
      }
      monture(f, r, U * 0.0225);
    },
    verre(f) {
      f.peint(VERRE_BLEU, MAT_VERRE);
      const r = U * 0.2;
      for (const s of [-1, 1]) {
        f.extrude(
          rectArrondi(s * EYE_X - r * 0.94, EYE_Y - r * 0.8, 1.88 * r, 1.6 * r, U * 0.05),
          Z + U * 0.026,
          Z + U * 0.032,
        );
      }
    },
  },

  soleil: {
    corps(f) {
      const r = U * 0.2;
      f.peint(teinte('#243448'), MAT_METAL);
      for (const s of [-1, 1]) {
        f.save();
        f.translate(s * EYE_X, EYE_Y, Z + U * 0.03);
        f.rotateX(Math.PI / 2);
        f.tore(r, U * 0.0225, Math.PI * 2, 32, 8);
        f.restore();
      }
      monture(f, r, U * 0.0225);
    },
    verre(f) {
      // Le verre fumé est presque opaque : c'est lui qui fait les lunettes de
      // soleil, et il attrape un reflet net en tournant.
      f.peint(teinte('#121622'), MAT_VERRE);
      for (const s of [-1, 1]) {
        f.save();
        f.translate(s * EYE_X, EYE_Y, Z + U * 0.028);
        f.sphere([U * 0.19, U * 0.19, U * 0.02], 1, 20, 12);
        f.restore();
      }
    },
  },

  coeur: {
    corps(f) {
      const r = U * 0.2;
      f.peint(ROSE, MAT_MAT);
      for (const s of [-1, 1]) {
        f.ruban(coeurPts(s * EYE_X, EYE_Y, r * 0.95), U * 0.045, Z + U * 0.02, Z + U * 0.045, true);
      }
      monture(f, r, U * 0.0225);
    },
    verre(f) {
      f.peint(teinte('#F58BB0'), MAT_VERRE);
      for (const s of [-1, 1]) {
        f.extrude(coeurPts(s * EYE_X, EYE_Y, U * 0.185), Z + U * 0.026, Z + U * 0.032);
      }
    },
  },

  plongee: {
    corps(f) {
      f.peint(ROUGE, MAT_MAT);
      f.ruban(
        rectArrondi(-U * 0.42, EYE_Y - U * 0.24, U * 0.84, U * 0.44, U * 0.14),
        U * 0.075,
        Z - U * 0.02,
        Z + U * 0.06,
        true,
      );
      f.peint(ROUGE_OMBRE, MAT_MAT);
      f.extrude(rectArrondi(-U * 0.025, EYE_Y - U * 0.18, U * 0.05, U * 0.32, U * 0.02), Z + U * 0.05, Z + U * 0.07);
      // La sangle passe derrière la tête : c'est elle qui tient le masque.
      f.tube([-U * 0.44, EYE_Y - U * 0.06, Z - U * 0.02], [-U * 0.48, EYE_Y - U * 0.1, -Z], U * 0.03, U * 0.03, 8);
      f.tube([U * 0.44, EYE_Y - U * 0.06, Z - U * 0.02], [U * 0.48, EYE_Y - U * 0.1, -Z], U * 0.03, U * 0.03, 8);
      // Le tuba, en tubes chaînés le long de la même courbe qu'en 2D.
      f.peint(JAUNE, MAT_MAT);
      const axe: Pt[] = [
        [U * 0.42, EYE_Y + U * 0.12],
        ...quadratique([U * 0.42, EYE_Y + U * 0.12], [U * 0.56, EYE_Y - U * 0.05], [U * 0.5, EYE_Y - U * 0.3], 8),
      ];
      for (let i = 0; i + 1 < axe.length; i++) {
        f.tube([axe[i][0], axe[i][1], DEVANT], [axe[i + 1][0], axe[i + 1][1], DEVANT], U * 0.035, U * 0.035, 10);
      }
    },
    verre(f) {
      f.peint(VERRE_BLEU, MAT_VERRE);
      f.extrude(rectArrondi(-U * 0.36, EYE_Y - U * 0.18, U * 0.72, U * 0.32, U * 0.1), Z + U * 0.02, Z + U * 0.03);
    },
  },

  cache: {
    corps(f) {
      f.peint(NOIR, MAT_MAT).save();
      f.translate(-EYE_X, EYE_Y, Z + U * 0.01);
      f.sphere([U * 0.19, U * 0.17, U * 0.05], 1, 20, 12);
      f.restore();
      // La sangle fait le tour de la tête, comme le trait qui traverse en 2D.
      f.peint(NOIR, MAT_MAT);
      f.ruban(
        [
          [-U * 0.5, EYE_Y - U * 0.16],
          [U * 0.5, EYE_Y - U * 0.06],
        ],
        U * 0.045,
        DEVANT,
        DEVANT + U * 0.03,
      );
    },
  },
};

// --- autour du cou ---------------------------------------------------------

const ECHARPES: Partial<Record<ScarfKind, Objet3D>> = {
  echarpe: {
    corps(f) {
      f.peint(LAINE, MAT_MAT);
      plaque(f, rectArrondi(-U * 0.46, NECK - U * 0.05, U * 0.92, U * 0.13, U * 0.06), U * 0.06);
      f.peint(LAINE, MAT_MAT);
      f.extrude(rectArrondi(U * 0.16, NECK + U * 0.02, U * 0.13, U * 0.18, U * 0.05), DEVANT, DEVANT + U * 0.06);
      f.peint(CREME, MAT_MAT);
      for (const x of [-U * 0.32, -U * 0.06, U * 0.2]) {
        plaque(f, rectArrondi(x, NECK - U * 0.05, U * 0.06, U * 0.13, U * 0.01), U * 0.012, U * 0.06);
      }
      f.peint(CREME, MAT_MAT);
      f.extrude(
        [
          [U * 0.18, NECK + U * 0.12],
          [U * 0.27, NECK + U * 0.12],
          [U * 0.27, NECK + U * 0.17],
          [U * 0.18, NECK + U * 0.17],
        ],
        DEVANT + U * 0.06,
        DEVANT + U * 0.07,
      );
    },
  },

  noeud: {
    corps(f) {
      f.peint(ROUGE, MAT_MAT).save();
      f.translate(0, NECK, DEVANT + U * 0.02);
      for (const s of [-1, 1]) {
        // Chaque aile est un triangle gonflé : elle prend la lumière au lieu
        // de rester une découpe de papier.
        f.save();
        f.rotateY(s * 0.25);
        f.extrude(
          [
            [0, 0],
            [s * U * 0.19, -U * 0.11],
            [s * U * 0.19, U * 0.11],
          ],
          -U * 0.035,
          U * 0.035,
        );
        f.restore();
      }
      f.peint(BLANC, MAT_MAT);
      for (const [x, y] of [
        [-U * 0.13, -U * 0.03],
        [-U * 0.11, U * 0.05],
        [U * 0.13, -U * 0.03],
        [U * 0.11, U * 0.05],
      ]) {
        f.save();
        f.translate(x, y, U * 0.035);
        f.sphere([U * 0.022, U * 0.022, U * 0.014], 1, 10, 6);
        f.restore();
      }
      f.peint(ROUGE_OMBRE, MAT_MAT);
      f.sphere([U * 0.048, U * 0.048, U * 0.048], 1, 14, 10);
      f.restore();
    },
  },

  foulard: {
    corps(f) {
      f.peint(CIEL, MAT_MAT).save();
      f.translate(0, 0, DEVANT + U * 0.02);
      f.rotateX(-0.25);
      const pointe: Pt = [0, NECK + U * 0.22];
      f.extrude(
        [
          [-U * 0.3, NECK - U * 0.06],
          [U * 0.3, NECK - U * 0.06],
          ...quadratique([U * 0.3, NECK - U * 0.06], [U * 0.12, NECK + U * 0.2], pointe, 8),
          ...quadratique(pointe, [-U * 0.12, NECK + U * 0.2], [-U * 0.3, NECK - U * 0.06], 8),
        ],
        -U * 0.02,
        U * 0.02,
      );
      f.restore();
      f.peint(teinte('#A8DFF2'), MAT_MAT);
      plaque(f, rectArrondi(-U * 0.32, NECK - U * 0.1, U * 0.64, U * 0.07, U * 0.03), U * 0.04, U * 0.03);
    },
  },

  colRoule: {
    corps(f) {
      f.peint(teinte('#6D7896'), MAT_MAT);
      plaque(f, rectArrondi(-U * 0.34, NECK - U * 0.1, U * 0.68, U * 0.24, U * 0.09), U * 0.09, -U * 0.04);
    },
  },

  medaille: {
    corps(f) {
      f.peint(CIEL, MAT_MAT);
      f.tube([-U * 0.18, NECK - U * 0.12, DEVANT], [0, NECK + U * 0.06, DEVANT + U * 0.03], U * 0.025, U * 0.025, 8);
      f.tube([U * 0.18, NECK - U * 0.12, DEVANT], [0, NECK + U * 0.06, DEVANT + U * 0.03], U * 0.025, U * 0.025, 8);
      f.peint(OR, MAT_METAL).save();
      f.translate(0, NECK + U * 0.13, DEVANT + U * 0.04);
      f.rotateX(Math.PI / 2);
      f.revolution(
        [
          [0, -U * 0.02],
          [U * 0.09, -U * 0.022],
          [U * 0.11, -U * 0.008],
          [U * 0.11, U * 0.008],
          [U * 0.09, U * 0.022],
          [0, U * 0.02],
        ],
        26,
        false,
        1,
      );
      f.restore();
      f.peint(OR_OMBRE, MAT_METAL);
      f.extrude(etoile(0, NECK + U * 0.13, U * 0.055), DEVANT + U * 0.06, DEVANT + U * 0.075);
    },
  },

  cape: {
    corps(f) {
      f.peint(ROUGE_OMBRE, MAT_MAT).save();
      f.translate(0, 0, -Z - U * 0.03);
      for (const s of [-1, 1]) {
        const haut: Pt = [s * U * 0.26, NECK - U * 0.06];
        const bas: Pt = [s * U * 0.52, NECK + U * 0.82];
        f.save();
        f.rotateY(s * 0.3);
        f.extrude(
          [
            haut,
            ...quadratique(haut, [s * U * 0.64, NECK + U * 0.3], bas, 10),
            ...quadratique(bas, [s * U * 0.36, NECK + U * 0.52], [s * U * 0.2, NECK + U * 0.12], 10),
          ],
          -U * 0.02,
          U * 0.02,
        );
        f.restore();
      }
      f.restore();
      f.peint(ROUGE, MAT_MAT);
      plaque(f, rectArrondi(-U * 0.32, NECK - U * 0.11, U * 0.64, U * 0.13, U * 0.065), U * 0.06);
    },
  },
};

const TABLES = { hat: CHAPEAUX, glasses: LUNETTES, scarf: ECHARPES } as const;

/** Les emplacements qui passent en volume : des objets, pas de la pilosité. */
export type SlotObjet = keyof typeof TABLES;
export const SLOTS_OBJETS: readonly SlotObjet[] = ['hat', 'glasses', 'scarf'];

export function objet3D(slot: SlotObjet, piece: string): Objet3D | undefined {
  return (TABLES[slot] as Record<string, Objet3D | undefined>)[piece];
}
