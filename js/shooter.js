// Dron Napad — pucačina pokretom. Ruke su nišani.
// Zasebna igra: koristi iste module (pose.js, audio.js), ne menja ostale igre.

import { Sfx } from './audio.js';
import { PoseTracker, LM, BONES } from './pose.js';
import { requestPhoneCam } from './phonecam.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;

const TRAIL_MS = 220;
const JAB_WINDOW = 70;      // ms nad kojima merimo brzinu trzaja
const LOCK_TIME = 0.40;     // s držanja nišana na meti
const COOLDOWN = 0.26;      // s između dva pucnja iz iste ruke

const TYPES = {
  dron:  { r: 42, hp: 1, pts: 10, color: '#ff6b7a', speed: 1.00 },
  brzi:  { r: 26, hp: 1, pts: 20, color: '#ffd54f', speed: 1.45 },
  oklop: { r: 64, hp: 3, pts: 35, color: '#b47cff', speed: 0.66 },
  bonus: { r: 30, hp: 1, pts: 60, color: '#4dffa6', speed: 1.35 },
  ptica: { r: 34, hp: 1, pts: 0,  color: '#ffffff', speed: 1.00 }
};

/* ================= nišan (ruka ili miš) ================= */
class Gun {
  constructor(color, name) {
    this.color = color;
    this.name = name;
    this.pts = [];
    this.x = 0; this.y = 0;
    this.live = false;          // da li se ruka trenutno vidi
    this.cool = 0;
    this.lockTarget = null;
    this.lockT = 0;
    this.speed = 0;
    this.wasFast = false;
    this.flash = 0;
    this.spin = Math.random() * 6;
  }
  push(x, y, now) {
    this.x = x; this.y = y; this.live = true;
    this.pts.push({ x: x, y: y, t: now });
    while (this.pts.length > 2 && now - this.pts[0].t > TRAIL_MS) this.pts.shift();
  }
  clear() { this.pts.length = 0; this.live = false; this.lockTarget = null; this.lockT = 0; this.speed = 0; }

  // brzina ruke (px/s) i pozicija pre trzaja
  motion(now) {
    const n = this.pts.length;
    if (n < 2) return { speed: 0, ax: this.x, ay: this.y };
    const b = this.pts[n - 1];
    let a = this.pts[0];
    for (let i = n - 2; i >= 0; i--) { a = this.pts[i]; if (b.t - a.t >= JAB_WINDOW) break; }
    const dt = Math.max(0.016, (b.t - a.t) / 1000);
    return { speed: Math.hypot(b.x - a.x, b.y - a.y) / dt, ax: a.x, ay: a.y };
  }
}

