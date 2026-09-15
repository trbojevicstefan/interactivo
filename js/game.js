// Svet igre: pseudo-3D staza, prepreke, kugle, čestice i renderovanje
// preko slike sa kamere (igrač vidi sebe u igri).

import { BONES } from './pose.js';

const TRACK_HALF = 4.2;    // pola širine staze u svetskim jedinicama
const SPAWN_D = 58;        // na kojoj daljini se pravi novi sadržaj
const PLAYER_HALF = 0.62;  // pola širine igrača za sudare

const BIOMES = [
  { name: 'ŠUMA',        sky: ['#04241a', '#1f7a5a'], ground: ['#0d3226', '#04120d'], accent: '#4dffa6', scenery: 'tree' },
  { name: 'KANJON',      sky: ['#3a1220', '#ff9a4d'], ground: ['#4a2418', '#170a05'], accent: '#ffb347', scenery: 'rock' },
  { name: 'LEDENA ZONA', sky: ['#08213f', '#8fd6ff'], ground: ['#123152', '#05121f'], accent: '#7ee8ff', scenery: 'crystal' },
  { name: 'NEON GRAD',   sky: ['#14042a', '#7b1fa2'], ground: ['#1b0a2e', '#08020f'], accent: '#ff4fd8', scenery: 'tower' },
  { name: 'SVEMIR',      sky: ['#01010a', '#2b1f5e'], ground: ['#0b0722', '#010007'], accent: '#b47cff', scenery: 'star' }
];

const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);

