// Voće Ninja — seci voće rukama ispred kamere.
// Zasebna igra: koristi iste module (pose.js, audio.js) ali ne menja trku.

import { Sfx } from './audio.js';
import { PoseTracker, LM, BONES } from './pose.js';
import { requestPhoneCam } from './phonecam.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];

const GRAV = 1500;              // px/s^2
const TRAIL_MS = 190;           // koliko dugo trag sečiva ostaje
const SLICE_WINDOW = 70;        // ms nad kojima merimo brzinu zamaha

const FRUITS = [
  { n: 'lubenica', r: 0.075, skin: '#2e7d32', skin2: '#14401f', flesh: '#ff4d6d', seeds: '#2b0a12', juice: '#ff4d6d' },
  { n: 'narandža', r: 0.060, skin: '#ff9800', skin2: '#c05600', flesh: '#ffc266', seeds: null, juice: '#ff9800' },
  { n: 'jabuka', r: 0.056, skin: '#e53935', skin2: '#8e1616', flesh: '#fff0dc', seeds: '#5d4037', juice: '#e53935' },
  { n: 'kivi', r: 0.052, skin: '#8d6e63', skin2: '#4e342e', flesh: '#9ccc65', seeds: '#33691e', juice: '#9ccc65' },
  { n: 'limun', r: 0.054, skin: '#fdd835', skin2: '#c9a200', flesh: '#fff7b0', seeds: null, juice: '#fdd835' },
  { n: 'šljiva', r: 0.048, skin: '#8e24aa', skin2: '#4a148c', flesh: '#e1b3ee', seeds: '#4a148c', juice: '#ba68c8' }
];
const GOLD = { n: 'zlatna', r: 0.058, skin: '#ffe082', skin2: '#ff8f00', flesh: '#fff8e1', seeds: null, juice: '#ffd54f', gold: true };

/* ================= sečivo (trag ruke ili miša) ================= */
class Blade {
  constructor(color) {
    this.pts = [];
    this.color = color;
    this.active = false;
    this.speed = 0;
  }
  push(x, y, now) {
    this.pts.push({ x: x, y: y, t: now });
    while (this.pts.length > 2 && now - this.pts[0].t > TRAIL_MS) this.pts.shift();
  }
  clear() { this.pts.length = 0; this.speed = 0; this.active = false; }

  // Deo putanje preko koga proveravamo sečenje + brzina zamaha (px/s).
  segment(now) {
    const n = this.pts.length;
    if (n < 2) return null;
    const b = this.pts[n - 1];
    let a = this.pts[0];
    for (let i = n - 2; i >= 0; i--) { a = this.pts[i]; if (b.t - a.t >= SLICE_WINDOW) break; }
    const dt = Math.max(0.016, (b.t - a.t) / 1000);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    return { ax: a.x, ay: a.y, bx: b.x, by: b.y, speed: len / dt, len: len };
  }
}

// Najmanje rastojanje tačke C do duži AB.
function segDist(ax, ay, bx, by, cx, cy) {
  const dx = bx - ax, dy = by - ay;
  const dd = dx * dx + dy * dy;
  let t = dd === 0 ? 0 : ((cx - ax) * dx + (cy - ay) * dy) / dd;
  t = clamp(t, 0, 1);
  return Math.hypot(cx - (ax + dx * t), cy - (ay + dy * t));
}