/* ================= igra ================= */
class Shooter {
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
    this.k = Math.min(this.w, this.h * 1.5) / 1000;   // skala za veličine
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
    this.foes = [];
    this.shots = [];
    this.parts = [];
    this.floats = [];
    this.score = 0;
    this.lives = 3;
    this.kills = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.wave = 1;
    this.spawnT = 1.4;
    this.t = 0;
    this.shake = 0;
    this.flash = 0;
    this.danger = 0;
    this.over = false;
  }

  get mult() { return Math.min(5, 1 + Math.floor(this.combo / 5)); }

  /* ---------- neprijatelji ---------- */
  spawn() {
    const w = this.wave;
    let kind = 'dron';
    const r = Math.random();
    if (r < 0.11) kind = 'ptica';
    else if (r < 0.17) kind = 'bonus';
    else if (r < 0.17 + Math.min(0.3, 0.05 + w * 0.03)) kind = 'oklop';
    else if (r < 0.55 + Math.min(0.25, w * 0.03)) kind = 'brzi';

    const T = TYPES[kind];
    if (kind === 'ptica') {
      const dir = Math.random() < 0.5 ? 1 : -1;
      const y = rand(this.h * 0.18, this.h * 0.55);
      this.foes.push({
        kind: kind, T: T, dove: true,
        x: dir > 0 ? -60 : this.w + 60, y: y,
        vx: dir * rand(110, 190) * this.k * 1.6, z: 0.45,
        hp: 1, maxHp: 1, r: T.r * this.k * 1.15,
        phase: Math.random() * 6, dead: false
      });
      return;
    }

    const x0 = rand(this.w * 0.08, this.w * 0.92);
    const y0 = rand(this.h * 0.08, this.h * 0.3);
    const x1 = clamp(x0 + rand(-this.w * 0.25, this.w * 0.25), this.w * 0.12, this.w * 0.88);
    const travel = Math.max(3.2, 8.6 - w * 0.32) / T.speed;
    this.foes.push({
      kind: kind, T: T, dove: false,
      x0: x0, y0: y0, x1: x1, y1: this.h * 1.02,
      x: x0, y: y0, z: 1, vz: 1 / travel,
      hp: T.hp, maxHp: T.hp,
      baseR: T.r * this.k, r: T.r * this.k * 0.36,
      sway: rand(0.2, 1) * (Math.random() < 0.5 ? -1 : 1),
      phase: Math.random() * 6, rot: 0, dead: false, hitT: 0
    });
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
  update(dt, guns, now) {
    this.t += dt;
    this.shake = Math.max(0, this.shake - dt * 2.6);
    this.flash = Math.max(0, this.flash - dt * 2.2);

    for (const p of this.parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 520 * dt; p.vx *= 0.98; }
    this.parts = this.parts.filter(p => p.life > 0);
    for (const s of this.shots) s.life -= dt * 5.5;
    this.shots = this.shots.filter(s => s.life > 0);
    for (const f of this.floats) { f.life -= dt * 1.15; f.y -= dt * 60; }
    this.floats = this.floats.filter(f => f.life > 0);

    for (const g of guns) {
      g.cool = Math.max(0, g.cool - dt);
      g.flash = Math.max(0, g.flash - dt * 6);
      g.spin += dt * 1.2;
    }

    if (this.over) return;

    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawn();
      this.spawnT = Math.max(0.6, 2.5 - this.wave * 0.12) * rand(0.85, 1.25);
    }

    let closest = 1;
    for (const f of this.foes) {
      if (f.dead) continue;
      f.phase += dt;
      if (f.dove) {
        f.x += f.vx * dt;
        if (f.x < -120 || f.x > this.w + 120) f.dead = true;
        continue;
      }
      f.z -= f.vz * dt;
      f.hitT = Math.max(0, f.hitT - dt * 4);
      const p = 1 - f.z;
      const scale = 0.36 + p * p * 1.0;
      f.x = lerp(f.x0, f.x1, p) + Math.sin(f.phase * 1.7) * 26 * f.sway * this.k * scale;
      f.y = lerp(f.y0, f.y1, p * p);
      f.r = f.baseR * scale;
      f.rot += dt * (f.kind === 'brzi' ? 4 : 1.4);
      if (f.z < closest) closest = f.z;
      if (f.z <= 0) {
        f.dead = true;
        this.escaped(f);
      }
    }
    this.danger = clamp(1 - closest / 0.25, 0, 1);
    this.foes = this.foes.filter(f => !f.dead);

    // nišanjenje i pucanje
    for (const g of guns) {
      if (!g.live) { g.lockTarget = null; g.lockT = 0; continue; }
      const m = g.motion(now);
      g.speed = m.speed;

      // TRZAJ = pucanj
      const fast = m.speed > this.h * 1.3;
      if (fast && !g.wasFast && g.cool <= 0) this.fire(g, m.ax, m.ay);
      g.wasFast = fast;

      // ZAKLJUČAVANJE = automatski pucanj (ne radi na ptice)
      const t = this.pick(g.x, g.y);
      if (t && !t.dove) {
        if (g.lockTarget !== t) { g.lockTarget = t; g.lockT = 0; }
        g.lockT += dt;
        if (g.lockT >= LOCK_TIME && g.cool <= 0) { g.lockT = 0; this.fire(g, t.x, t.y); }
      } else {
        g.lockTarget = null;
        g.lockT = 0;
      }
    }
  }

  // Meta ispod nišana (najbliža = najmanji z).
  pick(x, y) {
    let best = null;
    for (const f of this.foes) {
      if (f.dead) continue;
      const rr = f.r * 1.3;
      if ((x - f.x) * (x - f.x) + (y - f.y) * (y - f.y) <= rr * rr) {
        if (!best || f.z < best.z) best = f;
      }
    }
    return best;
  }

  fire(g, x, y) {
    g.cool = COOLDOWN;
    g.flash = 1;
    g.lockT = 0;
    const target = this.pick(x, y);
    const tx = target ? target.x : x;
    const ty = target ? target.y : y;
    this.shots.push({ x0: g.x, y0: g.y, x1: tx, y1: ty, c: g.color, life: 1 });
    this.sfx.tone(880, 0.09, { type: 'sawtooth', vol: 0.3, to: 180 });
    this.sfx.noise(0.07, { vol: 0.16, freq: 2400, type: 'highpass' });

    if (!target) {
      this.combo = 0;
      return;
    }
    if (target.dove) {
      target.dead = true;
      this.lives--;
      this.combo = 0;
      this.flash = 1; this.shake = 0.9;
      this.sfx.hit();
      this.burst(tx, ty, '#ffffff', 26, 380);
      this.addFloat(tx, ty, 'PRIJATELJ!', '#ff6b7a', 1.35);
      if (this.onBanner) this.onBanner('PRIJATELJ OBOREN', 'izgubio si život', true);
      if (this.lives <= 0) this.finish();
      return;
    }

    target.hp--;
    target.hitT = 1;
    this.burst(tx, ty, target.T.color, 8, 220);
    if (target.hp > 0) {
      this.sfx.noise(0.08, { vol: 0.2, freq: 900 });
      return;
    }

    target.dead = true;
    this.kills++;
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const pts = target.T.pts * this.mult;
    this.score += pts;
    this.burst(tx, ty, target.T.color, 30, 460);
    this.burst(tx, ty, '#ffffff', 12, 300);
    this.addFloat(tx, ty, '+' + pts, target.kind === 'bonus' ? '#4dffa6' : '#ffffff', target.kind === 'bonus' ? 1.35 : 1);
    this.sfx.noise(0.3, { vol: 0.34, freq: 620 });
    this.sfx.tone(200, 0.28, { type: 'sawtooth', vol: 0.28, to: 55 });
    if (target.kind === 'bonus' && this.onBanner) this.onBanner('BONUS META', '+' + pts);

    if (this.combo > 0 && this.combo % 10 === 0 && this.onBanner) {
      this.onBanner('KOMBO x' + this.mult, this.combo + ' pogodaka zaredom');
    }
    if (this.kills > 0 && this.kills % 10 === 0) {
      this.wave++;
      this.sfx.level();
      if (this.onBanner) this.onBanner('TALAS ' + this.wave, 'brže i više njih');
    }
  }

  escaped(f) {
    if (f.kind === 'bonus') return;          // bonus meta sme da pobegne
    this.lives--;
    this.combo = 0;
    this.flash = 0.7; this.shake = 0.8;
    this.sfx.tone(160, 0.4, { type: 'square', vol: 0.3, to: 70 });
    this.addFloat(f.x, this.h - 80, 'PROBIO SE!', '#ff6b7a', 1.15);
    if (this.lives <= 0) this.finish();
  }

  finish() {
    if (this.over) return;
    this.over = true;
    this.lives = Math.max(0, this.lives);
    this.sfx.gameover();
    if (this.onOver) setTimeout(this.onOver, 750);
  }

  burst(x, y, c, n, spd) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = rand(spd * 0.2, spd);
      this.parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.85), c: c, r: rand(1.5, 5) });
    }
  }
  addFloat(x, y, text, c, s) { this.floats.push({ x: x, y: y, text: text, c: c, s: s || 1, life: 1 }); }

  /* ---------- crtanje ---------- */
  render(guns, lms) {
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0.01) {
      const s = this.shake * 16;
      ctx.translate(rand(-s, s), rand(-s, s));
    }
    ctx.clearRect(-40, -40, this.w + 80, this.h + 80);

    this.drawCamera(ctx);
    this.drawOverlay(ctx);
    if (lms) this.drawSkeleton(ctx, lms);

    const sorted = this.foes.slice().sort((a, b) => b.z - a.z);
    for (const f of sorted) f.dove ? this.drawDove(ctx, f) : this.drawFoe(ctx, f);

    this.drawShots(ctx, guns);
    this.drawParticles(ctx);
    for (const g of guns) this.drawCrosshair(ctx, g);
    this.drawFloats(ctx);
    ctx.restore();
    this.drawDanger(ctx);
  }

  drawCamera(ctx) {
    const c = this.coverParams();
    if (!c) {
      const g = ctx.createLinearGradient(0, 0, 0, this.h);
      g.addColorStop(0, '#071a22'); g.addColorStop(1, '#02060a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, this.w, this.h);
      return;
    }
    ctx.save();
    ctx.translate(this.w, 0); ctx.scale(-1, 1);
    ctx.drawImage(this.video, this.w - c.dx - c.dw, c.dy, c.dw, c.dh);
    ctx.restore();
  }

  drawOverlay(ctx) {
    ctx.save();
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, 'rgba(2,14,20,.66)');
    g.addColorStop(0.6, 'rgba(3,10,16,.4)');
    g.addColorStop(1, 'rgba(1,6,10,.72)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);

    // taktička mreža
    ctx.globalAlpha = 0.1;
    ctx.strokeStyle = '#7ee8ff';
    ctx.lineWidth = 1;
    const step = Math.max(60, this.w / 16);
    ctx.beginPath();
    for (let x = step / 2; x < this.w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, this.h); }
    for (let y = step / 2; y < this.h; y += step) { ctx.moveTo(0, y); ctx.lineTo(this.w, y); }
    ctx.stroke();

    // linija horizonta + odsjaj
    ctx.globalAlpha = 0.35;
    const hy = this.h * 0.88;
    const lg = ctx.createLinearGradient(0, hy - 60, 0, hy + 10);
    lg.addColorStop(0, 'rgba(126,232,255,0)');
    lg.addColorStop(1, 'rgba(126,232,255,.35)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, hy - 60, this.w, 70);
    ctx.restore();
  }

  drawFoe(ctx, f) {
    const c = f.T.color;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.globalAlpha = clamp(0.5 + (1 - f.z) * 1.2, 0.5, 1);

    if (f.hitT > 0) { ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 40 * f.hitT; }

    if (f.kind === 'brzi') {
      ctx.rotate(f.rot);
      ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.moveTo(0, -f.r); ctx.lineTo(f.r * 0.85, f.r * 0.7); ctx.lineTo(0, f.r * 0.3); ctx.lineTo(-f.r * 0.85, f.r * 0.7);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(0, 0, f.r * 0.18, 0, 6.283); ctx.fill();

    } else if (f.kind === 'bonus') {
      ctx.rotate(f.rot * 0.7);
      ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 30;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * 6.283, rr = i % 2 ? f.r * 0.45 : f.r;
        i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill();

    } else {
      const big = f.kind === 'oklop';
      // telo (šestougao)
      ctx.rotate(Math.sin(f.phase * 1.5) * 0.12);
      const g = ctx.createRadialGradient(-f.r * 0.3, -f.r * 0.3, f.r * 0.1, 0, 0, f.r);
      g.addColorStop(0, big ? '#6b4b9e' : '#4a2a33');
      g.addColorStop(1, '#0d0d12');
      ctx.fillStyle = g;
      ctx.strokeStyle = c;
      ctx.lineWidth = Math.max(2, f.r * 0.09);
      ctx.shadowColor = c; ctx.shadowBlur = 18;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * 6.283 + 0.52, rr = f.r * 0.78;
        i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // rotori
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,.55)';
      ctx.lineWidth = Math.max(1, f.r * 0.05);
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const rx = sx * f.r * 0.78, ry = sy * f.r * 0.62;
        ctx.beginPath(); ctx.arc(rx, ry, f.r * 0.26, 0, 6.283); ctx.stroke();
        ctx.save();
        ctx.translate(rx, ry); ctx.rotate(f.rot * 7);
        ctx.beginPath(); ctx.moveTo(-f.r * 0.24, 0); ctx.lineTo(f.r * 0.24, 0); ctx.stroke();
        ctx.restore();
      }
      // oko
      ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(0, 0, f.r * 0.2, 0, 6.283); ctx.fill();
      // oklop: prsten zdravlja
      if (big) {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = Math.max(3, f.r * 0.1);
        ctx.beginPath(); ctx.arc(0, 0, f.r * 1.05, 0, 6.283); ctx.stroke();
        ctx.strokeStyle = c;
        ctx.beginPath(); ctx.arc(0, 0, f.r * 1.05, -1.571, -1.571 + 6.283 * (f.hp / f.maxHp)); ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawDove(ctx, f) {
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.scale(f.vx < 0 ? -1 : 1, 1);
    const flap = Math.sin(f.phase * 9) * 0.6;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#9be8ff'; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.ellipse(0, 0, f.r * 0.5, f.r * 0.26, 0, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.arc(f.r * 0.45, -f.r * 0.14, f.r * 0.16, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#ffb347';
    ctx.beginPath(); ctx.moveTo(f.r * 0.6, -f.r * 0.14); ctx.lineTo(f.r * 0.8, -f.r * 0.06); ctx.lineTo(f.r * 0.6, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.rotate(s * (0.5 + flap));
      ctx.beginPath(); ctx.ellipse(-f.r * 0.1, -f.r * 0.45, f.r * 0.22, f.r * 0.52, 0, 0, 6.283); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  drawShots(ctx, guns) {
    ctx.save();
    for (const s of this.shots) {
      ctx.globalAlpha = clamp(s.life, 0, 1);
      ctx.strokeStyle = s.c;
      ctx.shadowColor = s.c; ctx.shadowBlur = 22;
      ctx.lineCap = 'round';
      ctx.lineWidth = 2 + 7 * s.life;
      ctx.beginPath(); ctx.moveTo(s.x0, s.y0); ctx.lineTo(s.x1, s.y1); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(s.x1, s.y1, 6 + 16 * s.life, 0, 6.283); ctx.fill();
    }
    ctx.restore();
  }

  drawCrosshair(ctx, g) {
    if (!g.live) return;
    const r = 34 * Math.max(0.7, this.k * 1.1);
    const t = this.pick(g.x, g.y);
    const dove = t && t.dove;
    const col = dove ? '#ffffff' : g.color;
    ctx.save();
    ctx.translate(g.x, g.y);

    if (g.flash > 0) {
      ctx.globalAlpha = g.flash;
      const fg = ctx.createRadialGradient(0, 0, 2, 0, 0, r * 2.2);
      fg.addColorStop(0, '#ffffff'); fg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(0, 0, r * 2.2, 0, 6.283); ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = col;
    ctx.shadowColor = col; ctx.shadowBlur = 16;
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.95;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, 6.283); ctx.stroke();

    // rotirajuće zagrade
    ctx.save();
    ctx.rotate(g.spin * (t ? 1.8 : 0.5));
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * 6.283;
      ctx.beginPath();
      ctx.arc(0, 0, r, a - 0.28, a + 0.28);
      ctx.stroke();
    }
    ctx.restore();

    // krstić
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r * 0.3, 0); ctx.lineTo(r * 0.3, 0);
    ctx.moveTo(0, -r * 0.3); ctx.lineTo(0, r * 0.3);
    ctx.stroke();

    // punjenje zaključavanja
    if (g.lockT > 0 && !dove) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.82, -1.571, -1.571 + 6.283 * clamp(g.lockT / LOCK_TIME, 0, 1));
      ctx.stroke();
    }
    if (dove) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 ' + Math.round(13 * Math.max(0.8, this.k)) + 'px "Segoe UI",system-ui,Arial,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('NE PUCAJ', 0, -r * 1.5);
    }
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
    ctx.strokeStyle = '#7ee8ff';
    ctx.shadowColor = '#7ee8ff'; ctx.shadowBlur = 12;
    ctx.globalAlpha = this.debug ? 0.9 : 0.3;
    ctx.lineWidth = this.debug ? 6 : 4;
    for (const bn of BONES) {
      const a = pt(bn[0]), b = pt(bn[1]);
      if (!a || !b) continue;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.restore();
  }

  drawParticles(ctx) {
    ctx.save();
    for (const p of this.parts) {
      ctx.globalAlpha = clamp(p.life * 1.3, 0, 1);
      ctx.fillStyle = p.c;
      ctx.shadowColor = p.c; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
    }
    ctx.restore();
  }

  drawFloats(ctx) {
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of this.floats) {
      ctx.globalAlpha = clamp(f.life, 0, 1);
      ctx.font = '900 ' + Math.round(23 * f.s) + 'px "Segoe UI",system-ui,Arial,sans-serif';
      ctx.fillStyle = f.c;
      ctx.shadowColor = f.c; ctx.shadowBlur = 16;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
  }

  drawDanger(ctx) {
    const d = Math.max(this.danger * (0.55 + 0.45 * Math.abs(Math.sin(this.t * 7))), this.flash);
    if (d < 0.02) return;
    ctx.save();
    ctx.globalAlpha = d * 0.6;
    const r = ctx.createRadialGradient(this.w / 2, this.h / 2, this.h * 0.25, this.w / 2, this.h / 2, this.h * 0.9);
    r.addColorStop(0, 'rgba(255,0,40,0)');
    r.addColorStop(1, 'rgba(255,20,50,.95)');
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.restore();
  }
}

