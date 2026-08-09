// 程序化音效：全部由 WebAudio 振荡器实时合成，无任何外部音频素材
let ctx: AudioContext | null = null;

export function initSfx(): void {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      ctx = null;
    }
  }
  if (ctx && ctx.state === 'suspended') void ctx.resume();
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0, delay = 0): void {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide !== 0) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noiseBurst(dur: number, vol: number): void {
  if (!ctx) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  const gain = ctx.createGain();
  gain.gain.value = vol;
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start();
}

export const sfx = {
  shoot(): void {
    tone(480 + Math.random() * 120, 0.09, 'square', 0.045, -260);
  },
  prism(): void {
    tone(420, 0.18, 'sine', 0.055, 920);
    tone(1040, 0.22, 'triangle', 0.045, -180, 0.035);
  },
  boom(big = false): void {
    noiseBurst(big ? 0.5 : 0.25, big ? 0.22 : 0.1);
    tone(big ? 90 : 130, big ? 0.45 : 0.25, 'sine', big ? 0.2 : 0.09, -60);
  },
  ready(): void {
    tone(620, 0.1, 'sine', 0.07, 140);
    tone(880, 0.12, 'sine', 0.06, 0, 0.09);
  },
  error(): void {
    tone(170, 0.16, 'sawtooth', 0.08, -40);
  },
  click(): void {
    tone(840, 0.045, 'square', 0.03);
  },
  cash(): void {
    tone(980, 0.07, 'triangle', 0.05, 220);
  },
};
