// Plesni izazov — ponavljaš pokrete u ritmu muzike.
// Muzika je sintetizovana uživo (WebAudio), bez ijednog audio fajla.

import { Sfx } from './audio.js';
import { PoseTracker, LM } from './pose.js';
import { requestPhoneCam } from './phonecam.js';
import { buildPose } from './poses.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);

const HOLE_R = 0.30, HEAD_R = 0.36;     // debljina "senke" koja se crta (dužine trupa)
const SIG = 0.50;                       // koliko prašta poklapanje zglobova

// Koji zglob igrača odgovara kom zglobu poze + koliko je važan.
// A = leva strana EKRANA = igračeva leva strana (slika je ogledalo).
const JOINTS = [
  ['elbA', 13, 1.0], ['wriA', 15, 1.4],
  ['elbB', 14, 1.0], ['wriB', 16, 1.4],
  ['kneA', 25, 0.8], ['ankA', 27, 1.0],
  ['kneB', 26, 0.8], ['ankB', 28, 1.0],
  ['head', 0, 0.4]
];
// Kosti za bojenje: [od, do, zglob po kome se ocenjuje]
const DRAW_BONES = [
  [11, 13, 'elbA'], [13, 15, 'wriA'],
  [12, 14, 'elbB'], [14, 16, 'wriB'],
  [23, 25, 'kneA'], [25, 27, 'ankA'],
  [24, 26, 'kneB'], [26, 28, 'ankB'],
  [11, 12, null], [11, 23, null], [12, 24, null], [23, 24, null]
];
const GRADE = [
  { min: 0.90, name: 'SAVRŠENO', pts: 100, cls: 'perfect', color: '#ffd54f' },
  { min: 0.78, name: 'ODLIČNO', pts: 60, cls: '', color: '#ff9fe0' },
  { min: 0.62, name: 'DOBRO', pts: 30, cls: '', color: '#7ee8ff' }
];

const MOVES = [
  { name: 'RUKE GORE', armA: [-120, -120], armB: [-60, -60], legA: [93, 93], legB: [87, 87] },
  { name: 'SRCE', armA: [-118, -42], armB: [-62, -138], legA: [95, 95], legB: [85, 85] },
  { name: 'ZVEZDA', armA: [-138, -138], armB: [-42, -42], legA: [113, 113], legB: [67, 67] },
  { name: 'T-POZA', armA: [180, 180], armB: [0, 0], legA: [93, 93], legB: [87, 87] },
  { name: 'MAHNI LEVO', armA: [-168, -168], armB: [-152, -152], legA: [100, 100], legB: [80, 80] },
  { name: 'MAHNI DESNO', armA: [-28, -28], armB: [-12, -12], legA: [100, 100], legB: [80, 80] },
  { name: 'KAKTUS', armA: [180, -90], armB: [0, -90], legA: [93, 93], legB: [87, 87] },
  { name: 'DISKO GORE', armA: [-52, -52], armB: [126, 126], legA: [112, 112], legB: [78, 78] },
  { name: 'DISKO DOLE', armA: [54, 54], armB: [-128, -128], legA: [102, 102], legB: [66, 66] },
  { name: 'LEPTIR', armA: [-158, -62], armB: [-22, -118], legA: [96, 96], legB: [84, 84] },
  { name: 'KRUNA', armA: [168, -62], armB: [12, -118], legA: [93, 93], legB: [87, 87] },
  { name: 'RUKE NA BOKU', armA: [160, 72], armB: [20, 108], legA: [116, 116], legB: [64, 64] },
  { name: 'LETI', armA: [158, 158], armB: [22, 22], legA: [100, 100], legB: [80, 80] },
  { name: 'JEDNA GORE', armA: [-90, -90], armB: [0, 0], legA: [93, 93], legB: [87, 87] },
  { name: 'DRUGA GORE', armA: [180, 180], armB: [-90, -90], legA: [93, 93], legB: [87, 87] },
  { name: 'MAČKA', armA: [-135, -45], armB: [-45, -135], legA: [97, 97], legB: [83, 83] },
  { name: 'ŠIROKO V', armA: [-155, -155], armB: [-25, -25], legA: [126, 126], legB: [54, 54] },
  { name: 'V NADOLE', armA: [128, 128], armB: [52, 52], legA: [120, 120], legB: [60, 60] },
  { name: 'BALERINA', armA: [-115, -55], armB: [-65, -125], legA: [134, 134], legB: [85, 85] },
  { name: 'ROBOT', armA: [180, -90], armB: [0, 90], legA: [95, 95], legB: [85, 85] },
  { name: 'PROPELER', armA: [-115, -25], armB: [65, 155], legA: [100, 100], legB: [80, 80] },
  { name: 'NOGA U STRANU', armA: [180, 180], armB: [0, 0], legA: [130, 130], legB: [87, 87] },
  { name: 'STRELICA', armA: [-100, -100], armB: [-80, -80], legA: [93, 93], legB: [87, 87] },
  { name: 'TALAS', armA: [-150, -100], armB: [-30, -80], legA: [98, 98], legB: [82, 82] },
  { name: 'ZVEZDICA', armA: [-160, -160], armB: [-20, -20], legA: [122, 122], legB: [58, 58] },
  { name: 'MAŠNA', armA: [-105, -160], armB: [-75, -20], legA: [96, 96], legB: [84, 84] }
];