/* ================= pokretanje ================= */
const video = $('cam');
const canvas = $('game');
const sfx = new Sfx();
const tracker = new PoseTracker();
const game = new Shooter(canvas, video, sfx);

let state = 'intro';
let inputMode = 'mouse';
let last = performance.now();
let readyT = 0, toastT = 0, handsUpT = 0;
let best = +(localStorage.getItem('shooter_best') || 0);
$('best').textContent = best;

const gunL = new Gun('#4dffa6', 'L');
const gunR = new Gun('#ff6b7a', 'D');
const gunM = new Gun('#7ee8ff', 'M');
const mouse = { x: 0, y: 0, on: false, down: false };

const SCREENS = ['screen-intro', 'screen-loading', 'screen-ready', 'screen-over'];
function show(id) { for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id); }
function hud(on) { $('hud').classList.toggle('hidden', !on); }
function toast(m) { const e = $('toast'); e.textContent = m; e.classList.add('show'); toastT = 2; }
function banner(main, sub, bad) {
  const e = $('banner');
  e.innerHTML = main + (sub ? '<small>' + sub + '</small>' : '');
  e.classList.toggle('bad', !!bad);
  e.classList.remove('show');
  void e.offsetWidth;
  e.classList.add('show');
}
game.onBanner = banner;
game.onOver = gameOver;

