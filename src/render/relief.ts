/**
 * Le rendu en relief : les blocs et les objets de la garde-robe en WebGL.
 *
 * Il ne remplace pas le moteur 2D, il s'y glisse. La scène reste dessinée au
 * canvas — ciel, sol, ombres, trappe, pastilles, étincelles — et le relief
 * s'intercale en deux passes, à l'endroit exact où le renderer dessinait ses
 * blocs :
 *
 *   décor 2D → **corps + capes + écharpes** → visages 2D → **chapeaux + lunettes**
 *
 * Les deux passes partagent le même tampon de profondeur (seule la couleur est
 * effacée entre elles), et chaque bloc reçoit un z tiré de son ordre de dessin.
 * Un chapeau porté par un bloc du fond passe donc bien derrière le bloc de
 * devant, alors même qu'il est peint après lui.
 *
 * La caméra est **en perspective**, l'œil au milieu de l'écran. Le plan médian
 * d'un bloc y tombe exactement là où le moteur 2D le place — ombres, pastilles
 * et aperçus restent donc calés — mais sa face avant, plus proche de l'œil,
 * grandit d'un centième et s'écarte du centre. Le visage au trait, qui se peint
 * sur cette face, reçoit la même homothétie (`avantPlan`) : sans elle, il
 * glisserait du corps dès qu'un bloc s'éloigne du milieu.
 */
import { UNIT } from '../core/constants';
import { colorFor } from '../core/palette';
import { centeredOf } from '../core/shape';
import type { Shape } from '../core/shape';
import { matiereFor } from '../core/matieres';
import type { Skin } from '../core/matieres';
import { NU, lookFor } from '../core/wardrobe';
import type { ResolvedLook, Wardrobe } from '../core/wardrobe';
import { Forge, MAT_MAT, teinte } from './mesh';
import type { Maille, Vec3 } from './mesh';
import { Z, objet3D } from './objets3d';
import type { SlotObjet } from './objets3d';

const VERT = `
attribute vec3 aPos;
attribute vec3 aNor;
attribute vec3 aCol;
attribute float aMat;
attribute vec3 aLocal;
attribute vec2 aGrain;
uniform mat4 uProj;
uniform mat4 uModele;
uniform mat4 uNormale;
uniform float uBiais;
varying vec3 vN;
varying vec3 vP;
varying vec3 vCol;
varying float vMat;
varying vec3 vLocal;
varying vec2 vGrain;
void main() {
  vec4 monde = uModele * vec4(aPos, 1.0);
  vN = mat3(uNormale) * aNor;
  vP = monde.xyz;
  vCol = aCol;
  vMat = aMat;
  vLocal = aLocal;
  vGrain = aGrain;
  gl_Position = uProj * monde;
  // Le rang de dessin ne se traduit pas en recul — il fausserait la taille
  // sous une perspective — mais en simple décalage de profondeur.
  gl_Position.z += uBiais * gl_Position.w;
}`;

/**
 * L'éclairage est volontairement doux : la couleur d'un bloc dit quel nombre
 * on regarde. Un éclairage de studio, plus joli sur un objet isolé, ferait
 * bouger cette couleur avec l'orientation et brouillerait la lecture.
 *
 * Deux précautions valent pour les téléphones, où le fragment tourne en
 * demi-précision (`mediump` = seize bits) alors qu'un ordinateur lui donne
 * silencieusement trente-deux :
 *
 *   - on demande `highp` dès que la carte sait le faire ;
 *   - aucune `pow()` ne reçoit une base nulle, négative ou supérieure à un.
 *
 * `pow(0.0, n)` est **indéfini** dans la norme GLSL ES, et plusieurs pilotes
 * mobiles renvoient NaN. Un seul NaN suffit : il traverse toute la formule et
 * le pixel finit à zéro, c'est-à-dire en noir opaque. C'est ce qui éteignait
 * des faces entières sur téléphone pendant que le rendu restait juste sur
 * ordinateur.
 */
