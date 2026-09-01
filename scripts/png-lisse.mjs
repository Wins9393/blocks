/**
 * Dé-tramage et ré-encodage d'un PNG opaque.
 *
 * Le rasteriseur de macOS trame ses dégradés : il sème un bruit d'un point de
 * quantification sur chaque pixel, invisible à l'œil mais fatal à la
 * compression — l'icône de 512 pesait 197 ko là où un dégradé lisse en fait
 * vingt. On arrondit donc chaque canal à un pas régulier, ce qui efface le
 * bruit sans toucher au dessin, et on ré-encode en RVB (l'image est opaque, sa
 * couche alpha ne sert à rien).
 *
 *   node scripts/png-lisse.mjs <entrée> <sortie> [pas]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const TABLE_CRC = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const octet of buf) c = TABLE_CRC[(c ^ octet) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const corps = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const queue = Buffer.alloc(4);
  queue.writeUInt32BE(crc32(corps));
  return Buffer.concat([head, corps, queue]);
}

/** Lit un PNG 8 bits non entrelacé et rend ses pixels déjà défiltrés. */
export function decode(file) {
  if (!file.subarray(0, 8).equals(SIGNATURE)) throw new Error('ce n’est pas un PNG');
  let tete = null;
  const morceaux = [];

  for (let at = 8; at < file.length; ) {
    const taille = file.readUInt32BE(at);
    const type = file.toString('ascii', at + 4, at + 8);
    const data = file.subarray(at + 8, at + 8 + taille);
    if (type === 'IHDR') {
      tete = {
        width: file.readUInt32BE(at + 8),
        height: file.readUInt32BE(at + 12),
        depth: data[8],
        color: data[9],
        interlace: data[12],
      };
    } else if (type === 'IDAT') morceaux.push(Buffer.from(data));
    else if (type === 'IEND') break;
    at += 12 + taille;
  }

  if (!tete) throw new Error('IHDR manquant');
  if (tete.depth !== 8 || tete.interlace !== 0) throw new Error('PNG 8 bits non entrelacé attendu');
  const canaux = tete.color === 6 ? 4 : tete.color === 2 ? 3 : 0;
  if (!canaux) throw new Error(`type de couleur ${tete.color} non géré`);

  const brut = inflateSync(Buffer.concat(morceaux));
  const ligne = tete.width * canaux;
  const pixels = Buffer.alloc(tete.height * ligne);

  for (let y = 0; y < tete.height; y++) {
    const filtre = brut[y * (ligne + 1)];
    const source = brut.subarray(y * (ligne + 1) + 1, (y + 1) * (ligne + 1));
    const ici = y * ligne;
    const dessus = ici - ligne;
    for (let i = 0; i < ligne; i++) {
      const a = i >= canaux ? pixels[ici + i - canaux] : 0;
      const b = y > 0 ? pixels[dessus + i] : 0;
      const c = y > 0 && i >= canaux ? pixels[dessus + i - canaux] : 0;
      let v = source[i];
      if (filtre === 1) v += a;
      else if (filtre === 2) v += b;
      else if (filtre === 3) v += (a + b) >> 1;
      else if (filtre === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pixels[ici + i] = v & 0xff;
    }
  }

  return { ...tete, canaux, pixels };
}

/** Ré-encode en RVB, filtre choisi ligne par ligne (heuristique de la somme). */
export function encode(width, height, rvb) {
  const ligne = width * 3;
  const brut = Buffer.alloc(height * (ligne + 1));

  for (let y = 0; y < height; y++) {
    const ici = y * ligne;
    const dessus = ici - ligne;
    let meilleur = null;
    let meilleurScore = Infinity;

    for (const filtre of [0, 1, 2, 3, 4]) {
      const essai = Buffer.alloc(ligne);
      let score = 0;
      for (let i = 0; i < ligne; i++) {
        const x = rvb[ici + i];
        const a = i >= 3 ? rvb[ici + i - 3] : 0;
        const b = y > 0 ? rvb[dessus + i] : 0;
        const c = y > 0 && i >= 3 ? rvb[dessus + i - 3] : 0;
        let v = x;
        if (filtre === 1) v = x - a;
        else if (filtre === 2) v = x - b;
        else if (filtre === 3) v = x - ((a + b) >> 1);
        else if (filtre === 4) {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          v = x - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
        }
        essai[i] = v & 0xff;
        score += Math.min(essai[i], 256 - essai[i]);
      }
      if (score < meilleurScore) {
        meilleurScore = score;
        meilleur = { filtre, essai };
      }
    }

    brut[y * (ligne + 1)] = meilleur.filtre;
    meilleur.essai.copy(brut, y * (ligne + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bits par canal
  ihdr[9] = 2; // RVB, sans alpha
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(brut, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const [entree, sortie, pasArg] = process.argv.slice(2);
if (!entree || !sortie) {
  console.error('usage : node scripts/png-lisse.mjs <entrée> <sortie> [pas]');
  process.exit(1);
}

const pas = Number(pasArg) || 4;
const image = decode(readFileSync(entree));
const rvb = Buffer.alloc(image.width * image.height * 3);

// L'alpha est jeté : si l'image n'est pas opaque, ce n'est pas un détail de
// poids, c'est une perte de dessin. On préfère s'arrêter.
if (image.canaux === 4) {
  for (let i = 3; i < image.pixels.length; i += 4) {
    if (image.pixels[i] !== 255) throw new Error(`${entree} : image non opaque`);
  }
}

for (let i = 0, j = 0; i < image.pixels.length; i += image.canaux, j += 3) {
  for (let k = 0; k < 3; k++) {
    // L'arrondi au pas efface le tramage ; le pixel garde sa couleur à un
    // demi-pas près, ce qui ne se voit sur aucun écran à cette taille.
    rvb[j + k] = Math.min(255, Math.round(image.pixels[i + k] / pas) * pas);
  }
}

const dehors = encode(image.width, image.height, rvb);
writeFileSync(sortie, dehors);
const avant = readFileSync(entree).length;
console.log(
  `${sortie} : ${(avant / 1024).toFixed(0)} ko -> ${(dehors.length / 1024).toFixed(0)} ko`,
);