/* ================= muzika ================= */
class Music {
  constructor(sfx) {
    this.sfx = sfx;
    this.bpm = 104;
    this.beat = 60 / this.bpm;
    this.stepDur = this.beat / 2;       // osmine
    this.step = 0;
    this.nextTime = 0;
    this.t0 = 0;
    this.on = false;
    this.fallback0 = 0;
    // C - G - Am - F
    this.chords = [
      [261.63, 329.63, 392.00],
      [196.00, 246.94, 293.66],
      [220.00, 261.63, 329.63],
      [174.61, 220.00, 261.63]
    ];
  }
  now() {
    const c = this.sfx.ctx;
    if (c && this.on) return c.currentTime - this.t0;
    return (performance.now() - this.fallback0) / 1000;
  }
  start() {
    const c = this.sfx.ctx;
    this.step = 0;
    this.on = true;
    this.fallback0 = performance.now();
    if (!c) return;
    this.t0 = c.currentTime + 0.08;
    this.nextTime = this.t0;
  }
  stop() { this.on = false; }

  update() {
    const c = this.sfx.ctx;
    if (!c || !this.on) return;
    while (this.nextTime < c.currentTime + 0.3) {
      this.play(this.step, this.nextTime - c.currentTime);
      this.nextTime += this.stepDur;
      this.step++;
    }
  }

  play(i, delay) {
    if (delay < 0) delay = 0;
    const s = this.sfx;
    const inBar = i % 8;
    const bar = Math.floor(i / 8) % 4;
    const ch = this.chords[bar];

    if (inBar === 0 || inBar === 4) s.tone(125, 0.2, { type: 'sine', vol: 0.5, to: 45, delay: delay });
    if (inBar === 2 || inBar === 6) s.noise(0.13, { vol: 0.26, freq: 1600, type: 'highpass', delay: delay });
    if (inBar % 2 === 1) s.noise(0.035, { vol: 0.1, freq: 7000, type: 'highpass', delay: delay });
    if (inBar === 0 || inBar === 3 || inBar === 6) s.tone(ch[0] / 2, 0.24, { type: 'triangle', vol: 0.26, delay: delay });
    const arp = [0, 1, 2, 1, 2, 1, 0, 2][inBar];
    s.tone(ch[arp] * 2, 0.15, { type: 'square', vol: 0.07, delay: delay });
    if (inBar === 0 && bar % 2 === 1) s.tone(ch[2] * 4, 0.3, { type: 'triangle', vol: 0.06, delay: delay });
  }
}