/* ================= igra ================= */
class NinjaGame {
  constructor(canvas, video, sfx) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.video = video;
    this.sfx = sfx;
    this.debug = false;
    this.onOver = null;
    this.onBanner = null;
    this.resize();
    this.reset();
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
    this.unit = Math.min(this.w, this.h * 1.4);   // osnovna mera za veličinu voća
  }

  coverParams() {
    const v = this.video;
    if (!v || !v.videoWidth) return null;
    const s = Math.max(this.w / v.videoWidth, this.h / v.videoHeight);
    const dw = v.videoWidth * s, dh = v.videoHeight * s;
    return { dx: (this.w - dw) / 2, dy: (this.h - dh) / 2, dw: dw, dh: dh };
  }
  videoToScreen(nx, ny) {
    const c = this.coverParams();
    if (!c) return { x: this.w * (1 - nx), y: this.h * ny };
    return { x: this.w - (c.dx + nx * c.dw), y: c.dy + ny * c.dh };
  }

  reset() {
    this.fruits = [];
    this.halves = [];
    this.parts = [];
    this.splats = [];
    this.floats = [];
    this.pending = [];
    this.score = 0;
    this.lives = 3;
    this.sliced = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.comboT = 0;
    this.wave = 1;
    this.spawnT = 1.2;
    this.t = 0;
    this.flash = 0;
    this.shake = 0;
    this.over = false;
    this.frenzy = 0;
  }

  /* ---------- pravljenje voća ---------- */
  fruitSize(def) { return def.r * this.unit * 0.74; }

  launch(def, bomb) {
    const r = this.fruitSize(def);
    const x = rand(this.w * 0.14, this.w * 0.86);
    const apex = rand(0.40, 0.74) * this.h;       // koliko visoko dobacuje
    const vy = -Math.sqrt(2 * GRAV * apex);
    const flight = Math.abs(vy) / GRAV * 1.7;
    const tx = rand(this.w * 0.2, this.w * 0.8);
    this.fruits.push({
      def: def, bomb: !!bomb, gold: !!def.gold,
      x: x, y: this.h + r + 12,
      vx: (tx - x) / flight, vy: vy,
      r: r, rot: rand(0, 6.28), vrot: rand(-3.4, 3.4),
      sliced: false, dead: false
    });
  }

  spawnGroup() {
    this.wave = 1 + Math.floor(this.score / 320);
    const n = clamp(1 + Math.floor(Math.random() * (1 + this.wave * 0.5)), 1, 5);
    const bombChance = Math.min(0.32, 0.05 + this.wave * 0.025);
    for (let i = 0; i < n; i++) {
      const bomb = Math.random() < bombChance;
      const gold = !bomb && Math.random() < 0.06;
      this.pending.push({ t: i * rand(0.12, 0.3), def: bomb ? FRUITS[0] : (gold ? GOLD : pick(FRUITS)), bomb: bomb });
    }
    const gap = Math.max(0.75, 2.1 - this.wave * 0.11);
    this.spawnT = gap * rand(0.85, 1.2);
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

/* ---------- petlja ---------- */
  update(dt, blades, now) {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.shake = Math.max(0, this.shake - dt * 2.4);
    this.comboT = Math.max(0, this.comboT - dt);
    if (this.comboT === 0 && this.combo > 0) this.endCombo();

    // čestice i tragovi soka
    for (const p of this.parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += GRAV * 0.55 * dt; }
    this.parts = this.parts.filter(p => p.life > 0);
    for (const s of this.splats) s.life -= dt * 0.22;
    this.splats = this.splats.filter(s => s.life > 0);
    if (this.splats.length > 60) this.splats.splice(0, this.splats.length - 60);
    for (const f of this.floats) { f.life -= dt * 1.15; f.y -= dt * 62; }
    this.floats = this.floats.filter(f => f.life > 0);

    // polovine
    for (const h of this.halves) {
      h.x += h.vx * dt; h.y += h.vy * dt; h.vy += GRAV * dt; h.rot += h.vrot * dt;
    }
    this.halves = this.halves.filter(h => h.y < this.h + h.r * 2.5);

    if (this.over) return;

    // izbacivanje
    for (const p of this.pending) p.t -= dt;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (this.pending[i].t <= 0) {
        const p = this.pending.splice(i, 1)[0];
        this.launch(p.bomb ? FRUITS[0] : p.def, p.bomb);
        this.sfx.noise(0.18, { vol: 0.1, freq: 500, type: 'lowpass' });
      }
    }
    this.spawnT -= dt;
    if (this.spawnT <= 0) this.spawnGroup();

    // fizika voća
    for (const o of this.fruits) {
      o.x += o.vx * dt; o.y += o.vy * dt; o.vy += GRAV * dt; o.rot += o.vrot * dt;
      if (o.y - o.r > this.h + 40 && o.vy > 0) {
        o.dead = true;
        if (!o.bomb) this.miss(o);
      }
    }

    // sečenje
    for (const b of blades) {
      const seg = b.segment(now);
      b.active = !!(seg && seg.speed > this.h * 0.55 && seg.len > 6);
      b.speed = seg ? seg.speed : 0;
      if (!b.active) continue;
      for (const o of this.fruits) {
        if (o.dead || o.sliced) continue;
        if (segDist(seg.ax, seg.ay, seg.bx, seg.by, o.x, o.y) <= o.r) {
          this.slice(o, Math.atan2(seg.by - seg.ay, seg.bx - seg.ax));
        }
      }
    }
    this.fruits = this.fruits.filter(o => !o.dead);
  }

  slice(o, angle) {
    o.sliced = true; o.dead = true;
    const nx = Math.cos(angle + Math.PI / 2), ny = Math.sin(angle + Math.PI / 2);

    if (o.bomb) {
      this.lives--;
      this.flash = 1; this.shake = 1;
      this.sfx.tone(90, 0.55, { type: 'sawtooth', vol: 0.55, to: 38 });
      this.sfx.noise(0.45, { vol: 0.5, freq: 420 });
      this.burst(o.x, o.y, '#ff7043', 46, 620);
      this.burst(o.x, o.y, '#ffd54f', 26, 420);
      this.addFloat(o.x, o.y, 'BOMBA!', '#ff4d5e', 1.4);
      this.endCombo();
      if (this.onBanner) this.onBanner('BOMBA!', 'izgubio si život');
      if (this.lives <= 0) this.finish();
      return;
    }

    this.sliced++;
    const base = o.gold ? 50 : 10;
    this.score += base;
    this.combo++;
    this.comboT = 0.36;
    this.bestCombo = Math.max(this.bestCombo, this.combo);

    for (const dir of [-1, 1]) {
      this.halves.push({
        def: o.def, r: o.r, x: o.x, y: o.y,
        vx: o.vx + nx * dir * rand(80, 190),
        vy: o.vy + ny * dir * rand(80, 190) - 60,
        rot: angle + (dir > 0 ? 0 : Math.PI), vrot: rand(-2.5, 2.5) + dir * 1.2
      });
    }
    this.burst(o.x, o.y, o.def.juice, o.gold ? 34 : 20, 340);
    this.splats.push({ x: o.x, y: o.y, r: o.r * rand(0.7, 1.15), c: o.def.juice, life: 1, seed: Math.random() });
    this.addFloat(o.x, o.y - o.r, '+' + base, o.gold ? '#ffd54f' : '#ffffff', o.gold ? 1.35 : 1);

    if (o.gold) {
      this.sfx.tone(880, 0.12, { type: 'triangle', vol: 0.4 });
      this.sfx.tone(1320, 0.22, { type: 'triangle', vol: 0.35, delay: 0.08 });
      if (this.onBanner) this.onBanner('ZLATNA VOĆKA', '+50');
    } else {
      this.sfx.noise(0.09, { vol: 0.26, freq: 2600, type: 'highpass' });
      this.sfx.tone(520 + this.combo * 60, 0.09, { type: 'triangle', vol: 0.22, to: 1100 });
    }
  }

  endCombo() {
    if (this.combo >= 3) {
      const bonus = 20 * (this.combo - 2);
      this.score += bonus;
      this.sfx.bonus();
      this.addFloat(this.w / 2, this.h * 0.34, '+' + bonus, '#ffd54f', 1.5);
      if (this.onBanner) this.onBanner('KOMBO x' + this.combo, '+' + bonus + ' poena');
    }
    this.combo = 0;
  }

  miss(o) {
    this.lives--;
    this.flash = 0.6;
    this.sfx.tone(420, 0.28, { type: 'sine', vol: 0.3, to: 170 });
    this.addFloat(o.x, this.h - 60, 'PROMAŠAJ', '#ff4d5e', 1.1);
    this.endCombo();
    if (this.lives <= 0) this.finish();
  }

  finish() {
    if (this.over) return;
    this.over = true;
    this.lives = Math.max(0, this.lives);
    this.sfx.gameover();
    if (this.onOver) setTimeout(this.onOver, 750);
  }

  burst(x, y, color, n, spd) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = rand(spd * 0.25, spd);
      this.parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.35, 0.95), c: color, r: rand(2, 6) });
    }
  }
  addFloat(x, y, text, c, s) { this.floats.push({ x: x, y: y, text: text, c: c, s: s || 1, life: 1 }); }

  /* ---------- crtanje ---------- */
  render(blades, lms) {
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0.01) {
      const s = this.shake * 18;
      ctx.translate(rand(-s, s), rand(-s, s));
    }
    ctx.clearRect(-40, -40, this.w + 80, this.h + 80);

    this.drawCamera(ctx);

    // zatamnjenje da voće "iskoči"
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, 'rgba(4,8,18,.62)');
    g.addColorStop(0.55, 'rgba(6,10,20,.42)');
    g.addColorStop(1, 'rgba(2,4,10,.72)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);

    this.drawSplats(ctx);
    if (lms) this.drawSkeleton(ctx, lms);

    for (const h of this.halves) this.drawHalf(ctx, h);
    for (const o of this.fruits) o.bomb ? this.drawBomb(ctx, o) : this.drawFruit(ctx, o);

    this.drawParticles(ctx);
    for (const b of blades) this.drawBlade(ctx, b);
    this.drawFloats(ctx);
    ctx.restore();

    if (this.flash > 0.01) {
      ctx.save();
      ctx.globalAlpha = this.flash * 0.6;
      const r = ctx.createRadialGradient(this.w / 2, this.h / 2, this.h * 0.2, this.w / 2, this.h / 2, this.h * 0.85);
      r.addColorStop(0, 'rgba(255,60,0,0)');
      r.addColorStop(1, 'rgba(255,40,0,.95)');
      ctx.fillStyle = r;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.restore();
    }
  }

  drawCamera(ctx) {
    const c = this.coverParams();
    if (!c) {
      const g = ctx.createLinearGradient(0, 0, 0, this.h);
      g.addColorStop(0, '#1a1024'); g.addColorStop(1, '#05060d');
      ctx.fillStyle = g; ctx.fillRect(0, 0, this.w, this.h);
      return;
    }
    ctx.save();
    ctx.translate(this.w, 0); ctx.scale(-1, 1);
    ctx.drawImage(this.video, this.w - c.dx - c.dw, c.dy, c.dw, c.dh);
    ctx.restore();
  }

  drawFruit(ctx, o) {
    ctx.save();
    ctx.translate(o.x, o.y); ctx.rotate(o.rot);
    if (o.gold) { ctx.shadowColor = '#ffd54f'; ctx.shadowBlur = 34; }
    const g = ctx.createRadialGradient(-o.r * 0.35, -o.r * 0.4, o.r * 0.12, 0, 0, o.r);
    g.addColorStop(0, o.def.skin);
    g.addColorStop(1, o.def.skin2);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, o.r, 0, 6.283); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,.28)';
    ctx.beginPath(); ctx.ellipse(-o.r * 0.34, -o.r * 0.4, o.r * 0.3, o.r * 0.17, -0.6, 0, 6.283); ctx.fill();
    if (o.def.n === 'lubenica') {
      ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = Math.max(1.5, o.r * 0.08);
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.ellipse(0, 0, o.r * 0.95, o.r * (0.2 + i * 0.24), 0, -0.9, 0.9);
        ctx.stroke();
      }
    }
    if (o.def.n === 'jabuka' || o.def.n === 'šljiva') {
      ctx.strokeStyle = '#4e342e'; ctx.lineWidth = Math.max(2, o.r * 0.1); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, -o.r * 0.9); ctx.lineTo(o.r * 0.12, -o.r * 1.25); ctx.stroke();
      ctx.fillStyle = '#43a047';
      ctx.beginPath(); ctx.ellipse(o.r * 0.42, -o.r * 1.12, o.r * 0.3, o.r * 0.15, -0.5, 0, 6.283); ctx.fill();
    }
    ctx.restore();
  }

  drawHalf(ctx, h) {
    ctx.save();
    ctx.translate(h.x, h.y); ctx.rotate(h.rot);
    // kora (polukrug)
    const g = ctx.createRadialGradient(0, h.r * 0.2, h.r * 0.1, 0, 0, h.r);
    g.addColorStop(0, h.def.skin);
    g.addColorStop(1, h.def.skin2);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, h.r, 0, Math.PI); ctx.closePath(); ctx.fill();
    // presek (meso)
    ctx.fillStyle = h.def.flesh;
    ctx.beginPath(); ctx.ellipse(0, 0, h.r * 0.86, h.r * 0.86, 0, 0, Math.PI); ctx.closePath(); ctx.fill();
    // semenke
    if (h.def.seeds) {
      ctx.fillStyle = h.def.seeds;
      for (let i = 0; i < 5; i++) {
        const a = 0.45 + i * 0.52, rr = h.r * (0.3 + (i % 2) * 0.24);
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * rr, Math.sin(a) * rr * 0.75, h.r * 0.075, h.r * 0.05, a, 0, 6.283);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawBomb(ctx, o) {
    ctx.save();
    ctx.translate(o.x, o.y); ctx.rotate(o.rot);
    const g = ctx.createRadialGradient(-o.r * 0.35, -o.r * 0.4, o.r * 0.1, 0, 0, o.r);
    g.addColorStop(0, '#5a5a5a'); g.addColorStop(1, '#0a0a0a');
    ctx.fillStyle = g;
    ctx.shadowColor = '#ff5722'; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(0, 0, o.r, 0, 6.283); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.beginPath(); ctx.ellipse(-o.r * 0.34, -o.r * 0.4, o.r * 0.26, o.r * 0.14, -0.6, 0, 6.283); ctx.fill();
    // fitilj
    ctx.strokeStyle = '#8d6e63'; ctx.lineWidth = Math.max(2, o.r * 0.12); ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -o.r * 0.95);
    ctx.quadraticCurveTo(o.r * 0.5, -o.r * 1.35, o.r * 0.25, -o.r * 1.7);
    ctx.stroke();
    // varnica
    const s = 0.7 + Math.abs(Math.sin(this.t * 18)) * 0.6;
    ctx.fillStyle = '#ffd54f';
    ctx.shadowColor = '#ff9800'; ctx.shadowBlur = 22;
    ctx.beginPath(); ctx.arc(o.r * 0.25, -o.r * 1.75, o.r * 0.17 * s, 0, 6.283); ctx.fill();
    ctx.restore();
  }

  drawBlade(ctx, b) {
    const pts = b.pts;
    if (pts.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const n = pts.length;
    for (let i = 1; i < n; i++) {
      const t = i / (n - 1);
      ctx.globalAlpha = t * (b.active ? 0.95 : 0.4);
      ctx.lineWidth = 1.5 + 15 * t * (b.active ? 1 : 0.55);
      ctx.strokeStyle = '#ffffff';
      ctx.shadowColor = b.color;
      ctx.shadowBlur = b.active ? 26 : 10;
      ctx.beginPath();
      ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
      ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
    // vrh sečiva
    const p = pts[n - 1];
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 24;
    ctx.fillStyle = b.active ? '#ffffff' : 'rgba(255,255,255,.65)';
    ctx.beginPath(); ctx.arc(p.x, p.y, b.active ? 11 : 8, 0, 6.283); ctx.fill();
    ctx.strokeStyle = b.color; ctx.lineWidth = 3; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.arc(p.x, p.y, 18, 0, 6.283); ctx.stroke();
    ctx.restore();
  }

  drawSkeleton(ctx, lms) {
    const pt = i => {
      const p = lms[i];
      if (!p || (p.visibility !== undefined && p.visibility < 0.4)) return null;
      return this.videoToScreen(p.x, p.y);
    };
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#ffd54f';
    ctx.shadowColor = '#ff8f00';
    ctx.shadowBlur = 14;
    ctx.globalAlpha = this.debug ? 0.9 : 0.34;
    ctx.lineWidth = this.debug ? 6 : 4;
    for (const bn of BONES) {
      const a = pt(bn[0]), b = pt(bn[1]);
      if (!a || !b) continue;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.restore();
  }

  drawSplats(ctx) {
    ctx.save();
    for (const s of this.splats) {
      ctx.globalAlpha = clamp(s.life, 0, 1) * 0.32;
      ctx.fillStyle = s.c;
      for (let i = 0; i < 5; i++) {
        const a = s.seed * 6.283 + i * 1.257;
        const rr = s.r * (0.18 + ((i * 7 + s.seed * 13) % 10) / 22);
        ctx.beginPath();
        ctx.arc(s.x + Math.cos(a) * s.r * 0.55, s.y + Math.sin(a) * s.r * 0.55, rr, 0, 6.283);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawParticles(ctx) {
    ctx.save();
    for (const p of this.parts) {
      ctx.globalAlpha = clamp(p.life * 1.2, 0, 1);
      ctx.fillStyle = p.c;
      ctx.shadowColor = p.c; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
    }
    ctx.restore();
  }

  drawFloats(ctx) {
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of this.floats) {
      ctx.globalAlpha = clamp(f.life, 0, 1);
      ctx.font = '900 ' + Math.round(24 * f.s) + 'px "Segoe UI",system-ui,Arial,sans-serif';
      ctx.fillStyle = f.c;
      ctx.shadowColor = f.c; ctx.shadowBlur = 16;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
  }
}

/* ================= pokretanje ================= */
const video = $('cam');
const canvas = $('game');
const sfx = new Sfx();
const tracker = new PoseTracker();
const game = new NinjaGame(canvas, video, sfx);

let state = 'intro';          // intro | loading | ready | play | over
let inputMode = 'mouse';      // pose | mouse
let last = performance.now();
let readyT = 0;
let toastT = 0;
let handsUpT = 0;
let best = +(localStorage.getItem('ninja_best') || 0);
$('best').textContent = best;

const bladeL = new Blade('#4dffa6');
const bladeR = new Blade('#ff7043');
const bladeM = new Blade('#7ee8ff');
const mouse = { x: 0, y: 0, on: false };

const SCREENS = ['screen-intro', 'screen-loading', 'screen-ready', 'screen-over'];
function show(id) { for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id); }
function hud(on) { $('hud').classList.toggle('hidden', !on); }
function toast(m) { const e = $('toast'); e.textContent = m; e.classList.add('show'); toastT = 2; }
function banner(main, sub) {
  const e = $('banner');
  e.innerHTML = main + (sub ? '<small>' + sub + '</small>' : '');
  e.classList.remove('show');
  void e.offsetWidth;
  e.classList.add('show');
}
game.onBanner = banner;
game.onOver = gameOver;

/* ---------- ulaz ---------- */
canvas.addEventListener('mousemove', e => {
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.on = true;
});
canvas.addEventListener('mouseleave', () => { mouse.on = false; bladeM.clear(); });
canvas.addEventListener('touchmove', e => {
  const t = e.touches[0];
  if (t) { mouse.x = t.clientX; mouse.y = t.clientY; mouse.on = true; }
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchend', () => { mouse.on = false; bladeM.clear(); });

addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'm') toast(sfx.toggle() ? 'ZVUK UKLJUČEN' : 'ZVUK ISKLJUČEN');
  else if (k === 'b') { game.debug = !game.debug; }
  else if (k === 'escape') toMenu();
  else if (k === ' ' && state === 'over') { restart(); e.preventDefault(); }
});
addEventListener('resize', () => game.resize());

$('btn-camera').addEventListener('click', startWithCamera);
$('btn-mouse').addEventListener('click', () => {
  sfx.init(); sfx.resume();
  inputMode = 'mouse'; tracker.mode = 'keys';
  startReady();
});
$('btn-again').addEventListener('click', restart);
$('btn-menu').addEventListener('click', toMenu);

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
    $('load-msg').textContent = 'Dozvoli pristup kameri pa osveži stranicu. Možeš i mišem.';
    setTimeout(() => { show('screen-intro'); state = 'intro'; }, 3200);
    return;
  }
  $('load-msg').textContent = 'Pripremam prepoznavanje ruku...';
  try {
    await tracker.initModel(m => { $('load-msg').textContent = m; });
    inputMode = 'pose';
  } catch (e) {
    console.error(e);
    inputMode = 'mouse'; tracker.mode = 'keys';
    toast('MODEL NIJE UČITAN — IGRAJ MIŠEM');
  }
  startReady();
}

function startReady() {
  game.reset();
  bladeL.clear(); bladeR.clear(); bladeM.clear();
  readyT = 3.999;
  $('ready-count').textContent = '3';
  $('ready-hint').textContent = inputMode === 'pose'
    ? 'Stani tako da ti se vide ruke i podigni ih.'
    : 'Pomeraj miš da sečeš.';
  show('screen-ready');
  hud(false);
  state = 'ready';
}

function startPlay() {
  show(null);
  hud(true);
  updateHud();
  state = 'play';
  sfx.ready();
}

function restart() { handsUpT = 0; startReady(); }
function toMenu() { state = 'intro'; show('screen-intro'); hud(false); }

function gameOver() {
  state = 'over';
  hud(false);
  best = Math.max(best, Math.round(game.score));
  localStorage.setItem('ninja_best', String(best));
  $('r-score').textContent = Math.round(game.score);
  $('r-fruit').textContent = game.sliced;
  $('r-combo').textContent = game.bestCombo;
  $('r-best').textContent = best;
  $('handsup').classList.toggle('hidden', inputMode !== 'pose');
  handsUpT = 0;
  show('screen-over');
}

/* ---------- sečiva iz poze ---------- */
function handPoint(lms, wrist, index) {
  const w = lms[wrist], i = lms[index];
  const okv = p => p && (p.visibility === undefined || p.visibility > 0.35);
  if (!okv(w)) return null;
  const nx = okv(i) ? (w.x * 0.35 + i.x * 0.65) : w.x;
  const ny = okv(i) ? (w.y * 0.35 + i.y * 0.65) : w.y;
  return game.videoToScreen(nx, ny);
}

function collectBlades(lms, now) {
  const out = [];
  if (inputMode === 'pose' && lms) {
    const l = handPoint(lms, LM.L_WRI, 19);
    const r = handPoint(lms, LM.R_WRI, 20);
    if (l) { bladeL.push(l.x, l.y, now); out.push(bladeL); } else bladeL.clear();
    if (r) { bladeR.push(r.x, r.y, now); out.push(bladeR); } else bladeR.clear();
  }
  if (mouse.on) { bladeM.push(mouse.x, mouse.y, now); out.push(bladeM); }
  return out;
}

function handsAbove(lms) {
  if (!lms) return false;
  const lw = lms[LM.L_WRI], rw = lms[LM.R_WRI], n = lms[LM.NOSE];
  return !!(lw && rw && n && lw.y < n.y - 0.02 && rw.y < n.y - 0.02);
}

/* ---------- HUD ---------- */
function updateHud() {
  $('score').textContent = Math.round(game.score);
  $('wave').textContent = 'TALAS ' + game.wave;
  $('combo').textContent = game.combo > 1 ? ('KOMBO ' + game.combo) : '';
  const el = $('lives');
  if (el.dataset.n !== String(game.lives)) {
    let s = '';
    for (let i = 0; i < 3; i++) s += '<i class="' + (i < game.lives ? '' : 'off') + '">♥</i>';
    el.innerHTML = s;
    el.dataset.n = String(game.lives);
  }
}

/* ---------- petlja ---------- */
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;

  const lms = tracker.update(now);
  const blades = collectBlades(lms, now);

  if (state === 'ready') {
    readyT -= dt;
    const n = Math.max(1, Math.ceil(readyT - 0.999));
    if ($('ready-count').textContent !== String(n)) { $('ready-count').textContent = n; sfx.count(n === 1); }
    if (readyT <= 1) startPlay();

  } else if (state === 'play') {
    game.update(dt, blades, now);
    updateHud();

  } else if (state === 'over') {
    game.update(dt, [], now);
    if (inputMode === 'pose') {
      handsUpT = handsAbove(lms) ? handsUpT + dt : Math.max(0, handsUpT - dt * 2);
      $('hu-fill').style.width = Math.round(Math.min(1, handsUpT / 1.1) * 100) + '%';
      if (handsUpT >= 1.1) restart();
    }
  }

  game.render(blades, inputMode === 'pose' ? lms : null);

  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
  if ((now | 0) % 8 === 0) {
    const m = inputMode === 'pose' ? 'RUKE' : 'MIŠ';
    $('status').textContent = m + (state === 'play' ? '  ·  ' + tracker.fps + ' FPS' : '') + (game.debug ? '  ·  DEBUG' : '');
  }
}

window.NINJA = { game: game, tracker: tracker, blades: [bladeL, bladeR, bladeM], get state() { return state; } };
$('status').textContent = 'MIŠ';
requestAnimationFrame(frame);