/* ---------- ulaz ---------- */
canvas.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.on = true; });
canvas.addEventListener('mouseleave', () => { mouse.on = false; mouse.down = false; gunM.clear(); });
canvas.addEventListener('mousedown', e => {
  mouse.down = true; mouse.x = e.clientX; mouse.y = e.clientY; mouse.on = true;
  if (state === 'play' && gunM.cool <= 0) game.fire(gunM, mouse.x, mouse.y);
});
addEventListener('mouseup', () => { mouse.down = false; });
canvas.addEventListener('touchstart', e => {
  const t = e.touches[0];
  if (t) { mouse.x = t.clientX; mouse.y = t.clientY; mouse.on = true; if (state === 'play' && gunM.cool <= 0) game.fire(gunM, mouse.x, mouse.y); }
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  const t = e.touches[0];
  if (t) { mouse.x = t.clientX; mouse.y = t.clientY; mouse.on = true; }
  e.preventDefault();
}, { passive: false });

addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'm') toast(sfx.toggle() ? 'ZVUK UKLJUČEN' : 'ZVUK ISKLJUČEN');
  else if (k === 'b') game.debug = !game.debug;
  else if (k === 'escape') toMenu();
  else if (k === ' ') {
    if (state === 'over') restart();
    else if (state === 'play' && mouse.on && gunM.cool <= 0) game.fire(gunM, mouse.x, mouse.y);
    e.preventDefault();
  }
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
  gunL.clear(); gunR.clear(); gunM.clear();
  readyT = 3.999;
  $('ready-count').textContent = '3';
  $('ready-hint').textContent = inputMode === 'pose'
    ? 'Podigni ruke — vidiš dva nišana.'
    : 'Nišani mišem, klik je okidač.';
  show('screen-ready');
  hud(false);
  state = 'ready';
}