/* ================= igra ================= */
class DanceGame {
  constructor(canvas, video, sfx) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.video = video;
    this.sfx = sfx;
    this.music = new Music(sfx);
    this.debug = false;
    this.onGrade = null;
    this.onDone = null;
    this.ribbons = [[], []];
    this.resize();
    this.reset(1);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.dpr = dpr;
    this.w = Math.max(320, window.innerWidth);
    this.h = Math.max(240, window.innerHeight);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  coverParams() {
    const v = this.video;
    if (!v || !v.videoWidth) return null;
    const s = Math.max(this.w / v.videoWidth, this.h / v.videoHeight);
    return { dx: (this.w - v.videoWidth * s) / 2, dy: (this.h - v.videoHeight * s) / 2, dw: v.videoWidth * s, dh: v.videoHeight * s };
  }
  videoToScreen(nx, ny) {
    const c = this.coverParams();
    if (!c) return { x: this.w * (1 - nx), y: this.h * ny };
    return { x: this.w - (c.dx + nx * c.dw), y: c.dy + ny * c.dh };
  }

  reset(mode) {
    this.mode = mode || 1;
    this.endless = this.mode === 4;
    this.bpm = this.music.beat;
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.perfect = 0;
    this.hits = 0;
    this.baseSum = 0;
    this.idx = 0;
    this.t = 0;
    this.parts = [];
    this.floats = [];
    this.bestFit = 0;
    this.fit = 0;
    this.segs = [];
    this.pulse = 0;
    this.lastBeat = -1;
    this.done = false;
    this.center = { x: this.w / 2, y: this.h * 0.6 };
    this.unit = this.h * 0.17;
    this.ribbons = [[], []];
    this.buildChart();
  }

  beatsFor(i) {
    if (!this.endless) return { 1: 4, 2: 3, 3: 2 }[this.mode] || 4;
    return Math.max(1.5, 4 - Math.floor(i / 4) * 0.25);
  }

  buildChart() {
    this.chart = [];
    const total = this.endless ? 400 : 32;
    let beat = 8;                       // dva takta uvoda
    let prev = -1;
    for (let i = 0; i < total; i++) {
      let k = (Math.random() * MOVES.length) | 0;
      let g = 0;
      while (k === prev && g++ < 8) k = (Math.random() * MOVES.length) | 0;
      prev = k;
      const bpm = this.beatsFor(i);
      this.chart.push({
        pose: buildPose(MOVES[k]),
        beat: beat,
        lead: bpm,
        judged: false
      });
      beat += bpm;
    }
    this.totalMoves = total;
  }

  get mult() { return Math.min(4, 1 + Math.floor(this.combo / 8)); }
  // Kvalitet = prosek osnovnih poena po pokretu (bez množioca za niz).
  get quality() {
    const judged = Math.max(1, this.idx);
    return this.baseSum / (judged * 100);
  }
  get starCount() {
    if (this.idx === 0) return 0;
    const r = this.quality;
    return r >= 0.88 ? 5 : r >= 0.70 ? 4 : r >= 0.50 ? 3 : r >= 0.30 ? 2 : r > 0.08 ? 1 : 0;
  }

  vis(p) { return p && (p.visibility === undefined || p.visibility > 0.4); }

  readBody(lms) {
    if (!lms) return null;
    const need = [LM.L_SHO, LM.R_SHO, LM.L_HIP, LM.R_HIP];
    for (const i of need) if (!this.vis(lms[i])) return null;
    const px = {};
    for (let i = 0; i < lms.length; i++) px[i] = this.videoToScreen(lms[i].x, lms[i].y);
    const cx = (px[LM.L_HIP].x + px[LM.R_HIP].x) / 2;
    const cy = (px[LM.L_HIP].y + px[LM.R_HIP].y) / 2;
    const sx = (px[LM.L_SHO].x + px[LM.R_SHO].x) / 2;
    const sy = (px[LM.L_SHO].y + px[LM.R_SHO].y) / 2;
    return { px: px, lms: lms, center: { x: cx, y: cy }, unit: Math.max(24, Math.hypot(sx - cx, sy - cy)), head: px[LM.NOSE] };
  }

