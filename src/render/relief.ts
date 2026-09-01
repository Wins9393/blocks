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
import { centeredCells, shapeFor } from '../core/shape';
import { lookFor } from '../core/wardrobe';
import type { ResolvedLook, Wardrobe } from '../core/wardrobe';
import { Forge, MAT_MAT, teinte } from './mesh';
import type { Maille } from './mesh';
import { Z, objet3D } from './objets3d';
import type { SlotObjet } from './objets3d';
import { CORNER } from './silhouette';

const VERT = `
attribute vec3 aPos;
attribute vec3 aNor;
attribute vec3 aCol;
attribute float aMat;
uniform mat4 uProj;
uniform mat4 uModele;
uniform mat4 uNormale;
uniform float uBiais;
varying vec3 vN;
varying vec3 vP;
varying vec3 vCol;
varying float vMat;
void main() {
  vec4 monde = uModele * vec4(aPos, 1.0);
  vN = mat3(uNormale) * aNor;
  vP = monde.xyz;
  vCol = aCol;
  vMat = aMat;
  gl_Position = uProj * monde;
  // Le rang de dessin ne se traduit pas en recul — il fausserait la taille
  // sous une perspective — mais en simple décalage de profondeur.
  gl_Position.z += uBiais * gl_Position.w;
}`;

/**
 * L'éclairage est volontairement doux : la couleur d'un bloc dit quel nombre
 * on regarde. Un éclairage de studio, plus joli sur un objet isolé, ferait
 * bouger cette couleur avec l'orientation et brouillerait la lecture.
 */
const FRAG = `
precision mediump float;
varying vec3 vN;
varying vec3 vP;
varying vec3 vCol;
varying float vMat;
uniform vec3 uOeil;
vec3 ciel(vec3 d) {
  float t = clamp(-d.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 c = mix(vec3(0.09, 0.11, 0.15), vec3(0.52, 0.58, 0.74), t);
  float lampe = pow(max(dot(d, normalize(vec3(-0.5, -0.76, 0.42))), 0.0), 24.0);
  return c + vec3(1.0, 0.93, 0.74) * lampe * 1.8;
}
void main() {
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(uOeil - vP);
  vec3 L = normalize(vec3(-0.6, -0.8, 0.62));
  vec3 H = normalize(L + V);
  float diff = max(dot(N, L), 0.0);
  float spec = pow(max(dot(N, H), 0.0), 60.0);
  float bord = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 refl = ciel(reflect(-V, N));
  vec3 c;
  float alpha = 1.0;
  // Une lampe d'appoint, sans ombre, du côté opposé : elle relève les faces
  // que la clé laisse dans le noir, comme le dégradé du dessin 2D le faisait.
  float appoint = max(dot(N, normalize(vec3(0.5, -0.3, 0.8))), 0.0) * 0.22;
  if (vMat < 0.5) {
    // Mat : plastique, laine, feutre.
    c = vCol * (0.7 + 0.5 * diff + appoint) + vCol * refl * 0.18 + vec3(1.0) * spec * 0.2 + vCol * bord * 0.3;
  } else if (vMat < 1.5) {
    // Métal : il n'existe que par ce qu'il reflète.
    c = vCol * (0.3 + 0.5 * diff + appoint) + vCol * refl * 1.25 + vec3(1.0, 0.96, 0.86) * spec * 0.9;
  } else if (vMat < 2.5) {
    // Verre : transparent sur la face, opaque de biais.
    c = mix(refl, vCol * 0.8, 0.4) + vec3(1.0) * spec * 1.6 + vCol * bord * 0.55;
    alpha = clamp(0.26 + bord * 0.6 + spec, 0.0, 1.0);
  } else if (vMat < 3.5) {
    // Lumière : l'auréole ne s'éteint jamais.
    c = vCol * (0.95 + 0.25 * diff) + vCol * bord * 1.5 + vec3(1.0) * spec * 0.5;
  } else {
    // Gemme.
    c = vCol * (0.34 + 0.75 * diff + appoint) + refl * 0.32 + vec3(1.0) * spec * 1.5 + vCol * bord * 0.7;
  }
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), alpha);
}`;

interface Tampons {
  pos: WebGLBuffer;
  nor: WebGLBuffer;
  col: WebGLBuffer;
  mat: WebGLBuffer;
  nb: number;
}

