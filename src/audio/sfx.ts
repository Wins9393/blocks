/**
 * Tout est synthétisé : zéro asset à télécharger, donc zéro latence au premier
 * clic et une PWA qui pèse quelques kilo-octets. La voix passe par l'API
 * de synthèse vocale du navigateur, en français.
 */
import type { Timbre } from '../core/matieres';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
/** Les notes, les chocs, la fanfare : tout ce qui sort du synthétiseur. */
let bruitages = true;
/** La voix qui dit les nombres. */
let voix = true;
let lastSpoken = 0;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** À appeler à la première interaction : iOS n'ouvre l'audio qu'à ce moment-là. */
export function unlockAudio() {
  audio();
}

export interface Son {
  voix: boolean;
  bruitages: boolean;
}

/**
 * Deux robinets séparés : la voix fatigue souvent avant les bruitages — on la
 * coupe dans le bus, on garde les notes — et l'inverse arrive tout autant.
 */
export function setSound(son: Son) {
  voix = son.voix;
  bruitages = son.bruitages;
  // Le gain général suffit pour les bruitages déjà lancés : une note en train
  // de sonner se tait dans l'instant au lieu de finir sa course.
  if (master) master.gain.value = bruitages ? 0.5 : 0;
  if (!voix && typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}

interface ToneOptions {
  freq: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  sweepTo?: number;
}

function tone({ freq, duration, type = 'sine', gain = 0.3, delay = 0, sweepTo }: ToneOptions) {
  const c = audio();
  if (!c || !master || !bruitages) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t0 + duration);
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(env).connect(master);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

function noise(duration: number, gain: number, cutoff: number) {
  const c = audio();
  if (!c || !master || !bruitages) return;
  const frames = Math.floor(c.sampleRate * duration);
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2;
  }
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  const env = c.createGain();
  env.gain.value = gain;
  src.connect(filter).connect(env).connect(master);
  src.start();
}

/** Gamme pentatonique : n'importe quelle combinaison sonne juste. */
const SCALE = [392, 440, 494, 587, 659, 784, 880, 988, 1175, 1319];

function noteFor(value: number): number {
  return SCALE[Math.min(SCALE.length - 1, Math.max(0, value - 1))];
}

export function playSpawn(value: number) {
  tone({ freq: noteFor(value), duration: 0.14, type: 'triangle', gain: 0.22 });
}

export function playMerge(value: number) {
  tone({ freq: noteFor(value) * 0.75, duration: 0.1, type: 'triangle', gain: 0.2 });
  tone({ freq: noteFor(value), duration: 0.22, type: 'triangle', gain: 0.26, delay: 0.08 });
}

export function playPeel() {
  tone({ freq: 900, duration: 0.09, type: 'square', gain: 0.12, sweepTo: 1500 });
}

export function playSlice() {
  noise(0.22, 0.3, 5200);
  tone({ freq: 1400, duration: 0.14, type: 'sawtooth', gain: 0.08, sweepTo: 500 });
}

export function playTrash() {
  tone({ freq: 420, duration: 0.4, type: 'sine', gain: 0.25, sweepTo: 70 });
  noise(0.3, 0.14, 900);
}

/** Petite fanfare montante : la seule récompense sonore du jeu. */
export function playWin() {
  [523, 659, 784, 1047].forEach((freq, i) => {
    tone({ freq, duration: 0.2, type: 'triangle', gain: 0.22, delay: i * 0.09 });
  });
}

export function playRefuse() {
  tone({ freq: 220, duration: 0.1, type: 'square', gain: 0.12 });
  tone({ freq: 180, duration: 0.14, type: 'square', gain: 0.12, delay: 0.09 });
}

/**
 * Ce qu'il faut savoir d'une matière pour la faire sonner. Sur un chantier, le
 * son suit la matière : si le chêne et le verre font le même bruit, la matière
 * n'est plus qu'une peau — et c'est elle qui a remplacé le personnage.
 */
export interface Choc {
  ton: number;
  timbre: Timbre;
  souffle: number;
}

/** Poser un cube : un coup sec, coloré par ce dont il est fait. */
export function playPose(m: Choc) {
  tone({
    freq: m.ton,
    duration: 0.09 + m.souffle * 0.05,
    type: m.timbre,
    gain: 0.2 * (1 - m.souffle * 0.45),
  });
  if (m.souffle > 0.08) noise(0.12 * m.souffle, 0.05 + m.souffle * 0.09, 300 + m.ton * 1.4);
}

/** Souder : deux notes, la seconde une quinte au-dessus. */
export function playSoudure(m: Choc) {
  const g = 1 - m.souffle * 0.4;
  tone({ freq: m.ton * 0.75, duration: 0.08, type: m.timbre, gain: 0.16 * g });
  tone({ freq: m.ton * 1.5, duration: 0.2, type: m.timbre, gain: 0.2 * g, delay: 0.07 });
  if (m.souffle > 0.08) noise(0.1 * m.souffle, 0.08, 400 + m.ton);
}

export function playImpact(strength: number, m?: Choc) {
  const s = Math.min(1, strength / 14);
  if (s < 0.12) return;
  if (!m) {
    noise(0.09 + s * 0.06, 0.06 + s * 0.2, 300 + s * 900);
    return;
  }
  // Le souffle fait tout le partage : la terre étouffe, le verre tinte.
  noise(0.07 * (0.4 + m.souffle) + s * 0.05, 0.05 + s * 0.16, 260 + m.ton * (0.6 + s));
  if (m.souffle < 0.55) {
    tone({
      freq: m.ton * (1 + s * 0.15),
      duration: 0.06 + s * 0.05,
      type: m.timbre,
      gain: 0.04 + s * 0.08,
    });
  }
}

/** Dit le nombre à voix haute, en français, sans spammer. */
export function say(value: number | string) {
  if (!voix || typeof speechSynthesis === 'undefined') return;
  const now = performance.now();
  if (now - lastSpoken < 320) return;
  lastSpoken = now;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(String(value));
  u.lang = 'fr-FR';
  u.rate = 0.95;
  u.pitch = 1.25;
  speechSynthesis.speak(u);
}