  // Poklapanje = koliko su zglobovi igrača blizu zglobova pokreta.
  // Sve je normalizovano na dužinu trupa i centrirano na kukove,
  // pa ne zavisi ni od udaljenosti od kamere ni od mesta u kadru.
  measureFit(body, pose) {
    if (!body || !pose) return { fit: 0, segs: [] };
    const sc = {};
    let ss = 0, sw = 0;
    for (const [key, li, w] of JOINTS) {
      if (!this.vis(body.lms[li])) continue;
      const t = key === 'head' ? pose.head : pose.joints[key];
      const x = (body.px[li].x - body.center.x) / body.unit;
      const y = (body.px[li].y - body.center.y) / body.unit;
      const d = Math.hypot(x - t.x, y - t.y) / SIG;
      const v = Math.exp(-d * d);
      sc[key] = v;
      ss += w * v; sw += w;
    }
    const segs = [];
    for (const [a, b, key] of DRAW_BONES) {
      if (!this.vis(body.lms[a]) || !this.vis(body.lms[b])) continue;
      segs.push({ a: body.px[a], b: body.px[b], frac: key ? (sc[key] === undefined ? 0 : sc[key]) : -1 });
    }
    return { fit: sw ? ss / sw : 0, segs: segs };
  }

/* ---------- petlja ---------- */
  update(dt, body) {
    this.t += dt;
    this.music.update();
    const time = this.music.now();
    const beat = time / this.music.beat;

    // otkucaj
    const bi = Math.floor(beat);
    if (bi !== this.lastBeat) { this.lastBeat = bi; this.pulse = 1; }
    this.pulse = Math.max(0, this.pulse - dt * 3.2);

    for (const p of this.parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.rot += p.vrot * dt; }
    this.parts = this.parts.filter(p => p.life > 0);
    for (const f of this.floats) { f.life -= dt * 1.1; f.y -= dt * 54; }
    this.floats = this.floats.filter(f => f.life > 0);

    if (body) {
      this.center.x = lerp(this.center.x, body.center.x, Math.min(1, dt * 6));
      this.center.y = lerp(this.center.y, body.center.y, Math.min(1, dt * 6));
      this.unit = lerp(this.unit, body.unit, Math.min(1, dt * 3));
      this.pushRibbons(body);
    }

    const cur = this.chart[this.idx];
    if (!cur) { this.finish(); return; }

    const hit = cur.beat * this.music.beat;
    const active = hit - cur.lead * this.music.beat * 0.92;
    this.cur = cur;
    this.progress = clamp((time - active) / Math.max(0.1, hit - active), 0, 1.4);

    if (time >= active) {
      const m = this.measureFit(body, cur.pose);
      this.fit = m.fit;
      this.segs = m.segs;
      if (time > hit - 0.42 && m.fit > this.bestFit) this.bestFit = m.fit;
    } else {
      this.fit = 0;
      this.segs = [];
    }

    if (time > hit + 0.2 && !cur.judged) {
      cur.judged = true;
      this.judge(this.bestFit);
      this.bestFit = 0;
      this.idx++;
      if (this.idx >= this.chart.length) this.finish();
    }
  }

  judge(fit) {
    let g = null;
    for (const G of GRADE) if (fit >= G.min) { g = G; break; }
    if (g) {
      this.hits++;
      this.combo++;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      const pts = g.pts * this.mult;
      this.score += pts;
      this.baseSum += g.pts;
      if (g.pts === 100) this.perfect++;
      this.sparkle(g.pts === 100 ? 34 : 18, g.color, g.pts === 100);
      this.sfx.tone(g.pts === 100 ? 1320 : 880, 0.14, { type: 'triangle', vol: 0.3 });
      if (g.pts === 100) this.sfx.tone(1760, 0.2, { type: 'triangle', vol: 0.22, delay: 0.08 });
      if (this.onGrade) this.onGrade(g.name, '+' + pts + (this.mult > 1 ? '  ×' + this.mult : ''), g.cls);
    } else {
      this.combo = 0;
      this.sfx.tone(220, 0.16, { type: 'sine', vol: 0.18, to: 160 });
      if (this.onGrade) this.onGrade('PROMAŠAJ', 'probaj sledeći', 'miss');
    }
  }

  finish() {
    if (this.done) return;
    this.done = true;
    this.music.stop();
    this.sfx.ready();
    if (this.onDone) setTimeout(this.onDone, 600);
  }

