// Sintetizovani zvuk (WebAudio) - bez eksternih fajlova.
export class Sfx {
  constructor() { this.ctx = null; this.master = null; this.muted = false; }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.32;
    this.master.connect(this.ctx.destination);
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  toggle() { this.muted = !this.muted; return !this.muted; }

  tone(freq, dur, { type = 'sine', vol = 0.5, to = null, delay = 0, attack = 0.005 } = {}) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(30, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.03);
  }

  noise(dur, { vol = 0.4, freq = 1200, q = 1, delay = 0, type = 'lowpass' } = {}) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
  }

  coin(step = 0) {
    const base = 740 * Math.pow(1.06, Math.min(step, 12));
    this.tone(base, 0.09, { type: 'triangle', vol: 0.45 });
    this.tone(base * 1.5, 0.13, { type: 'triangle', vol: 0.35, delay: 0.06 });
  }
  dodge() { this.tone(300, 0.14, { type: 'sawtooth', vol: 0.18, to: 620 }); }
  jump() { this.noise(0.16, { vol: 0.16, freq: 900 }); this.tone(320, 0.14, { type: 'sine', vol: 0.2, to: 700 }); }
  crouch() { this.noise(0.18, { vol: 0.14, freq: 480 }); }
  hit() {
    this.tone(180, 0.35, { type: 'sawtooth', vol: 0.5, to: 55 });
    this.noise(0.3, { vol: 0.4, freq: 700 });
  }
  heart() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.16, { type: 'triangle', vol: 0.4, delay: i * 0.07 })); }
  level() { [440, 587, 740, 880].forEach((f, i) => this.tone(f, 0.22, { type: 'square', vol: 0.18, delay: i * 0.09 })); }
  bonus() { [880, 1174].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', vol: 0.3, delay: i * 0.08 })); }
  count(last = false) { this.tone(last ? 880 : 520, last ? 0.35 : 0.12, { type: 'square', vol: 0.3 }); }
  ready() { [392, 523, 659, 880].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', vol: 0.3, delay: i * 0.1 })); }
  gameover() {
    [[523, 0], [415, .16], [349, .32], [262, .48]].forEach(([f, d]) =>
      this.tone(f, 0.45, { type: 'sawtooth', vol: 0.3, delay: d }));
  }
}
