/**
 * Tout est synthétisé : zéro asset à télécharger, donc zéro latence au premier
 * clic et une PWA qui pèse quelques kilo-octets. La voix passe par l'API
 * de synthèse vocale du navigateur, en français.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
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

export function setMuted(value: boolean) {
  muted = value;
  if (master) master.gain.value = value ? 0 : 0.5;
  if (value && typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}

export function isMuted() {
  return muted;
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
  if (!c || !master || muted) return;
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
  if (!c || !master || muted) return;
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

export function playRefuse() {
  tone({ freq: 220, duration: 0.1, type: 'square', gain: 0.12 });
  tone({ freq: 180, duration: 0.14, type: 'square', gain: 0.12, delay: 0.09 });
}

export function playImpact(strength: number) {
  const s = Math.min(1, strength / 14);
  if (s < 0.12) return;
  noise(0.09 + s * 0.06, 0.06 + s * 0.2, 300 + s * 900);
}

/** Dit le nombre à voix haute, en français, sans spammer. */
export function say(value: number) {
  if (muted || typeof speechSynthesis === 'undefined') return;
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