  pushRibbons(body) {
    const w = [LM.L_WRI, LM.R_WRI];
    for (let i = 0; i < 2; i++) {
      if (!this.vis(body.lms[w[i]])) { this.ribbons[i].length = 0; continue; }
      const p = body.px[w[i]];
      const r = this.ribbons[i];
      const last = r[r.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 2) r.push({ x: p.x, y: p.y });
      while (r.length > 26) r.shift();
    }
  }

  sparkle(n, color, hearts) {
    const cx = this.center.x, cy = this.center.y - this.unit * 0.8;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = rand(90, 460);
      this.parts.push({
        x: cx + rand(-this.unit, this.unit), y: cy + rand(-this.unit, this.unit),
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 90, g: 420,
        life: rand(0.5, 1.1), c: color, r: rand(5, 13),
        rot: Math.random() * 6, vrot: rand(-6, 6),
        heart: hearts && Math.random() < 0.45
      });
    }
  }

  /* ---------- crtanje ---------- */
  render(body) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    this.drawCamera(ctx);

    // pastelni sjaj + puls na otkucaj
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, 'rgba(40,10,50,.42)');
    g.addColorStop(0.5, 'rgba(20,6,34,.26)');
    g.addColorStop(1, 'rgba(10,2,22,.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);

    if (this.pulse > 0.02) {
      ctx.save();
      ctx.globalAlpha = this.pulse * 0.22;
      const r = ctx.createRadialGradient(this.w / 2, this.h * 0.55, this.h * 0.1, this.w / 2, this.h * 0.55, this.h * 0.95);
      r.addColorStop(0, 'rgba(255,160,230,.9)');
      r.addColorStop(1, 'rgba(255,160,230,0)');
      ctx.fillStyle = r;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.restore();
    }

    this.drawRibbons(ctx);
    if (this.cur && !this.done) this.drawGhost(ctx);
    if (body && this.segs.length) this.drawPlayer(ctx);
    this.drawParts(ctx);
    if (this.cur && !this.done) { this.drawRing(ctx); this.drawNext(ctx); }
  }

  drawCamera(ctx) {
    const c = this.coverParams();
    if (!c) {
      const g = ctx.createLinearGradient(0, 0, 0, this.h);
      g.addColorStop(0, '#2a0f3d'); g.addColorStop(1, '#0a0418');
      ctx.fillStyle = g; ctx.fillRect(0, 0, this.w, this.h);
      return;
    }
    ctx.save();
    ctx.translate(this.w, 0); ctx.scale(-1, 1);
    ctx.drawImage(this.video, this.w - c.dx - c.dw, c.dy, c.dw, c.dh);
    ctx.restore();
  }

  // Bela "senka" pokreta preko igrača.
  drawGhost(ctx) {
    const p = this.cur.pose;
    const u = this.unit, cx = this.center.x, cy = this.center.y;
    const near = clamp(this.progress, 0, 1);
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    ctx.globalAlpha = 0.14 + 0.14 * near;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 * HOLE_R * u;
    ctx.beginPath();
    for (const b of p.bones) {
      ctx.moveTo(cx + b[0].x * u, cy + b[0].y * u);
      ctx.lineTo(cx + b[1].x * u, cy + b[1].y * u);
    }
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx + p.head.x * u, cy + p.head.y * u, HEAD_R * u, 0, 6.283);
    ctx.fill();

    ctx.globalAlpha = 0.55 + 0.4 * near;
    ctx.strokeStyle = '#ff9fe0';
    ctx.shadowColor = '#ff5ac8';
    ctx.shadowBlur = 16;
    ctx.lineWidth = Math.max(2.5, 4.5);
    ctx.beginPath();
    for (const b of p.bones) {
      ctx.moveTo(cx + b[0].x * u, cy + b[0].y * u);
      ctx.lineTo(cx + b[1].x * u, cy + b[1].y * u);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + p.head.x * u, cy + p.head.y * u, HEAD_R * u, 0, 6.283);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = '900 ' + Math.round(clamp(this.h * 0.038, 15, 30)) + 'px "Segoe UI",system-ui,Arial,sans-serif';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 10;
    ctx.fillText(p.name, cx, cy - u * 2.3);
    ctx.restore();
  }

  drawPlayer(ctx) {
    ctx.save();
    ctx.lineCap = 'round';
    for (const s of this.segs) {
      if (s.frac < 0) {            // trup - samo bledo
        ctx.strokeStyle = '#ffffff'; ctx.shadowColor = '#ff9fe0';
        ctx.shadowBlur = 8; ctx.globalAlpha = 0.35; ctx.lineWidth = 4;
      } else {
        const good = s.frac > 0.82;
        ctx.strokeStyle = good ? '#ffd54f' : (s.frac > 0.5 ? '#ff5ac8' : '#00d4ff');
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = good ? 20 : 16;
        ctx.globalAlpha = good ? 0.98 : 0.92;
        ctx.lineWidth = good ? 7 : 5;
      }
      ctx.beginPath(); ctx.moveTo(s.a.x, s.a.y); ctx.lineTo(s.b.x, s.b.y); ctx.stroke();
    }
    ctx.restore();
  }

  drawRibbons(ctx) {
    const cols = [['#ff9fe0', '#c77dff'], ['#7ee8ff', '#4dffa6']];
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 0; i < 2; i++) {
      const r = this.ribbons[i];
      if (r.length < 2) continue;
      for (let k = 1; k < r.length; k++) {
        const t = k / (r.length - 1);
        ctx.globalAlpha = t * 0.75;
        ctx.strokeStyle = t > 0.6 ? cols[i][0] : cols[i][1];
        ctx.shadowColor = cols[i][0];
        ctx.shadowBlur = 14;
        ctx.lineWidth = 1 + 11 * t;
        ctx.beginPath();
        ctx.moveTo(r[k - 1].x, r[k - 1].y);
        ctx.lineTo(r[k].x, r[k].y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Prsten koji se steže do trenutka ocenjivanja.
  drawRing(ctx) {
    const cx = this.center.x, cy = this.center.y - this.unit * 0.55;
    const R = this.unit * 3.1;
    const t = clamp(this.progress, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.stroke();

    ctx.globalAlpha = 0.95;
    const col = t > 0.86 ? '#ffd54f' : '#ff9fe0';
    ctx.strokeStyle = col;
    ctx.shadowColor = col; ctx.shadowBlur = 20;
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(cx, cy, R, -1.571, -1.571 + 6.283 * t); ctx.stroke();

    // prsten koji se skuplja
    ctx.globalAlpha = 0.5 * (1 - t) + 0.2;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, R + (1 - t) * this.unit * 2.2, 0, 6.283); ctx.stroke();
    ctx.restore();
  }

  drawNext(ctx) {
    const nx = this.chart[this.idx + 1];
    if (!nx) return;
    const u = Math.max(13, Math.min(this.w, this.h) * 0.042);
    const px = this.w - u * 2.6, py = this.h - u * 2.9;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(20,6,34,.6)';
    ctx.strokeStyle = 'rgba(255,159,224,.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const x0 = px - u * 2, y0 = py - u * 2.1, w0 = u * 4, h0 = u * 3.9, r0 = 12;
    ctx.moveTo(x0 + r0, y0);
    ctx.arcTo(x0 + w0, y0, x0 + w0, y0 + h0, r0);
    ctx.arcTo(x0 + w0, y0 + h0, x0, y0 + h0, r0);
    ctx.arcTo(x0, y0 + h0, x0, y0, r0);
    ctx.arcTo(x0, y0, x0 + w0, y0, r0);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    ctx.strokeStyle = '#c77dff';
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(3, 2 * HOLE_R * u);
    ctx.beginPath();
    for (const b of nx.pose.bones) {
      ctx.moveTo(px + b[0].x * u, py + b[0].y * u);
      ctx.lineTo(px + b[1].x * u, py + b[1].y * u);
    }
    ctx.stroke();
    ctx.fillStyle = '#c77dff';
    ctx.beginPath(); ctx.arc(px + nx.pose.head.x * u, py + nx.pose.head.y * u, HEAD_R * u, 0, 6.283); ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#fff';
    ctx.font = '800 ' + Math.round(Math.max(9, u * 0.42)) + 'px "Segoe UI",system-ui,Arial,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SLEDEĆE', px, py - u * 1.55);
    ctx.restore();
  }

  drawParts(ctx) {
    ctx.save();
    for (const p of this.parts) {
      ctx.globalAlpha = clamp(p.life * 1.3, 0, 1);
      ctx.fillStyle = p.c;
      ctx.shadowColor = p.c; ctx.shadowBlur = 14;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      if (p.heart) {
        const r = p.r * 0.9;
        ctx.beginPath();
        ctx.moveTo(0, r * 0.7);
        ctx.bezierCurveTo(-r * 1.5, -r * 0.4, -r * 0.5, -r * 1.2, 0, -r * 0.45);
        ctx.bezierCurveTo(r * 0.5, -r * 1.2, r * 1.5, -r * 0.4, 0, r * 0.7);
        ctx.fill();
      } else {
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = i / 8 * 6.283, rr = i % 2 ? p.r * 0.34 : p.r;
          i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }
}

/* ================= pokretanje ================= */
const video = $('cam');
const canvas = $('game');
const sfx = new Sfx();
const tracker = new PoseTracker();
const game = new DanceGame(canvas, video, sfx);

let state = 'intro';
let last = performance.now();
let calSamples = 0, countdown = 0, toastT = 0, handsUpT = 0;
let chosen = 1;
let best = +(localStorage.getItem('dance_best') || 0);
$('best').textContent = best;

const SCREENS = ['screen-intro', 'screen-loading', 'screen-calib', 'screen-over'];
function show(id) { for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id); }
function hud(on) { $('hud').classList.toggle('hidden', !on); }
function toast(m) { const e = $('toast'); e.textContent = m; e.classList.add('show'); toastT = 2; }
function banner(main, sub, cls) {
  const e = $('banner');
  e.innerHTML = main + (sub ? '<small>' + sub + '</small>' : '');
  e.className = cls || '';
  void e.offsetWidth;
  e.classList.add('show');
}
game.onGrade = banner;
game.onDone = finish;

for (const b of document.querySelectorAll('[data-mode]')) {
  b.addEventListener('click', () => { chosen = +b.dataset.mode; startWithCamera(); });
}
$('btn-again').addEventListener('click', restart);
$('btn-menu').addEventListener('click', toMenu);
addEventListener('resize', () => game.resize());
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'm') toast(sfx.toggle() ? 'ZVUK UKLJUČEN' : 'ZVUK ISKLJUČEN');
  else if (k === 'escape') toMenu();
  else if (k === ' ' && state === 'over') { restart(); e.preventDefault(); }
});