const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec3 vN;
varying vec3 vP;
varying vec3 vCol;
varying float vMat;
varying vec3 vLocal;
varying vec2 vGrain;
uniform vec3 uOeil;
/** Une puissance dont la base ne peut ni s'annuler ni dépasser un. */
float serre(float cosinus, float durete) {
  return pow(clamp(cosinus, 0.002, 1.0), durete);
}
vec3 ciel(vec3 d) {
  float t = clamp(-d.y * 0.5 + 0.5, 0.0, 1.0);
  // Le bas n'est pas le vide : c'est le sol de la scène, qui renvoie sa part
  // de lumière. Presque noir, il éteignait tout ce qui regarde vers le bas —
  // sur un écran de téléphone, c'est la moitié des faces d'un bloc posé.
  vec3 c = mix(vec3(0.19, 0.21, 0.27), vec3(0.42, 0.48, 0.65), t);
  float lampe = serre(dot(d, normalize(vec3(-0.5, -0.76, 0.42))), 24.0);
  return c + vec3(1.0, 0.93, 0.74) * lampe * 1.6;
}
/**
 * Un bruit de poche. Les constantes restent petites à dessein : sur un
 * téléphone en demi-précision, un sinus nourri de grands nombres ne rend plus
 * du hasard mais des bandes.
 */
float bruit(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 4375.85);
}

/**
 * Le grain, rendu comme un facteur autour de 1 : la matière garde sa couleur,
 * le grain ne fait que la moduler. Aucune puissance ici — la norme laisse
 * pow() indéfinie sur une base nulle, et un seul NaN suffit à noircir le pixel.
 *
 * q est en pixels, dans le repère du cube : un cube fait 36 de côté, donc q va
 * de -18 à 18. C'est ce qui accroche le grain à sa case.
 */
float grain(float type, float graine, vec3 q) {
  float phase = graine * 6.2831;
  if (type < 0.5) return 1.0;
  if (type < 1.5) {
    // Bois : des veines le long du cube, ondulées pour n'être jamais droites.
    float t = q.x * 0.055 + sin(q.y * 0.07 + phase) * 0.55 + graine;
    float v = fract(t);
    float veine = smoothstep(0.0, 0.30, v) * smoothstep(1.0, 0.70, v);
    return mix(0.84, 1.07, veine);
  }
  if (type < 2.5) {
    // Pierre : une moucheture par petits carreaux, plutôt qu'un bruit fin qui
    // scintille dès que le bloc bouge.
    float n = bruit(floor(q.xy * 0.42) + graine * 37.0);
    return mix(0.80, 1.14, n);
  }
  if (type < 3.5) {
    // Brique : des rangées décalées d'une demi-brique, et le mortier clair.
    float rang = floor((q.y + 18.0) / 9.0);
    float bx = fract((q.x + 18.0 + mod(rang, 2.0) * 9.0) / 18.0);
    float by = fract((q.y + 18.0) / 9.0);
    float dedans = smoothstep(0.0, 0.10, bx) * smoothstep(1.0, 0.90, bx)
                 * smoothstep(0.0, 0.20, by) * smoothstep(1.0, 0.80, by);
    float teinte = bruit(vec2(rang, floor((q.x + mod(rang, 2.0) * 9.0) / 18.0)) + graine);
    return mix(1.34, mix(0.92, 1.06, teinte), dedans);
  }
  if (type < 4.5) {
    // Herbe, terre : un grain fin, sans motif qu'on puisse suivre des yeux.
    return mix(0.86, 1.10, bruit(q.xy * 1.7 + graine * 53.0));
  }
  if (type < 5.5) {
    // Acier brossé : des stries dans un seul sens.
    return mix(0.88, 1.10, bruit(vec2(floor(q.y * 1.1), graine * 61.0)));
  }
  // Cristal : des facettes larges, plates, qui cassent la lumière par bandes.
  float f = abs(fract(q.x * 0.06 + q.y * 0.037 + graine) - 0.5);
  return mix(0.82, 1.18, smoothstep(0.08, 0.42, f));
}