export class Game {
  constructor(canvas, sfx) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.fx = document.createElement('canvas');
    this.fxc = this.fx.getContext('2d');
    this.sfx = sfx;
    this.video = null;
    this.debug = false;
    this.onBiome = null;
    this.onGameOver = null;
    this.onToast = null;
    this.stars = [];
    this.resize();
    this.reset();
  }

  setVideo(v) { this.video = v; }

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
    this.fx.width = this.canvas.width;
    this.fx.height = this.canvas.height;
    this.fxc.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cx = this.w / 2;
    this.horizonY = this.h * 0.38;
    this.groundY = this.h * 0.90;   // ravan na kojoj stoji igrac
    this.unit = this.w * 0.135;
    this.stars = [];
    for (let i = 0; i < 90; i++) {
      this.stars.push({ x: Math.random() * this.w, y: Math.random() * this.horizonY, r: rand(0.5, 1.8), t: Math.random() * 6 });
    }
  }

  /* ---------------- projekcija ---------------- */
  proj(d) { return 1 / (1 + Math.max(d, -0.95) * 0.085); }
  gy(p) { return this.horizonY + (this.groundY - this.horizonY) * p; }
  sx(x, p) { return this.cx + x * p * this.unit; }
  sy(y, p) { return this.gy(p) - y * p * this.unit; }

  coverParams() {
    const v = this.video;
    if (!v || !v.videoWidth) return null;
    const s = Math.max(this.w / v.videoWidth, this.h / v.videoHeight);
    const dw = v.videoWidth * s, dh = v.videoHeight * s;
    return { dx: (this.w - dw) / 2, dy: (this.h - dh) / 2, dw: dw, dh: dh };
  }

  // Normalizovana tačka iz slike kamere -> piksel na ekranu (sa ogledalom).
  videoToScreen(nx, ny) {
    const c = this.coverParams();
    if (!c) return { x: this.w * (1 - nx), y: this.h * ny };
    return { x: this.w - (c.dx + nx * c.dw), y: c.dy + ny * c.dh };
  }

  /* ---------------- stanje ---------------- */
  reset() {
    this.objs = [];
    this.scen = [];
    this.parts = [];
    this.floats = [];
    this.dist = 0;
    this.score = 0;
    this.lives = 3;
    this.combo = 0;
    this.bestCombo = 0;
    this.orbs = 0;
    this.speed = 13;
    this.t = 0;
    this.shake = 0;
    this.flash = 0;
    this.inv = 0;
    this.playerX = 0;
    this.playerLift = 0;
    this.playerDuck = 0;
    this.nextSpawn = 26;
    this.nextScen = 0;
    this.nextHeart = 520;
    this.nextBonus = 250;
    this.biome = 0;
    this.over = false;
    this.startedAt = 0;
    for (let d = 2; d < SPAWN_D + 20; d += 5) this.addScenery(d);
  }

  get mult() { return Math.min(5, 1 + Math.floor(this.combo / 5)); }
  get biomeDef() { return BIOMES[this.biome]; }

  // Svet se lagano kreće u meniju i tokom kalibracije (bez prepreka i sudara).
  idleUpdate(dt) {
    this.t += dt;
    const ds = 9 * dt;
    for (const s of this.scen) s.d -= ds;
    this.nextScen -= ds;
    if (this.nextScen <= 0) { this.addScenery(SPAWN_D + 18); this.nextScen = 5; }
    this.scen = this.scen.filter(s => s.d > -6);
    this.dist += ds;
    this.updateParticles(dt);
  }

  /* ---------------- pravljenje sveta ---------------- */
  addScenery(d) {
    const type = this.biomeDef.scenery;
    for (const side of [-1, 1]) {
      if (Math.random() < 0.25) continue;
      this.scen.push({
        d: d + rand(-1.5, 1.5),
        x: side * rand(5.6, 9.5),
        h: rand(1.6, 4.6),
        w: rand(0.5, 1.4),
        type: type,
        seed: Math.random(),
        biome: this.biome
      });
    }
  }

  addObj(o) {
    o.dead = false; o.resolved = false; o.taken = false;
    if (o.kind === 'orb' || o.kind === 'heart') { o.r = o.r || 0.42; o.spin = Math.random() * 6; }
    this.objs.push(o);
  }

  addOrbArc(d) {
    const cx0 = rand(-2.2, 2.2);
    const n = 3 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      this.addObj({
        kind: 'orb',
        x: clamp(cx0 + (t - 0.5) * rand(2.2, 3.6), -TRACK_HALF + 0.4, TRACK_HALF - 0.4),
        y: 1.25 + Math.sin(t * Math.PI) * rand(0.5, 1.15),
        d: d + i * 1.5
      });
    }
  }

  addOrbLine(d) {
    const x = rand(-2.6, 2.6);
    for (let i = 0; i < 4; i++) this.addObj({ kind: 'orb', x: x, y: 1.05, d: d + i * 2.4 });
  }

  spawnPattern() {
    const D = SPAWN_D;
    const diff = clamp(this.dist / 1400, 0, 1);
    const opts = [
      { w: 26, f: 'low' },
      { w: 12 + diff * 14, f: 'high' },
      { w: 8 + diff * 20, f: 'wall' },
      { w: 20, f: 'orbs' },
      { w: 4 + diff * 18, f: 'slalom' },
      { w: diff > 0.25 ? 6 + diff * 14 : 0, f: 'combo' },
      { w: 8, f: 'line' }
    ];
    let total = 0;
    for (const o of opts) total += o.w;
    let r = Math.random() * total, kind = 'low';
    for (const o of opts) { r -= o.w; if (r <= 0) { kind = o.f; break; } }

    let extra = 0;
    if (kind === 'low') {
      this.addObj({ kind: 'low', x0: -TRACK_HALF, x1: TRACK_HALF, y0: 0, y1: rand(0.75, 1.0), d: D, depth: 0.9 });
      if (Math.random() < 0.5) this.addOrbArc(D + 7);

    } else if (kind === 'high') {
      this.addObj({ kind: 'high', x0: -TRACK_HALF, x1: TRACK_HALF, y0: 1.5, y1: 3.4, d: D, depth: 0.9 });
      if (Math.random() < 0.4) this.addObj({ kind: 'orb', x: rand(-2, 2), y: 0.85, d: D + 5 });

    } else if (kind === 'wall') {
      const side = Math.random() < 0.5 ? -1 : 1;
      const edge = rand(0.2, 1.6);
      const o = side < 0
        ? { x0: -TRACK_HALF - 1, x1: edge }
        : { x0: -edge, x1: TRACK_HALF + 1 };
      this.addObj({ kind: 'wall', x0: o.x0, x1: o.x1, y0: 0, y1: 3.4, d: D, depth: 1.1 });
      // nagrada u slobodnom prolazu
      const free = side < 0 ? (edge + TRACK_HALF) / 2 : (-edge - TRACK_HALF) / 2;
      this.addObj({ kind: 'orb', x: clamp(free, -TRACK_HALF + 0.5, TRACK_HALF - 0.5), y: 1.15, d: D + 3.2 });

    } else if (kind === 'slalom') {
      const s = Math.random() < 0.5 ? -1 : 1;
      const sep = this.speed * 0.75;      // ~0.75 s izmedju zidova
      for (let i = 0; i < 2; i++) {
        const side = s * (i % 2 === 0 ? 1 : -1);
        const edge = rand(0.4, 1.3);
        this.addObj(side < 0
          ? { kind: 'wall', x0: -TRACK_HALF - 1, x1: edge, y0: 0, y1: 3.4, d: D + i * sep, depth: 1.1 }
          : { kind: 'wall', x0: -edge, x1: TRACK_HALF + 1, y0: 0, y1: 3.4, d: D + i * sep, depth: 1.1 });
      }
      extra = sep;

    } else if (kind === 'combo') {
      const sep = this.speed * 0.95;      // skok pa cucanj
      this.addObj({ kind: 'low', x0: -TRACK_HALF, x1: TRACK_HALF, y0: 0, y1: rand(0.75, 0.95), d: D, depth: 0.9 });
      this.addObj({ kind: 'high', x0: -TRACK_HALF, x1: TRACK_HALF, y0: 1.5, y1: 3.4, d: D + sep, depth: 0.9 });
      extra = sep;

    } else if (kind === 'line') {
      this.addOrbLine(D);
    } else {
      this.addOrbArc(D);
    }
    return extra;
  }

  /* ---------------- ažuriranje ---------------- */
  update(dt, input) {
    this.t += dt;
    this.shake = Math.max(0, this.shake - dt * 2.4);
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.updateParticles(dt);

    if (this.over) return;

    this.inv = Math.max(0, this.inv - dt);
    this.speed = 13 + Math.min(21, this.dist / 55);
    const ds = this.speed * dt;
    this.dist += ds;

    // biom
    const b = Math.floor(this.dist / 380) % BIOMES.length;
    if (b !== this.biome) {
      this.biome = b;
      this.sfx.level();
      if (this.onBiome) this.onBiome(this.biomeDef.name);
      if (this.onToast) this.onToast('NOVA ZONA: ' + this.biomeDef.name);
    }

    // bonus na svakih 250 m
    if (this.dist > this.nextBonus) {
      this.nextBonus += 250;
      this.score += 100;
      this.sfx.bonus();
      this.addFloat(this.cx, this.h * 0.42, '+100 ' + Math.round(this.dist) + ' m', this.biomeDef.accent, 1.3);
    }

    // pozicija igrača
    const target = clamp(input.x, -1, 1) * (TRACK_HALF - 0.5);
    this.playerX += (target - this.playerX) * Math.min(1, dt * 12);
    const liftT = input.jump ? 1 : 0;
    this.playerLift += (liftT - this.playerLift) * Math.min(1, dt * 16);
    const duckT = input.crouch ? 1 : 0;
    this.playerDuck += (duckT - this.playerDuck) * Math.min(1, dt * 16);

    // pomeranje sveta
    for (const o of this.objs) o.d -= ds;
    for (const s of this.scen) s.d -= ds;

    // scenery recikliranje
    this.nextScen -= ds;
    if (this.nextScen <= 0) { this.addScenery(SPAWN_D + 18); this.nextScen = 5; }
    this.scen = this.scen.filter(s => s.d > -6);

    // sadržaj
    this.nextSpawn -= ds;
    if (this.nextSpawn <= 0) {
      const extra = this.spawnPattern();
      // Razmak racunamo u SEKUNDAMA, ne u metrima - da brzina ne pojede vreme za reakciju.
      const gapSec = Math.max(0.95, 1.7 - this.dist / 2600);
      this.nextSpawn = extra + this.speed * gapSec * rand(0.9, 1.3);
    }
    if (this.dist > this.nextHeart) {
      this.nextHeart += rand(600, 900);
      if (this.lives < 3) this.addObj({ kind: 'heart', x: rand(-2.5, 2.5), y: 1.5, d: SPAWN_D + 5, r: 0.5 });
    }

    // sudari
    for (const o of this.objs) {
      if (o.dead) continue;

      if (o.kind === 'orb' || o.kind === 'heart') {
        if (!o.taken && o.d < 8 && o.d > -1.2) {
          const p = this.proj(o.d);
          const px = this.sx(o.x, p), py = this.sy(o.y, p);
          const rr = Math.max(34, o.r * p * this.unit * 1.7);
          let got = false;
          if (input.hands) {
            for (const hnd of input.hands) {
              const dx = hnd.x - px, dy = hnd.y - py;
              if (dx * dx + dy * dy < rr * rr) { got = true; break; }
            }
          }
          if (!got && o.d < 1.0 && o.d > -0.8 && Math.abs(o.x - this.playerX) < 1.05) {
            const lowEnough = input.crouch ? o.y < 1.3 : o.y < 2.3;
            const highOK = input.jump ? o.y < 3.2 : lowEnough;
            if (highOK) got = true;
          }
          if (got) this.collect(o, px, py);
        }
        if (o.d < -2) o.dead = true;

      } else {
        if (!o.resolved && o.d <= 0.3) {
          o.resolved = true;
          const overlap = (this.playerX + PLAYER_HALF > o.x0) && (this.playerX - PLAYER_HALF < o.x1);
          let hit = false;
          if (overlap) {
            if (o.kind === 'low') hit = !input.jumpRecent;
            else if (o.kind === 'high') hit = !input.crouchRecent;
            else hit = true;
          }
          if (hit) {
            this.damage();
          } else {
            const pts = (overlap ? 25 : 10) * this.mult;
            this.score += pts;
            this.combo++;
            this.bestCombo = Math.max(this.bestCombo, this.combo);
            this.sfx.dodge();
            this.addFloat(this.sx(this.playerX, 1), this.h * 0.72, '+' + pts, '#ffffff', 0.9);
          }
        }
        if (o.d < -3) o.dead = true;
      }
    }
    this.objs = this.objs.filter(o => !o.dead);
  }

  collect(o, px, py) {
    o.taken = true; o.dead = true;
    const c = this.biomeDef.accent;
    if (o.kind === 'heart') {
      this.lives = Math.min(3, this.lives + 1);
      this.sfx.heart();
      this.addFloat(px, py, '+ŽIVOT', '#ff4d5e', 1.3);
      this.burst(px, py, '#ff4d5e', 26);
    } else {
      this.orbs++;
      this.combo++;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      const pts = 10 * this.mult;
      this.score += pts;
      this.sfx.coin(this.combo);
      this.addFloat(px, py, '+' + pts, c, 1);
      this.burst(px, py, c, 16);
    }
  }

  damage() {
    if (this.inv > 0) return;
    this.lives--;
    this.inv = 1.5;
    this.combo = 0;
    this.shake = 1;
    this.flash = 1;
    this.sfx.hit();
    this.burst(this.sx(this.playerX, 1), this.h * 0.7, '#ff4d5e', 40);
    if (this.lives <= 0) {
      this.over = true;
      this.sfx.gameover();
      if (this.onGameOver) this.onGameOver();
    } else if (this.onToast) {
      this.onToast(this.lives === 1 ? 'POSLEDNJI ŽIVOT!' : 'PAZI!');
    }
  }

  /* ---------------- efekti ---------------- */
  burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = rand(60, 420);
      this.parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: rand(0.4, 1), max: 1, c: color, r: rand(1.5, 4.5) });
    }
  }
  addFloat(x, y, text, color, scale) {
    this.floats.push({ x: x, y: y, text: text, c: color, life: 1, s: scale || 1 });
  }
  updateParticles(dt) {
    for (const p of this.parts) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 760 * dt; p.vx *= 0.97;
    }
    this.parts = this.parts.filter(p => p.life > 0);
    for (const f of this.floats) { f.life -= dt * 1.1; f.y -= dt * 60; }
    this.floats = this.floats.filter(f => f.life > 0);
  }

  /* ---------------- crtanje ---------------- */
  render(input) {
    const ctx = this.ctx;
    const B = this.biomeDef;
    ctx.save();
    if (this.shake > 0.01) {
      const s = this.shake * 16;
      ctx.translate(rand(-s, s), rand(-s, s));
    }
    ctx.clearRect(-30, -30, this.w + 60, this.h + 60);

    this.drawCamera(ctx);
    this.drawSky(ctx, B);
    this.drawGround(ctx, B);

    // scenery + objekti, od daljih ka bližim
    const all = this.scen.concat(this.objs).sort((a, b) => b.d - a.d);
    for (const o of all) {
      if (o.d < -2.5 || o.d > SPAWN_D + 24) continue;
      if (o.type) this.drawScenery(ctx, o);
      else this.drawObj(ctx, o);
    }

    this.drawPlayerMark(ctx, input, B);
    this.drawCutout(ctx, input);
    if (input && input.lms) this.drawSkeleton(ctx, input.lms, B);
    this.drawHands(ctx, input, B);
    this.drawParticles(ctx);
    this.drawFloats(ctx);
    ctx.restore();
    this.drawOverlay(ctx);
  }

  drawCamera(ctx) {
    const c = this.coverParams();
    if (!c) {
      const g = ctx.createLinearGradient(0, 0, 0, this.h);
      g.addColorStop(0, '#05131c'); g.addColorStop(1, '#01060a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, this.w, this.h);
      return;
    }
    ctx.save();
    ctx.translate(this.w, 0); ctx.scale(-1, 1);
    ctx.drawImage(this.video, this.w - c.dx - c.dw, c.dy, c.dw, c.dh);
    ctx.restore();
  }

  drawSky(ctx, B) {
    ctx.save();
    ctx.globalAlpha = 0.62;
    const g = ctx.createLinearGradient(0, 0, 0, this.horizonY + 40);
    g.addColorStop(0, B.sky[0]); g.addColorStop(1, B.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.horizonY + 40);

    if (B.scenery === 'star' || B.scenery === 'tower') {
      ctx.globalAlpha = 0.85;
      for (const s of this.stars) {
        ctx.globalAlpha = 0.25 + 0.55 * Math.abs(Math.sin(this.t * 1.4 + s.t));
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill();
      }
    }
    // sunce / izvor svetla na horizontu
    ctx.globalAlpha = 0.55;
    const sg = ctx.createRadialGradient(this.cx, this.horizonY, 2, this.cx, this.horizonY, this.w * 0.35);
    sg.addColorStop(0, B.accent); sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(this.cx, this.horizonY, this.w * 0.35, 0, 6.283); ctx.fill();
    ctx.restore();
  }

  drawGround(ctx, B) {
    const hY = this.horizonY;
    ctx.save();
    ctx.globalAlpha = 0.66;
    const g = ctx.createLinearGradient(0, hY, 0, this.h);
    g.addColorStop(0, B.ground[0]); g.addColorStop(1, B.ground[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, hY, this.w, this.h - hY);

    // staza
    const pF = this.proj(SPAWN_D + 16), pN = this.proj(-0.9);
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(this.sx(-TRACK_HALF, pF), this.gy(pF));
    ctx.lineTo(this.sx(TRACK_HALF, pF), this.gy(pF));
    ctx.lineTo(this.sx(TRACK_HALF, pN), this.gy(pN));
    ctx.lineTo(this.sx(-TRACK_HALF, pN), this.gy(pN));
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill();

    // poprečne linije (osećaj brzine)
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = B.accent;
    const phase = this.dist % 6;
    for (let k = 0; k < 12; k++) {
      const d = k * 6 - phase;
      if (d < -0.5) continue;
      const p = this.proj(d);
      const y = this.gy(p);
      ctx.globalAlpha = 0.34 * p;
      ctx.lineWidth = Math.max(1, 3 * p);
      ctx.beginPath();
      ctx.moveTo(this.sx(-TRACK_HALF, p), y);
      ctx.lineTo(this.sx(TRACK_HALF, p), y);
      ctx.stroke();
    }

    // ivice staze
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 3;
    ctx.strokeStyle = B.accent;
    ctx.shadowColor = B.accent; ctx.shadowBlur = 18;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(this.sx(side * TRACK_HALF, pF), this.gy(pF));
      ctx.lineTo(this.sx(side * TRACK_HALF, pN), this.gy(pN));
      ctx.stroke();
    }
    ctx.restore();
  }

  quad(ctx, pts, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  drawObj(ctx, o) {
    if (o.kind === 'orb' || o.kind === 'heart') return this.drawOrb(ctx, o);

    const B = this.biomeDef;
    const depth = o.depth || 0.9;
    const p0 = this.proj(o.d), p1 = this.proj(o.d + depth);
    const col = o.kind === 'low' ? '#ff9f43' : (o.kind === 'high' ? '#54d7ff' : '#ff4d6d');
    const dark = o.kind === 'low' ? '#7a3c00' : (o.kind === 'high' ? '#0d4a63' : '#5c0b18');

    const fx0 = this.sx(o.x0, p0), fx1 = this.sx(o.x1, p0);
    const fy0 = this.sy(o.y0, p0), fy1 = this.sy(o.y1, p0);
    const bx0 = this.sx(o.x0, p1), bx1 = this.sx(o.x1, p1);
    const by0 = this.sy(o.y0, p1), by1 = this.sy(o.y1, p1);

    ctx.save();
    ctx.globalAlpha = clamp(1.25 - o.d / (SPAWN_D + 10), 0.15, 1);

    // zadnja strana
    this.quad(ctx, [[bx0, by1], [bx1, by1], [bx1, by0], [bx0, by0]], dark);
    // gornja strana
    this.quad(ctx, [[bx0, by1], [bx1, by1], [fx1, fy1], [fx0, fy1]], col);
    // prednja strana
    const g = ctx.createLinearGradient(0, fy1, 0, fy0);
    g.addColorStop(0, col); g.addColorStop(1, dark);
    ctx.lineWidth = 2;
    ctx.shadowColor = col; ctx.shadowBlur = 22;
    this.quad(ctx, [[fx0, fy1], [fx1, fy1], [fx1, fy0], [fx0, fy0]], g, 'rgba(255,255,255,.55)');
    ctx.shadowBlur = 0;

    // upozoravajuće pruge
    const wpx = fx1 - fx0, hpx = fy0 - fy1;
    if (wpx > 12 && hpx > 6) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(fx0, fy1, wpx, hpx);
      ctx.clip();
      ctx.globalAlpha *= 0.5;
      ctx.strokeStyle = '#0a0a0a';
      ctx.lineWidth = Math.max(4, hpx * 0.22);
      const step = ctx.lineWidth * 2.6;
      for (let x = fx0 - hpx; x < fx1 + hpx; x += step) {
        ctx.beginPath(); ctx.moveTo(x, fy0); ctx.lineTo(x + hpx, fy1); ctx.stroke();
      }
      ctx.restore();
    }

    // ikonica akcije dok je prepreka blizu
    if (o.d < 26 && o.d > 1) {
      const t = clamp(1 - o.d / 26, 0, 1);
      ctx.globalAlpha = t * 0.9;
      ctx.fillStyle = '#fff';
      ctx.shadowColor = col; ctx.shadowBlur = 20;
      ctx.font = '900 ' + Math.round(20 + 26 * t) + 'px ' + FONT;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const mx = (fx0 + fx1) / 2;
      if (o.kind === 'low') ctx.fillText('▲ SKOK', mx, fy1 - 26 - 20 * t);
      else if (o.kind === 'high') ctx.fillText('▼ ČUČANJ', mx, fy0 + 26 + 20 * t);
      else {
        const arrow = (o.x0 < -1) ? '➜' : '⬅';
        ctx.fillText(arrow, o.x0 < -1 ? fx1 + 30 : fx0 - 30, (fy0 + fy1) / 2);
      }
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  drawOrb(ctx, o) {
    const p = this.proj(o.d);
    const x = this.sx(o.x, p), y = this.sy(o.y, p);
    const r = Math.max(3, o.r * p * this.unit);
    const c = o.kind === 'heart' ? '#ff4d5e' : this.biomeDef.accent;
    const pulse = 1 + Math.sin(this.t * 5 + o.spin) * 0.08;
    ctx.save();
    ctx.globalAlpha = clamp(1.3 - o.d / (SPAWN_D + 10), 0.12, 1);

    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4 * pulse);
    g.addColorStop(0, c); g.addColorStop(0.3, hexA(c, 0.55)); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha *= 0.4;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r * 2.4 * pulse, 0, 6.283); ctx.fill();

    ctx.globalAlpha = clamp(1.3 - o.d / (SPAWN_D + 10), 0.12, 1);
    if (o.kind === 'heart') {
      this.heartPath(ctx, x, y, r * 1.5 * pulse);
      ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 24; ctx.fill();
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = c; ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.arc(x, y, r * 0.42 * pulse, 0, 6.283); ctx.fill();
      ctx.lineWidth = Math.max(1.5, r * 0.22);
      ctx.strokeStyle = c;
      ctx.beginPath();
      ctx.ellipse(x, y, r * pulse, r * pulse * Math.abs(Math.cos(this.t * 2.2 + o.spin)) * 0.9 + r * 0.15, 0.5, 0, 6.283);
      ctx.stroke();
    }
    ctx.restore();
  }

  heartPath(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y + r * 0.75);
    ctx.bezierCurveTo(x - r * 1.5, y - r * 0.35, x - r * 0.55, y - r * 1.2, x, y - r * 0.45);
    ctx.bezierCurveTo(x + r * 0.55, y - r * 1.2, x + r * 1.5, y - r * 0.35, x, y + r * 0.75);
    ctx.closePath();
  }

  drawScenery(ctx, s) {
    const p = this.proj(s.d);
    if (p <= 0) return;
    const x = this.sx(s.x, p), yb = this.gy(p);
    const hh = s.h * p * this.unit, ww = Math.max(1, s.w * p * this.unit);
    const B = BIOMES[s.biome] || this.biomeDef;
    ctx.save();
    ctx.globalAlpha = clamp(1.15 - s.d / (SPAWN_D + 22), 0.06, 0.85);

    if (s.type === 'tree') {
      ctx.fillStyle = '#1b3a24';
      ctx.fillRect(x - ww * 0.12, yb - hh * 0.35, ww * 0.24, hh * 0.35);
      ctx.fillStyle = '#245c3b';
      for (let i = 0; i < 3; i++) {
        const t = i / 3;
        ctx.beginPath();
        ctx.moveTo(x, yb - hh * (0.75 + t * 0.3));
        ctx.lineTo(x - ww * (1 - t * 0.55), yb - hh * (0.28 + t * 0.28));
        ctx.lineTo(x + ww * (1 - t * 0.55), yb - hh * (0.28 + t * 0.28));
        ctx.closePath(); ctx.fill();
      }
    } else if (s.type === 'rock') {
      ctx.fillStyle = '#6b3a24';
      ctx.beginPath();
      ctx.moveTo(x - ww, yb);
      ctx.lineTo(x - ww * 0.35, yb - hh * (0.6 + s.seed * 0.4));
      ctx.lineTo(x + ww * 0.25, yb - hh);
      ctx.lineTo(x + ww, yb);
      ctx.closePath(); ctx.fill();
    } else if (s.type === 'crystal') {
      ctx.fillStyle = 'rgba(126,232,255,.55)';
      ctx.shadowColor = '#7ee8ff'; ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.moveTo(x, yb - hh);
      ctx.lineTo(x + ww * 0.7, yb - hh * 0.4);
      ctx.lineTo(x, yb);
      ctx.lineTo(x - ww * 0.7, yb - hh * 0.4);
      ctx.closePath(); ctx.fill();
    } else if (s.type === 'tower') {
      ctx.fillStyle = 'rgba(20,4,40,.9)';
      ctx.fillRect(x - ww, yb - hh, ww * 2, hh);
      ctx.fillStyle = B.accent;
      ctx.globalAlpha *= 0.8;
      const rows = Math.max(1, Math.floor(hh / 16));
      for (let i = 0; i < rows; i++) {
        if ((i + s.seed * 10 | 0) % 2 === 0) continue;
        ctx.fillRect(x - ww * 0.55, yb - hh + i * 16 + 4, ww * 1.1, Math.max(1, 4 * p * 6));
      }
    } else {
      ctx.fillStyle = '#b47cff';
      ctx.shadowColor = '#b47cff'; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(x, yb - hh, Math.max(1.5, ww * 0.3), 0, 6.283); ctx.fill();
    }
    ctx.restore();
  }

  // Oznaka igrača na stazi (senka + svetlosni stub).
  drawPlayerMark(ctx, input, B) {
    const p = this.proj(0.2);
    const x = this.sx(this.playerX, p);
    const y = this.gy(p);
    const rw = 0.95 * p * this.unit;
    const lift = this.playerLift * 0.9 * p * this.unit;
    ctx.save();
    const blink = this.inv > 0 && Math.floor(this.t * 12) % 2 === 0;
    ctx.globalAlpha = blink ? 0.25 : 0.85;

    // svetlosni stub
    const g = ctx.createLinearGradient(0, y - this.h * 0.5, 0, y);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, hexA(B.accent, 0.38));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - rw * 0.7, y - this.h * 0.5);
    ctx.lineTo(x + rw * 0.7, y - this.h * 0.5);
    ctx.lineTo(x + rw, y);
    ctx.lineTo(x - rw, y);
    ctx.closePath(); ctx.fill();

    // prsten na tlu
    ctx.strokeStyle = B.accent;
    ctx.shadowColor = B.accent; ctx.shadowBlur = 26;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(x, y - lift * 0.15, rw * (1 + this.playerDuck * 0.15), rw * 0.3, 0, 0, 6.283);
    ctx.stroke();
    ctx.restore();
  }

  // "Izrezivanje" igrača iz slike kamere da bude jasno vidljiv preko sveta.
  drawCutout(ctx, input) {
    const box = input && input.box;
    const c = this.coverParams();
    if (!box || !c) return;
    const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
    const rx = Math.max(60, (box.x1 - box.x0) * 0.78);
    const ry = Math.max(80, (box.y1 - box.y0) * 0.72);
    const f = this.fxc;

    f.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    f.clearRect(0, 0, this.w, this.h);
    f.save();
    f.translate(this.w, 0); f.scale(-1, 1);
    f.drawImage(this.video, this.w - c.dx - c.dw, c.dy, c.dw, c.dh);
    f.restore();

    f.save();
    f.globalCompositeOperation = 'destination-in';
    f.translate(cx, cy); f.scale(1, ry / rx);
    const g = f.createRadialGradient(0, 0, rx * 0.25, 0, 0, rx);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.72, 'rgba(255,255,255,.92)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    f.fillStyle = g;
    f.beginPath(); f.arc(0, 0, rx, 0, 6.283); f.fill();
    f.restore();

    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.drawImage(this.fx, 0, 0, this.w, this.h);
    ctx.restore();
  }

  drawSkeleton(ctx, lms, B) {
    const pt = i => {
      const p = lms[i];
      if (!p || (p.visibility !== undefined && p.visibility < 0.35)) return null;
      return this.videoToScreen(p.x, p.y);
    };
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = B.accent;
    ctx.shadowColor = B.accent;
    ctx.shadowBlur = 18;
    ctx.globalAlpha = this.debug ? 0.95 : 0.5;
    ctx.lineWidth = this.debug ? 6 : 4;
    for (const bn of BONES) {
      const a = pt(bn[0]), b = pt(bn[1]);
      if (!a || !b) continue;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    if (this.debug) {
      ctx.fillStyle = '#fff';
      for (let i = 0; i < lms.length; i++) {
        const q = pt(i); if (!q) continue;
        ctx.beginPath(); ctx.arc(q.x, q.y, 3, 0, 6.283); ctx.fill();
      }
    }
    ctx.restore();
  }

  drawHands(ctx, input, B) {
    if (!input || !input.hands) return;
    ctx.save();
    for (const h of input.hands) {
      const r = 26 + Math.sin(this.t * 6) * 3;
      const g = ctx.createRadialGradient(h.x, h.y, 2, h.x, h.y, r * 1.8);
      g.addColorStop(0, hexA('#ffffff', 0.85));
      g.addColorStop(0.35, hexA(B.accent, 0.55));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(h.x, h.y, r * 1.8, 0, 6.283); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.globalAlpha = 0.95;
      ctx.shadowColor = B.accent; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(h.x, h.y, r * 0.6, 0, 6.283); ctx.stroke();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  drawParticles(ctx) {
    ctx.save();
    for (const p of this.parts) {
      ctx.globalAlpha = clamp(p.life, 0, 1);
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
      ctx.font = '900 ' + Math.round(22 * f.s) + 'px ' + FONT;
      ctx.fillStyle = f.c;
      ctx.shadowColor = f.c; ctx.shadowBlur = 18;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
  }

  drawOverlay(ctx) {
    // vinjeta
    ctx.save();
    const g = ctx.createRadialGradient(this.cx, this.h * 0.5, this.h * 0.35, this.cx, this.h * 0.5, this.h * 0.95);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
    if (this.flash > 0.01) {
      ctx.globalAlpha = this.flash * 0.55;
      const r = ctx.createRadialGradient(this.cx, this.h * 0.5, this.h * 0.2, this.cx, this.h * 0.5, this.h * 0.8);
      r.addColorStop(0, 'rgba(255,0,40,0)');
      r.addColorStop(1, 'rgba(255,0,40,.95)');
      ctx.fillStyle = r;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    ctx.restore();
  }
}

const FONT = '"Segoe UI",system-ui,-apple-system,Arial,sans-serif';

function hexA(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}