async function startWithCamera() {
  sfx.init(); sfx.resume();
  show('screen-loading'); state = 'loading';
  $('load-msg').textContent = 'Tražim dozvolu za kameru';
  try {
    if (phoneStream) await tracker.attachStream(video, phoneStream);
    else await tracker.startCamera(video);
  } catch (e) {
    console.error(e);
    $('load-title').textContent = 'KAMERA NIJE DOSTUPNA';
    $('load-msg').textContent = 'Ova igra radi samo sa kamerom. Dozvoli pristup pa osveži stranicu.';
    setTimeout(() => { show('screen-intro'); state = 'intro'; }, 3400);
    return;
  }
  $('load-msg').textContent = 'Pripremam prepoznavanje tela...';
  try {
    await tracker.initModel(m => { $('load-msg').textContent = m; });
  } catch (e) {
    console.error(e);
    $('load-title').textContent = 'MODEL NIJE UČITAN';
    $('load-msg').textContent = 'Proveri internet pa osveži stranicu.';
    setTimeout(() => { show('screen-intro'); state = 'intro'; }, 3400);
    return;
  }
  calSamples = 0; countdown = 0;
  state = 'calib';
  show('screen-calib');
  hud(false);
}

function startPlay() {
  game.reset(chosen);
  game.music.start();
  show(null);
  hud(true);
  state = 'play';
}
function restart() { handsUpT = 0; startPlay(); }
function toMenu() { game.music.stop(); state = 'intro'; show('screen-intro'); hud(false); }