function startPlay() { show(null); hud(true); updateHud(); state = 'play'; sfx.ready(); }
function restart() { handsUpT = 0; startReady(); }
function toMenu() { state = 'intro'; show('screen-intro'); hud(false); }

function gameOver() {
  state = 'over';
  hud(false);
  best = Math.max(best, Math.round(game.score));
  localStorage.setItem('shooter_best', String(best));
  $('r-score').textContent = Math.round(game.score);
  $('r-kills').textContent = game.kills;
  $('r-wave').textContent = game.wave;
  $('r-best').textContent = best;
  $('handsup').classList.toggle('hidden', inputMode !== 'pose');
  handsUpT = 0;
  show('screen-over');
}

/* ---------- ruke ---------- */
function handPoint(lms, wrist, index) {
  const w = lms[wrist], i = lms[index];
  const okv = p => p && (p.visibility === undefined || p.visibility > 0.35);
  if (!okv(w)) return null;
  const nx = okv(i) ? (w.x * 0.3 + i.x * 0.7) : w.x;
  const ny = okv(i) ? (w.y * 0.3 + i.y * 0.7) : w.y;
  return game.videoToScreen(nx, ny);
}

function collectGuns(lms, now) {
  const out = [];
  if (inputMode === 'pose' && lms) {
    const l = handPoint(lms, LM.L_WRI, 19);
    const r = handPoint(lms, LM.R_WRI, 20);
    if (l) { gunL.push(l.x, l.y, now); out.push(gunL); } else gunL.clear();
    if (r) { gunR.push(r.x, r.y, now); out.push(gunR); } else gunR.clear();
  }
  if (mouse.on) { gunM.push(mouse.x, mouse.y, now); out.push(gunM); }
  return out;
}