export interface BlocRelief {
  value: number;
  x: number;
  y: number;
  angle: number;
  sx: number;
  sy: number;
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
 * Recul de l'œil, en multiples du plus grand côté de l'écran. Plus court, la
 * fuite devient franche mais les blocs du bord se tordent ; plus long, on
 * retombe sur une vue à plat. À quatre cinquièmes de la hauteur, les blocs des
 * bords montrent nettement leur tranche sans que le milieu se déforme.
 */
const RECUL = 0.82;

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
        premultipliedAlpha: false,
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
    for (const nom of ['aPos', 'aNor', 'aCol', 'aMat']) this.locs[nom] = gl.getAttribLocation(prog, nom);
    for (const nom of ['uProj', 'uModele', 'uNormale', 'uOeil', 'uBiais'])
      this.uni[nom] = gl.getUniformLocation(prog, nom);
    gl.enable(gl.DEPTH_TEST);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
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
    return { pos: buf(maille.pos), nor: buf(maille.nor), col: buf(maille.col), mat: buf(maille.mat), nb: maille.nb };
  }

  private tampons(cle: string, fabrique: () => Maille): Tampons | null {
    if (!this.cache.has(cle)) this.cache.set(cle, this.envoie(fabrique()));
    return this.cache.get(cle) ?? null;
  }

  private bloc(value: number): Tampons | null {
    return this.tampons(`bloc:${value}`, () => mailleBloc(value));
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
    const d = this.oeilZ;
    return d / (d - Z);
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
    gl.uniformMatrix4fv(this.uni.uModele, false, modele);
    gl.uniformMatrix4fv(this.uni.uNormale, false, normale);
    gl.drawArrays(gl.TRIANGLES, 0, t.nb);
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
      this.dessine(this.bloc(b.value), modele, normale, biais);
      const look = b.look ?? lookFor(b.value, this.wardrobe);
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
      const look = b.look ?? lookFor(b.value, this.wardrobe);
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
      echelle(b.sx, b.sy, 1),
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
    const cells = centeredCells(b.value);
    const face = cells[shapeFor(b.value).faceIndex];
    return multiplie(modele, translation(face.x * UNIT, face.y * UNIT, 0));
  }
}

// --- géométrie d'un bloc ---------------------------------------------------

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Regroupe les cases en rectangles maximaux : moins de boîtes à assembler. */
function rectangles(cells: Array<{ x: number; y: number }>): Rect[] {
  const reste = new Set(cells.map((c) => `${c.x},${c.y}`));
  const out: Rect[] = [];
  const trie = [...cells].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const c of trie) {
    if (!reste.has(`${c.x},${c.y}`)) continue;
    let w = 1;
    while (reste.has(`${c.x + w},${c.y}`)) w++;
    let h = 1;
    for (;;) {
      let complet = true;
      for (let i = 0; i < w; i++) if (!reste.has(`${c.x + i},${c.y + h}`)) complet = false;
      if (!complet) break;
      h++;
    }
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) reste.delete(`${c.x + i},${c.y + j}`);
    out.push({ x: c.x, y: c.y, w, h });
  }
  return out;
}

/**
 * Le bloc en volume : l'union des rectangles arrondis que le moteur 2D
 * assemble déjà pour tracer sa silhouette — les cases, plus un pont partout où
 * deux cases se touchent sans appartenir au même rectangle. La silhouette
 * projetée est donc *exactement* celle du dessin, ponts compris.
 */
export function mailleBloc(value: number): Maille {
  const f = new Forge();
  const cells = centeredCells(value);
  const shape = shapeFor(value);
  const grille = shape.cells;
  const rects = rectangles(grille);
  const rangDe = new Map<string, number>();
  rects.forEach((r, i) => {
    for (let j = 0; j < r.h; j++) for (let k = 0; k < r.w; k++) rangDe.set(`${r.x + k},${r.y + j}`, i);
  });

  // Décalage entre la grille entière et le repère centré sur la masse.
  const offX = cells[0].x - grille[0].x;
  const offY = cells[0].y - grille[0].y;
  const r = CORNER;
  f.peint(teinte(colorFor(value)), MAT_MAT);

  for (const rect of rects) {
    const cx = (rect.x + (rect.w - 1) / 2 + offX) * UNIT;
    const cy = (rect.y + (rect.h - 1) / 2 + offY) * UNIT;
    f.save();
    f.translate(cx, cy, 0);
    f.boite([(rect.w * UNIT) / 2, (rect.h * UNIT) / 2, Z], r, 4);
    f.restore();
  }

  const occupe = new Set(grille.map((c) => `${c.x},${c.y}`));
  for (const c of grille) {
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
    ]) {
      const voisin = `${c.x + dx},${c.y + dy}`;
      if (!occupe.has(voisin)) continue;
      if (rangDe.get(`${c.x},${c.y}`) === rangDe.get(voisin)) continue;
      const cx = (c.x + dx / 2 + offX) * UNIT;
      const cy = (c.y + dy / 2 + offY) * UNIT;
      f.save();
      f.translate(cx, cy, 0);
      f.boite([dx ? 2 * r : UNIT / 2, dy ? 2 * r : UNIT / 2, Z], r, 3);
      f.restore();
    }
  }

  return f.fini();
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