function finish() {
  state = 'over';
  hud(false);
  best = Math.max(best, Math.round(game.score));
  localStorage.setItem('dance_best', String(best));
  const st = game.starCount;
  $('bigStars').textContent = '★'.repeat(st) + '☆'.repeat(5 - st);
  $('over-title').textContent = st >= 5 ? 'SAVRŠENO!' : st >= 4 ? 'ODLIČNO!' : st >= 3 ? 'BRAVO!' : st >= 2 ? 'DOBRO!' : 'IDE TO!';
  $('r-score').textContent = Math.round(game.score);
  $('r-perfect').textContent = game.perfect;
  $('r-combo').textContent = game.bestCombo;
  $('r-best').textContent = best;
  handsUpT = 0;
  show('screen-over');
}

function handsAbove(lms) {
  if (!lms) return false;
  const lw = lms[LM.L_WRI], rw = lms[LM.R_WRI], n = lms[LM.NOSE];
  return !!(lw && rw && n && lw.y < n.y - 0.02 && rw.y < n.y - 0.02);
}

function updateHud() {
  $('score').textContent = Math.round(game.score);
  $('moveNo').textContent = game.endless
    ? 'POKRET ' + (game.idx + 1)
    : 'POKRET ' + Math.min(game.idx + 1, game.totalMoves) + ' / ' + game.totalMoves;
  $('combo').textContent = game.combo > 2 ? ('NIZ ' + game.combo + (game.mult > 1 ? '  ×' + game.mult : '')) : '';
  const st = game.starCount;
  const s = '★'.repeat(st) + '☆'.repeat(5 - st);
  if ($('stars').textContent !== s) $('stars').textContent = s;
}