void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(uOeil - vP);
  // Éclairage recto-verso : on retourne la normale d'après le regard, pas
  // d'après l'enroulement du triangle. La face arrière d'un verre gardait
  // sinon une normale à l'opposé, son terme de bord montait à 1 et la
  // monture devenait un carreau plein.
  if (dot(N, V) < 0.0) N = -N;
  vec3 L = normalize(vec3(-0.6, -0.8, 0.62));
  vec3 H = normalize(L + V);
  float diff = max(dot(N, L), 0.0);
  float spec = serre(dot(N, H), 60.0);
  float bord = serre(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 refl = ciel(reflect(-V, N));
  // La matière garde sa couleur, le grain ne fait que la moduler — et il tient
  // à sa case, puisqu'il se calcule dans le repère du cube.
  vec3 base = clamp(vCol * grain(vGrain.x, vGrain.y, vLocal), 0.0, 1.0);
  vec3 c;
  float alpha = 1.0;
  // Une seule source, comme dans le dessin. Une lampe d'appoint relevait bien
  // les faces sombres, mais elle éclairait aussi les arêtes par-derrière et
  // finissait par délaver les blocs clairs. Ce qui a monté, c'est le fond :
  // la part de lumière qui ne vient d'aucune direction.
  if (vMat < 0.5) {
    // Mat : plastique, laine, feutre.
    c = base * (0.65 + 0.44 * diff) + base * refl * 0.15 + vec3(1.0) * spec * 0.14 + base * bord * 0.26;
  } else if (vMat < 1.5) {
    // Métal : il n'existe que par ce qu'il reflète.
    c = base * (0.24 + 0.42 * diff) + base * refl * 1.15 + vec3(1.0, 0.96, 0.86) * spec * 0.8;
  } else if (vMat < 2.5) {
    // Verre : transparent sur la face, opaque de biais — et d'autant plus
    // couvrant qu'il est sombre. Sans cette part-là, les lunettes de soleil
    // laissaient voir les yeux comme une paire de lunettes de vue.
    float teinte = 1.0 - dot(base, vec3(0.3, 0.6, 0.1));
    c = mix(refl, base * 0.7, 0.4) + vec3(1.0) * spec * 1.5 + base * bord * 0.5;
    alpha = clamp(0.18 + teinte * 0.5 + bord * 0.5 + spec, 0.0, 1.0);
  } else if (vMat < 3.5) {
    // Lumière : l'auréole ne s'éteint jamais.
    c = base * (0.9 + 0.25 * diff) + base * bord * 1.5 + vec3(1.0) * spec * 0.5;
  } else {
    // Gemme.
    c = base * (0.3 + 0.7 * diff) + refl * 0.3 + vec3(1.0) * spec * 1.4 + base * bord * 0.7;
  }
  // Filet de sécurité : si un pilote a quand même sorti un NaN, on rend la
  // couleur du bloc. Le relief se perd sur ce pixel, la lecture non — alors
  // qu'un NaN, lui, donne du noir. La comparaison est fausse dans les deux
  // sens quand la valeur est un NaN : c'est le seul test qui le repère.
  if (!(c.r >= 0.0) || !(c.g >= 0.0) || !(c.b >= 0.0)) c = vCol;
  c = max(c, 0.0);
  // Écrêtage qui garde la teinte : diviser par le canal le plus fort plutôt
  // que de couper chaque canal séparément. Sans ça, un bloc clair voit son
  // bleu buter à 1 pendant que le rouge monte encore, et il vire au blanc.
  float fort = max(max(c.r, max(c.g, c.b)), 1.0);
  alpha = clamp(alpha, 0.0, 1.0);
  gl_FragColor = vec4(c / fort * alpha, alpha);
}`;

interface Tampons {
  pos: WebGLBuffer;
  nor: WebGLBuffer;
  col: WebGLBuffer;
  mat: WebGLBuffer;
  local: WebGLBuffer;
  grain: WebGLBuffer;
  nb: number;
}

export interface BlocRelief {
  value: number;
  /** Signature de la maille, calculée à la naissance du bloc. */
  cle: string;
  shape: Shape;
  /** Matière de chaque cube, sur un chantier. Absente au mode nombre. */
  skin?: Skin[];
  x: number;
  y: number;
  angle: number;
  sx: number;
  sy: number;
  /**
   * Échelle de la **profondeur**. Le zoom du chantier est une homothétie
   * uniforme : sans elle, un bloc dézoomé garderait son épaisseur et
   * passerait de cube à dalle.
   */
  sz?: number;
  /** Rang de dessin : il devient la profondeur. */
  rang: number;
  dragged: boolean;
  /** Tenue imposée, pour les vignettes qui essaient une pièce. */
  look?: ResolvedLook;
}

/**
 * Écart de profondeur entre deux blocs, en coordonnées normalisées. Plus grand
 * que l'épaisseur d'un bloc (0,006) pour que deux voisins ne s'entrecroisent
 * pas, assez petit pour que cent cinquante blocs tiennent dans l'intervalle.
 */
const PAS = 0.012;

/** Profondeur qu'occupe un bloc entier, en coordonnées normalisées. */
const EPAISSEUR_NDC = 0.004;

/**
 * Arrondi des cubes en volume — nettement plus serré que celui du tracé 2D
 * (`CORNER`). Au rayon du dessin, la rainure entre deux cubes fait quatorze
 * pixels de large et son arête ramasse toute la lumière : le bloc n'est plus
 * qu'un chapelet de coussins. Un cube franc laisse une rainure fine et rend
 * la lecture des cases plus nette.
 */
const ARRONDI = UNIT * 0.11;

/**
 * Recul de l'œil, en multiples du plus grand côté de l'écran. Plus court, la
 * fuite devient franche mais les blocs du bord se tordent ; plus long, on
 * retombe sur une vue à plat. À quatre cinquièmes de la hauteur, les blocs des
 * bords montrent nettement leur tranche sans que le milieu se déforme.
 */
const RECUL = 0.82;

/**
 * Nombre de mailles gardées sur la carte. Cent pour les nombres, et de quoi
 * tenir les assemblages vivants d'un chantier plus ceux qu'on vient de défaire.
 */
const MAILLES_MAX = 240;

export class Relief {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private locs: Record<string, number> = {};
  private uni: Record<string, WebGLUniformLocation | null> = {};
  private cache = new Map<string, Tampons | null>();
  private wardrobe: Wardrobe = {};
  private largeur = 0;
  private hauteur = 0;

  /**
   * `reculFixe` sert aux vignettes : leur boîte fait cent pixels, et une
   * distance d'œil proportionnelle y donnerait une fuite de grand-angle.
   */
  constructor(private reculFixe?: number) {
    this.canvas = document.createElement('canvas');
    const gl =
      (this.canvas.getContext('webgl', {
        alpha: true,
        antialias: true,
        // Prémultiplié : avec l'anticrénelage, un pixel de bord sort déjà
        // multiplié par sa couverture. En annonçant le contraire, le
        // compositeur le redivise — d'où les liserés blancs sur mobile.
        premultipliedAlpha: true,
        depth: true,
      }) as WebGLRenderingContext | null) ?? null;
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn('relief :', gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('relief :', gl.getProgramInfoLog(prog));
      return;
    }

    gl.useProgram(prog);
    this.gl = gl;
    this.prog = prog;
    for (const nom of ['aPos', 'aNor', 'aCol', 'aMat', 'aLocal', 'aGrain'])
      this.locs[nom] = gl.getAttribLocation(prog, nom);
    for (const nom of ['uProj', 'uModele', 'uNormale', 'uOeil', 'uBiais'])
      this.uni[nom] = gl.getUniformLocation(prog, nom);
    gl.enable(gl.DEPTH_TEST);
    // Mélange prémultiplié, assorti au contexte.
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
  }

  get disponible(): boolean {
    return this.gl !== null;
  }

  setWardrobe(wardrobe: Wardrobe) {
    this.wardrobe = wardrobe;
  }

  resize(width: number, height: number, dpr: number) {
    this.largeur = width;
    this.hauteur = height;
    const w = Math.floor(width * dpr);
    const h = Math.floor(height * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  // --- maillages ----------------------------------------------------------

  private envoie(maille: Maille): Tampons | null {
    const gl = this.gl;
    if (!gl || maille.nb === 0) return null;
    const buf = (arr: Float32Array) => {
      const b = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
      return b;
    };
    return {
      pos: buf(maille.pos),
      nor: buf(maille.nor),
      col: buf(maille.col),
      mat: buf(maille.mat),
      local: buf(maille.local),
      grain: buf(maille.grain),
      nb: maille.nb,
    };
  }

  private tampons(cle: string, fabrique: () => Maille): Tampons | null {
    if (!this.cache.has(cle)) {
      this.cache.set(cle, this.envoie(fabrique()));
      this.degage();
    }
    return this.cache.get(cle) ?? null;
  }

  /**
   * Au mode nombre il n'y a que cent formes, et le cache se remplit une fois
   * pour toutes. Un chantier, lui, fabrique une maille neuve à chaque soudure :
   * sans borne, chaque assemblage abandonné laisserait ses tampons sur la carte
   * pour la durée de la partie. On jette les plus anciens, qui sont aussi ceux
   * qu'on ne redessine plus.
   */
  private degage() {
    const gl = this.gl;
    if (!gl) return;
    while (this.cache.size > MAILLES_MAX) {
      const [cle, t] = this.cache.entries().next().value as [string, Tampons | null];
      if (t) {
        gl.deleteBuffer(t.pos);
        gl.deleteBuffer(t.nor);
        gl.deleteBuffer(t.col);
        gl.deleteBuffer(t.mat);
        gl.deleteBuffer(t.local);
        gl.deleteBuffer(t.grain);
      }
      this.cache.delete(cle);
    }
  }

  /**
   * La clé du bloc est calculée une fois pour toutes à sa naissance
   * (`world.add`) : elle dit la forme, les matières *et* les graines, et la
   * rebâtir à chaque image coûterait deux kilo-octets de chaîne par mur.
   */
  private bloc(b: BlocRelief): Tampons | null {
    const skin = b.skin ?? [];
    return this.tampons(b.cle, () => {
      const base = teinte(colorFor(b.value));
      const couleurs: Vec3[] = skin.length
        ? skin.map((s) => teinte(matiereFor(s.mat).couleur))
        : b.shape.cells.map(() => base);
      const modeles = skin.length
        ? skin.map((s) => matiereFor(s.mat).modele)
        : b.shape.cells.map(() => MAT_MAT);
      const grains = skin.map((s) => matiereFor(s.mat).grain);
      // La graine est ramenée dans [0, 1[ : sur un téléphone en demi-précision,
      // un entier de cinq chiffres nourrissant un `sin` ne rend plus du hasard.
      const graines = skin.map((s) => (s.seed % 65536) / 65536);
      return mailleBloc(b.shape, couleurs, modeles, grains, graines);
    });
  }

  private piece(slot: SlotObjet, id: string, part: 'corps' | 'mobile' | 'verre'): Tampons | null {
    return this.tampons(`${slot}:${id}:${part}`, () => {
      const objet = objet3D(slot, id);
      const f = new Forge();
      objet?.[part]?.(f);
      return f.fini();
    });
  }

  // --- passes -------------------------------------------------------------

  /** Efface la couleur ; garde la profondeur pour la seconde passe. */
  private commence(effaceProfondeur: boolean) {
    const gl = this.gl;
    if (!gl) return;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | (effaceProfondeur ? gl.DEPTH_BUFFER_BIT : 0));
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.uni.uProj, false, this.projection());
    gl.uniform3fv(this.uni.uOeil, new Float32Array([this.largeur / 2, this.hauteur / 2, this.oeilZ]));
  }

  /** Distance de l'œil au plan médian de la scène, en pixels. */
  private get oeilZ(): number {
    return this.reculFixe ?? Math.max(this.largeur, this.hauteur, 320) * RECUL;
  }

  /**
   * Grossissement de la face avant d'un bloc : c'est elle que le visage au
   * trait vient couvrir, et elle est plus près de l'œil que le plan médian.
   */
  get avantPlan(): number {
    return this.avantPlanPour(1);
  }

  /** Le même, quand le monde est vu à l'échelle `zoom` : l'épaisseur suit. */
  avantPlanPour(zoom: number): number {
    const d = this.oeilZ;
    return d / (d - Z * zoom);
  }

  /**
   * Perspective, l'œil planté au milieu de l'écran et le plan z = 0 à
   * l'échelle du canvas 2D : un bloc y garde la position que la physique lui
   * donne, et seule son épaisseur fuit.
   *
   * La profondeur reste **linéaire** en z — `w` est remis dans la troisième
   * ligne — parce qu'on s'en sert pour ordonner les blocs au centième près, et
   * qu'un 1/z écraserait tout l'intervalle près de l'œil.
   */
  private projection(): Float32Array {
    const w = this.largeur || 1;
    const h = this.hauteur || 1;
    const d = this.oeilZ;
    // Profondeur au repos, et pente choisie pour qu'un bloc entier n'occupe
    // que `EPAISSEUR_NDC` : le décalage de rang doit rester plus grand que
    // l'épaisseur d'un bloc, sinon deux voisins s'entrecroisent.
    const b = 0.9;
    const a = -b / d - EPAISSEUR_NDC / (2 * Z);
    return new Float32Array([
      2 / w, 0, 0, 0,
      0, -2 / h, 0, 0,
      // La troisième colonne porte la profondeur et la division perspective :
      // c'est le -1/d de la dernière ligne qui fait fuir les lointains.
      0, 0, a, -1 / d,
      -1, 1, b, 1,
    ]);
  }

  private dessine(t: Tampons | null, modele: Float32Array, normale: Float32Array, biais = 0) {
    const gl = this.gl;
    if (!gl || !t) return;
    gl.uniform1f(this.uni.uBiais, biais);
    const lie = (buf: WebGLBuffer, loc: number, taille: number) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, taille, gl.FLOAT, false, 0, 0);
    };
    lie(t.pos, this.locs.aPos, 3);
    lie(t.nor, this.locs.aNor, 3);
    lie(t.col, this.locs.aCol, 3);
    lie(t.mat, this.locs.aMat, 1);
    lie(t.local, this.locs.aLocal, 3);
    lie(t.grain, this.locs.aGrain, 2);
    gl.uniformMatrix4fv(this.uni.uModele, false, modele);
    gl.uniformMatrix4fv(this.uni.uNormale, false, normale);
    gl.drawArrays(gl.TRIANGLES, 0, t.nb);
  }

  /**
   * Ce qu'un bloc porte.
   *
   * Un bloc fait de matière ne porte rien : sur un chantier il n'y a personne
   * à habiller, et sa `value` n'est que son nombre de cubes — la demander à
   * `lookFor` posait la couronne du 10 sur un mur de dix cubes.
   */
  private tenue(b: BlocRelief): ResolvedLook {
    if (b.look) return b.look;
    return b.skin?.length ? NU : lookFor(b.value, this.wardrobe);
  }

  /**
   * Passe arrière : les corps, plus ce qui se porte *sous* le visage — la cape
   * et tout ce qui entoure le cou. L'ordre reprend celui du dessin 2D.
   */
  passeCorps(blocs: BlocRelief[], time: number): HTMLCanvasElement | null {
    const gl = this.gl;
    if (!gl) return null;
    this.commence(true);
    gl.disable(gl.BLEND);
    const verres: Array<() => void> = [];

    for (const b of blocs) {
      const { modele, normale, biais } = this.repere(b);
      this.dessine(this.bloc(b), modele, normale, biais);
      const look = this.tenue(b);
      const tete = this.tete(b, modele);
      if (look.scarf !== 'rien') {
        this.dessine(this.piece('scarf', look.scarf, 'corps'), tete, normale, biais);
        const objet = objet3D('scarf', look.scarf);
        if (objet?.verre) {
          verres.push(() => this.dessine(this.piece('scarf', look.scarf, 'verre'), tete, normale, biais));
        }
      }
    }

    this.passeVerres(verres);
    void time;
    return this.canvas;
  }

  /** Passe avant : ce qui se pose *par-dessus* le visage — chapeaux, lunettes. */
  passeObjets(blocs: BlocRelief[], time: number): HTMLCanvasElement | null {
    const gl = this.gl;
    if (!gl) return null;
    this.commence(false);
    gl.disable(gl.BLEND);
    const verres: Array<() => void> = [];

    for (const b of blocs) {
      const { modele, normale, biais } = this.repere(b);
      const tete = this.tete(b, modele);
      const look = this.tenue(b);
      for (const slot of ['hat', 'glasses'] as const) {
        const id = look[slot];
        if (id === 'rien') continue;
        const objet = objet3D(slot, id);
        if (!objet) continue;

        let repere = tete;
        if (objet.flotte) repere = multiplie(tete, translation(0, objet.flotte(time), 0));
        this.dessine(this.piece(slot, id, 'corps'), repere, normale, biais);
        if (objet.mobile && objet.poseMobile) {
          const pose = objet.poseMobile(time);
          this.dessine(
            this.piece(slot, id, 'mobile'),
            multiplie(multiplie(repere, translation(0, pose.y, 0)), rotationY(pose.angle)),
            multiplie(normale, rotationY(pose.angle)),
            biais,
          );
        }
        if (objet.verre) {
          verres.push(() => this.dessine(this.piece(slot, id, 'verre'), repere, normale, biais));
        }
      }
    }

    this.passeVerres(verres);
    return this.canvas;
  }

  /** Les verres passent en dernier, sans écrire la profondeur. */
  private passeVerres(verres: Array<() => void>) {
    const gl = this.gl;
    if (!gl || verres.length === 0) return;
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    for (const v of verres) v();
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  /** Le repère du bloc : même translation, même rotation, même écrasement. */
  private repere(b: BlocRelief) {
    const modele = multiplie(
      multiplie(translation(b.x, b.y, 0), rotationZ(b.angle)),
      echelle(b.sx, b.sy, b.sz ?? 1),
    );
    // Les normales ignorent l'écrasement : il est faible, et l'inverser coûte
    // plus cher que ce qu'il apporte.
    const normale = rotationZ(b.angle);
    // L'ordre de dessin devient un simple décalage de profondeur : le bloc ne
    // recule pas, donc la perspective ne le rapetisse pas.
    return { modele, normale, biais: -b.rang * PAS };
  }

  /** Le repère de la case qui porte le visage, comme `drawCharacter`. */
  private tete(b: BlocRelief, modele: Float32Array): Float32Array {
    const cells = centeredOf(b.shape);
    const face = cells[b.shape.faceIndex];
    return multiplie(modele, translation(face.x * UNIT, face.y * UNIT, 0));
  }
}

// --- géométrie d'un bloc ---------------------------------------------------

/**
 * Le bloc en volume : **un cube arrondi par case, collés côte à côte**.
 *
 * C'est la version qui rend le mieux, et pour une raison simple : le creux
 * entre deux cubes voisins *est* la rainure. Rien à tracer par-dessus, et
 * chaque cube attrape la lumière sur son propre arrondi.
 *
 * L'assembler à partir de grands rectangles coûtait moins de triangles, mais
 * laissait un trou en étoile à chaque croisement de quatre cases — un défaut
 * bien visible sur un bloc de dix-neuf, où la lumière s'y engouffrait.
 */
/**
 * Le volume d'un bloc : un cube arrondi par case, collés côte à côte.
 *
 * La couleur est donnée **par cube**, pas par bloc : au mode nombre les dix
 * cubes d'un 10 partagent la teinte de leur valeur, mais un mur de chantier
 * mêle le chêne et la brique, et souder ne repeint rien.
 */
export function mailleBloc(
  shape: Shape,
  couleurs: Vec3[],
  modeles: number[],
  grains: number[] = [],
  graines: number[] = [],
): Maille {
  const f = new Forge();
  const cells = centeredOf(shape);
  const tranches: Array<{ de: number; a: number; cx: number; cy: number; g: number; s: number }> = [];
  cells.forEach((c, i) => {
    const de = f.nbSommets;
    f.peint(couleurs[i] ?? couleurs[0], modeles[i] ?? MAT_MAT);
    f.save();
    f.translate(c.x * UNIT, c.y * UNIT, 0);
    f.boite([UNIT / 2, UNIT / 2, Z], ARRONDI, 3);
    f.restore();
    tranches.push({
      de,
      a: f.nbSommets,
      cx: c.x * UNIT,
      cy: c.y * UNIT,
      g: grains[i] ?? 0,
      s: graines[i] ?? 0,
    });
  });

  // Chaque cube reçoit son propre repère : le grain s'y accroche, et il ne
  // bougera plus quand une soudure déplacera le centre de masse du bloc.
  const maille = f.fini();
  for (const t of tranches) {
    for (let v = t.de; v < t.a; v++) {
      maille.local[v * 3] = maille.pos[v * 3] - t.cx;
      maille.local[v * 3 + 1] = maille.pos[v * 3 + 1] - t.cy;
      maille.local[v * 3 + 2] = maille.pos[v * 3 + 2];
      maille.grain[v * 2] = t.g;
      maille.grain[v * 2 + 1] = t.s;
    }
  }
  return maille;
}

// --- petites matrices ------------------------------------------------------

function multiplie(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = s;
    }
  }
  return out;
}

const translation = (x: number, y: number, z: number) =>
  new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);

const rotationZ = (a: number) => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
};

const rotationY = (a: number) => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
};

const echelle = (x: number, y: number, z: number) =>
  new Float32Array([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]);