function handsAbove(lms) {
  if (!lms) return false;
  const lw = lms[LM.L_WRI], rw = lms[LM.R_WRI], n = lms[LM.NOSE];
  return !!(lw && rw && n && lw.y < n.y - 0.02 && rw.y < n.y - 0.02);
}

function updateHud() {
  $('score').textContent = Math.round(game.score);
  $('wave').textContent = 'TALAS ' + game.wave;
  $('combo').textContent = game.combo > 2 ? ('KOMBO x' + game.mult + '  (' + game.combo + ')') : '';
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
  const guns = collectGuns(lms, now);

  if (state === 'ready') {
    readyT -= dt;
    const n = Math.max(1, Math.ceil(readyT - 0.999));
    if ($('ready-count').textContent !== String(n)) { $('ready-count').textContent = n; sfx.count(n === 1); }
    if (readyT <= 1) startPlay();

  } else if (state === 'play') {
    // miš: držanje dugmeta puca u ritmu hlađenja
    if (mouse.down && gunM.cool <= 0) game.fire(gunM, mouse.x, mouse.y);
    game.update(dt, guns, now);
    updateHud();

  } else if (state === 'over') {
    game.update(dt, [], now);
    if (inputMode === 'pose') {
      handsUpT = handsAbove(lms) ? handsUpT + dt : Math.max(0, handsUpT - dt * 2);
      $('hu-fill').style.width = Math.round(Math.min(1, handsUpT / 1.1) * 100) + '%';
      if (handsUpT >= 1.1) restart();
    }
  }

  game.render(guns, inputMode === 'pose' ? lms : null);

  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
  if ((now | 0) % 8 === 0) {
    const m = inputMode === 'pose' ? 'RUKE' : 'MIŠ';
    $('status').textContent = m + (state === 'play' ? '  ·  ' + tracker.fps + ' FPS' : '') + (game.debug ? '  ·  DEBUG' : '');
  }
}

window.SHOOT = { game: game, tracker: tracker, guns: [gunL, gunR, gunM], get state() { return state; } };
$('status').textContent = 'MIŠ';
requestAnimationFrame(frame);