/* ---------- kamera sa telefona ---------- */
let phoneStream = null;
const btnPhone = document.getElementById('btn-phone');
if (btnPhone) btnPhone.addEventListener('click', async () => {
  btnPhone.disabled = true;
  try {
    phoneStream = await requestPhoneCam(s => {
      phoneStream = s;
      if (tracker.video) tracker.video.srcObject = s;   // telefon se ponovo javio
    });
    btnPhone.textContent = '✅ TELEFON POVEZAN';
    btnPhone.classList.add('linked');
    toast('TELEFON POVEZAN — sada pokreni igru');
  } catch (e) {
    console.warn('telefon:', e);
  }
  btnPhone.disabled = false;
});

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;

  const lms = tracker.update(now);
  const body = game.readBody(lms);

  if (state === 'calib') {
    if (body) {
      calSamples++;
      game.center.x = lerp(game.center.x, body.center.x, 0.25);
      game.center.y = lerp(game.center.y, body.center.y, 0.25);
      game.unit = lerp(game.unit, body.unit, 0.25);
      $('calib-hint').textContent = 'Vidim te! Spremi se...';
    } else {
      calSamples = Math.max(0, calSamples - 2);
      $('calib-hint').textContent = 'Tražim te... stani ispred kamere';
    }
    $('calib-fill').style.width = Math.round(Math.min(1, calSamples / 45) * 100) + '%';
    if (calSamples >= 45) {
      if (countdown === 0) countdown = 3.999;
      countdown -= dt;
      const n = Math.max(1, Math.ceil(countdown - 0.999));
      if ($('calib-count').textContent !== String(n)) { $('calib-count').textContent = n; sfx.count(n === 1); }
      if (countdown <= 1) startPlay();
    } else {
      countdown = 0;
      $('calib-count').textContent = '3';
    }
    if (body) game.pushRibbons(body);

  } else if (state === 'play') {
    game.update(dt, body);
    updateHud();

  } else if (state === 'over') {
    handsUpT = handsAbove(lms) ? handsUpT + dt : Math.max(0, handsUpT - dt * 2);
    $('hu-fill').style.width = Math.round(Math.min(1, handsUpT / 1.1) * 100) + '%';
    if (handsUpT >= 1.1) restart();
  }

  game.render(body);

  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
  if ((now | 0) % 8 === 0) {
    $('status').textContent = 'PLES' + (state === 'play' ? '  ·  ' + tracker.fps + ' FPS' : '');
  }
}

window.DANCE = { game: game, tracker: tracker, MOVES: MOVES, get state() { return state; } };
$('status').textContent = 'PLES';
requestAnimationFrame(frame);
