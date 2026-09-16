// Prođi kroz zid — zid sa rupom u obliku poze dolazi ka tebi.
// Tvoj skelet mora da stane u rupu. Kroz rupu se vidiš ti (kamera).

import { Sfx } from './audio.js';
import { PoseTracker, LM } from './pose.js';
import { requestPhoneCam } from './phonecam.js';
import { POSES, buildPose, holeDepth } from './poses.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

// Težine: rupa je namerno šira od tela (holeR je u jedinicama trupa).
// time = sekundi za prvi zid, step = koliko se skracuje po zidu, floor = najbrze.
// tolX/tolY = mrtva zona pozicije u jedinicama trupa (99 = pozicija se ne racuna).
// offsetMax = koliko rupa moze da bude pomerena levo/desno (jedinice trupa).
const DIFF = {
  1: { level: 1, name: 'LAKO',    holeR: 0.30, headR: 0.36, need: 0.88, time: 4.5, floor: 2.2, step: 0.30, tolX: 99, tolY: 99, offsetMax: 0 },
  2: { level: 2, name: 'SREDNJE', holeR: 0.26, headR: 0.32, need: 0.90, time: 3.8, floor: 1.8, step: 0.30, tolX: 99, tolY: 99, offsetMax: 0 },
  3: { level: 3, name: 'TEŠKO',   holeR: 0.23, headR: 0.29, need: 0.90, time: 3.0, floor: 1.4, step: 0.30, tolX: 0.60, tolY: 0.85, offsetMax: 1.0 },
  4: { level: 4, name: 'LUDO',    holeR: 0.21, headR: 0.27, need: 0.90, time: 2.6, floor: 1.1, step: 0.30, tolX: 0.55, tolY: 0.80, offsetMax: 2.1 }
};

// Kosti igrača koje proveravamo (parovi landmark indeksa).
const P_BONES = [
  [11, 12], [11, 23], [12, 24], [23, 24],
  [11, 13], [13, 15], [12, 14], [14, 16],
  [23, 25], [25, 27], [24, 26], [26, 28]
];
const SAMPLES = 5;
const WALL_ALPHA = 0.58;   // zid je providan - vidiš sebe i kroz njega

class WallGame {
  constructor(canvas, video, sfx) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.wc = document.createElement('canvas');
    this.wctx = this.wc.getContext('2d');
    this.video = video;
    this.sfx = sfx;
    this.debug = false;
    this.onOver = null;
    this.onBanner = null;
    this.diff = DIFF[1];
    this.resize();
    this.reset();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.dpr = dpr;
    this.w = Math.max(320, window.innerWidth);
    this.h = Math.max(240, window.innerHeight);
    for (const c of [this.canvas, this.wc]) {
      c.width = Math.round(this.w * dpr);
      c.height = Math.round(this.h * dpr);
    }
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.wctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

  reset() {
    this.score = 0;
    this.lives = 3;
    this.passed = 0;
    this.perfect = 0;
    this.index = 0;
    this.t = 0;
    this.shake = 0;
    this.flash = 0;
    this.good = 0;
    this.over = false;
    this.pose = null;
    this.prevName = '';
    this.phase = 'wait';     // wait | approach | resolve
    this.p = 0;
    this.wallTime = this.diff.time;
    this.waitT = 1.1;
    this.resolveT = 0;
    this.result = null;
    this.fit = 0;
    this.bestFit = 0;
    this.fitHist = [];
    this.parts = [];
    this.center = { x: this.w / 2, y: this.h * 0.6 };
    this.baseX = this.w / 2;
    this.offset = 0;
    this.lastOffset = 0;
    this.offX = 0;          // koliko si trenutno promasio po x (u jedinicama trupa)
    this.unit = this.h * 0.18;
    this.haveBody = false;
  }

  setDiff(level) { this.diff = DIFF[level] || DIFF[1]; }

  /* ---------- telo igrača ---------- */
  vis(p) { return p && (p.visibility === undefined || p.visibility > 0.4); }

  // Napravi tačke igrača u px (ogledalo) i normalizovane.
  readBody(lms) {
    if (!lms) return null;
    const ls = lms[LM.L_SHO], rs = lms[LM.R_SHO], lh = lms[LM.L_HIP], rh = lms[LM.R_HIP];
    if (!this.vis(ls) || !this.vis(rs) || !this.vis(lh) || !this.vis(rh)) return null;

    const px = {};
    for (let i = 0; i < lms.length; i++) px[i] = this.videoToScreen(lms[i].x, lms[i].y);
    const cx = (px[LM.L_HIP].x + px[LM.R_HIP].x) / 2;
    const cy = (px[LM.L_HIP].y + px[LM.R_HIP].y) / 2;
    const sx = (px[LM.L_SHO].x + px[LM.R_SHO].x) / 2;
    const sy = (px[LM.L_SHO].y + px[LM.R_SHO].y) / 2;
    const unit = Math.max(24, Math.hypot(sx - cx, sy - cy));
    return { px: px, center: { x: cx, y: cy }, unit: unit, head: px[LM.NOSE], lms: lms };
  }

  // Koliko igrača je unutar rupe (0..1) + podaci za crtanje.
  measureFit(body) {
    if (!body || !this.pose) return { fit: 0, segs: [], offX: 0 };
    const D = this.diff;
    const u = this.unit || body.unit;
    const hx = this.center.x, hy = this.center.y;

    // Mrtva zona: dok si dovoljno blizu rupe, pozicija se uopšte ne računa.
    const rawX = (body.center.x - hx) / u;
    const rawY = (body.center.y - hy) / u;
    const corrX = clamp(rawX, -D.tolX, D.tolX);
    const corrY = clamp(rawY, -D.tolY, D.tolY);
    const nx = (X) => (X - hx) / u - corrX;
    const ny = (Y) => (Y - hy) / u - corrY;

    const segs = [];
    let inside = 0, total = 0;

    for (const [a, b] of P_BONES) {
      const pa = body.lms[a], pb = body.lms[b];
      if (!this.vis(pa) || !this.vis(pb)) continue;
      const A = body.px[a], B = body.px[b];
      let segIn = 0;
      for (let i = 0; i < SAMPLES; i++) {
        const t = SAMPLES === 1 ? 0.5 : i / (SAMPLES - 1);
        const d = holeDepth(this.pose, nx(lerp(A.x, B.x, t)), ny(lerp(A.y, B.y, t)), D.holeR, D.headR);
        total++;
        if (d <= 0) { inside++; segIn++; }
      }
      segs.push({ a: A, b: B, frac: segIn / SAMPLES });
    }
    if (this.vis(body.lms[LM.NOSE])) {
      const d = holeDepth(this.pose, nx(body.head.x), ny(body.head.y), D.holeR, D.headR);
      total += 2;
      if (d <= 0) inside += 2;
      segs.push({ a: body.head, b: body.head, frac: d <= 0 ? 1 : 0, head: true });
    }
    return { fit: total ? inside / total : 0, segs: segs, offX: rawX - corrX };
  }

  nextWall() {
    const pool = POSES.filter(p => p.diff <= this.diff.level);
    let pick = pool[(Math.random() * pool.length) | 0];
    let guard = 0;
    while (pick.name === this.prevName && pool.length > 1 && guard++ < 12) pick = pool[(Math.random() * pool.length) | 0];
    this.prevName = pick.name;
    this.pose = buildPose(pick);
    this.index++;
    // gde se rupa pojavljuje po sirini ekrana
    if (this.diff.offsetMax > 0) {
      const mag = Math.random() < 0.25 ? 0 : (0.45 + Math.random() * 0.55);
      let sign = Math.random() < 0.5 ? -1 : 1;
      // ne dva puta zaredom na istu stranu - da se stvarno krećeš
      if (mag > 0.1 && Math.sign(this.lastOffset) === sign) sign = -sign;
      this.offset = sign * mag * this.diff.offsetMax;
      if (mag > 0.1) this.lastOffset = sign;
    } else {
      this.offset = 0;
    }
    this.p = 0;
    this.phase = 'approach';
    this.bestFit = 0;
    this.fitHist.length = 0;
    this.wallTime = Math.max(this.diff.floor, this.diff.time - (this.index - 1) * this.diff.step);
    this.sfx.tone(300, 0.2, { type: 'triangle', vol: 0.22, to: 520 });
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
  update(dt, body) {
    this.t += dt;
    this.shake = Math.max(0, this.shake - dt * 2.4);
    this.flash = Math.max(0, this.flash - dt * 2.0);
    this.good = Math.max(0, this.good - dt * 2.0);
    for (const p of this.parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt; }
    this.parts = this.parts.filter(p => p.life > 0);

    if (body) {
      this.haveBody = true;
      this.unit = lerp(this.unit, body.unit, Math.min(1, dt * 2.5));
      this.center.y = lerp(this.center.y, body.center.y, Math.min(1, dt * 3.5));
      if (this.diff.offsetMax > 0) {
        // rupa je zakovana za mesto: moraš ti da se pomeriš do nje
        const m = this.unit * 1.8;
        const target = clamp(this.baseX + this.offset * this.unit, m, this.w - m);
        this.center.x = lerp(this.center.x, target, Math.min(1, dt * 6));
      } else {
        this.center.x = lerp(this.center.x, body.center.x, Math.min(1, dt * 5));
        this.baseX = this.center.x;
      }
    }

    if (this.over) return;

    const m = this.measureFit(body);
    this.fit = m.fit;
    this.segs = m.segs;
    this.offX = m.offX;

    if (this.phase === 'wait') {
      this.waitT -= dt;
      if (this.waitT <= 0) this.nextWall();
      return;
    }

    if (this.phase === 'approach') {
      this.p += dt / this.wallTime;
      // pamtimo najbolje poklapanje pri kraju - blaže je prema drhtanju kamere
      if (this.p > 0.72) {
        this.fitHist.push(this.fit);
        if (this.fitHist.length > 40) this.fitHist.shift();
        if (this.fit > this.bestFit) this.bestFit = this.fit;
      }
      if (this.p >= 1) { this.p = 1; this.resolve(); }
      return;
    }

    if (this.phase === 'resolve') {
      this.resolveT -= dt;
      this.p += dt * 1.6;
      if (this.resolveT <= 0) {
        this.phase = 'wait';
        this.waitT = 0.7;
        this.p = 0;
      }
    }
  }

  resolve() {
    const need = this.diff.need;
    const fit = Math.max(this.bestFit, this.fit);
    const ok = fit >= need;
    this.phase = 'resolve';
    this.resolveT = 1.5;
    this.result = { ok: ok, fit: fit };

    if (ok) {
      this.passed++;
      const extra = Math.round(clamp((fit - need) / (1 - need), 0, 1) * 100);
      let pts = 100 + extra;
      const perfect = fit >= 0.985;
      if (perfect) { this.perfect++; pts += 150; }
      this.score += pts;
      this.good = 1;
      this.sfx.ready();
      this.burst(this.center.x, this.center.y - this.unit, '#4dffa6', 40);
      if (this.onBanner) {
        this.onBanner(perfect ? 'SAVRŠENO!' : 'PROŠAO!', Math.round(fit * 100) + '% u rupi  ·  +' + pts, false);
      }
    } else {
      this.lives--;
      this.shake = 1;
      this.flash = 1;
      this.sfx.hit();
      this.burst(this.center.x, this.center.y - this.unit * 0.5, '#ff6b7a', 46);
      if (this.onBanner) {
        this.onBanner('UDARIO SI U ZID', Math.round(fit * 100) + '% — treba ' + Math.round(need * 100) + '%', true);
      }
      if (this.lives <= 0) {
        this.over = true;
        this.sfx.gameover();
        if (this.onOver) setTimeout(this.onOver, 900);
      }
    }
  }

  burst(x, y, c, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = 120 + Math.random() * 520;
      this.parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.6, c: c, r: 2 + Math.random() * 4 });
    }
  }

  /* ---------- crtanje ---------- */
  render(body) {
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0.01) {
      const s = this.shake * 20;
      ctx.translate((Math.random() * 2 - 1) * s, (Math.random() * 2 - 1) * s);
    }
    ctx.clearRect(-40, -40, this.w + 80, this.h + 80);

    this.drawCamera(ctx);

    // blago zatamnjenje pozadine (ono što je van rupe biće ionako prekriveno zidom)
    ctx.fillStyle = 'rgba(4,8,14,.25)';
    ctx.fillRect(0, 0, this.w, this.h);

    if (this.pose && this.phase !== 'wait') this.drawWall(ctx);
    if (body && this.diff.offsetMax > 0 && this.phase === 'approach') this.drawMove(ctx, body);
    if (body) this.drawPlayer(ctx);
    this.drawParticles(ctx);
    ctx.restore();

    if (this.pose && this.phase !== 'wait') { this.drawMeter(ctx); this.drawPreview(ctx); }
    this.drawFlash(ctx);
  }

  drawCamera(ctx) {
    const c = this.coverParams();
    if (!c) {
      const g = ctx.createLinearGradient(0, 0, 0, this.h);
      g.addColorStop(0, '#221407'); g.addColorStop(1, '#06060a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, this.w, this.h);
      return;
    }
    ctx.save();
    ctx.translate(this.w, 0); ctx.scale(-1, 1);
    ctx.drawImage(this.video, this.w - c.dx - c.dw, c.dy, c.dw, c.dh);
    ctx.restore();
  }

  // Skala zida: daleko -> blizu.
  wallScale() { return 1 / (1 + (1 - Math.min(this.p, 1)) * 5); }

  drawWall(ctx) {
    const wc = this.wctx;
    const s = this.wallScale();
    const cx = this.center.x, cy = this.center.y;
    const u = this.unit * s;
    const holeW = 2 * this.diff.holeR * u;
    const headR = this.diff.headR * u;
    const half = Math.max(this.w, this.h) * 1.25 * s;
    const fade = this.phase === 'resolve' ? clamp(1 - (this.p - 1) / 0.55, 0, 1) : 1;

    wc.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    wc.clearRect(0, 0, this.w, this.h);

    // ploča zida
    const g = wc.createLinearGradient(cx - half, cy - half, cx + half, cy + half);
    g.addColorStop(0, '#3c4a63');
    g.addColorStop(0.5, '#232c3d');
    g.addColorStop(1, '#141a26');
    wc.fillStyle = g;
    wc.fillRect(cx - half, cy - half, half * 2, half * 2);

    // paneli
    wc.strokeStyle = 'rgba(180,220,255,.16)';
    wc.lineWidth = Math.max(1, 2 * s);
    const cell = Math.max(24, 110 * s);
    wc.beginPath();
    for (let x = cx - half; x < cx + half; x += cell) { wc.moveTo(x, cy - half); wc.lineTo(x, cy + half); }
    for (let y = cy - half; y < cy + half; y += cell) { wc.moveTo(cx - half, y); wc.lineTo(cx + half, y); }
    wc.stroke();

    // svetleći obod oko rupe (pa se rupa iseca preko njega)
    wc.lineCap = 'round'; wc.lineJoin = 'round';
    wc.strokeStyle = '#ffb347';
    wc.shadowColor = '#ff8a5b';
    wc.shadowBlur = 30 * s + 8;
    wc.lineWidth = holeW + Math.max(8, 20 * s);
    this.pathPose(wc, cx, cy, u);
    wc.shadowBlur = 0;
    wc.fillStyle = '#ffb347';
    wc.beginPath();
    wc.arc(cx + this.pose.head.x * u, cy + this.pose.head.y * u, headR + Math.max(4, 10 * s), 0, 6.283);
    wc.fill();

    // iseci rupu
    wc.globalCompositeOperation = 'destination-out';
    wc.lineWidth = holeW;
    this.pathPose(wc, cx, cy, u);
    wc.beginPath();
    wc.arc(cx + this.pose.head.x * u, cy + this.pose.head.y * u, headR, 0, 6.283);
    wc.fill();
    wc.globalCompositeOperation = 'source-over';

    ctx.save();
    ctx.globalAlpha = fade * WALL_ALPHA;
    ctx.drawImage(this.wc, 0, 0, this.w, this.h);
    ctx.restore();

    // svetleći rub rupe još jednom preko svega, da se jasno vidi i kroz providan zid
    ctx.save();
    ctx.globalAlpha = fade * 0.9;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#ffc266';
    ctx.shadowColor = '#ff8a5b';
    ctx.shadowBlur = 18 * s + 6;
    ctx.lineWidth = Math.max(2.5, 5 * s);
    for (const b of this.pose.bones) {
      const ax = cx + b[0].x * u, ay = cy + b[0].y * u;
      const bx = cx + b[1].x * u, by = cy + b[1].y * u;
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
      const nx2 = -dy / len * (holeW / 2), ny2 = dx / len * (holeW / 2);
      ctx.beginPath();
      ctx.moveTo(ax + nx2, ay + ny2); ctx.lineTo(bx + nx2, by + ny2);
      ctx.moveTo(ax - nx2, ay - ny2); ctx.lineTo(bx - nx2, by - ny2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx + this.pose.head.x * u, cy + this.pose.head.y * u, headR, 0, 6.283);
    ctx.stroke();
    ctx.restore();

    // preostalo vreme
    if (this.phase === 'approach') {
      const left = Math.max(0, (1 - this.p) * this.wallTime);
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.textAlign = 'center';
      ctx.font = '900 ' + Math.round(clamp(this.h * 0.05, 18, 44)) + 'px "Segoe UI",system-ui,Arial,sans-serif';
      ctx.fillStyle = left < 1.6 ? '#ff6b7a' : '#ffd180';
      ctx.shadowColor = '#000'; ctx.shadowBlur = 12;
      ctx.fillText(left.toFixed(1) + ' s', this.w / 2, this.h * 0.19);
      ctx.restore();
    }
  }

  pathPose(c, cx, cy, u) {
    c.beginPath();
    for (const b of this.pose.bones) {
      c.moveTo(cx + b[0].x * u, cy + b[0].y * u);
      c.lineTo(cx + b[1].x * u, cy + b[1].y * u);
    }
    c.stroke();
  }

  drawPlayer(ctx) {
    if (!this.segs) return;
    ctx.save();
    ctx.lineCap = 'round';
    for (const s of this.segs) {
      const good = s.frac > 0.99;
      const col = good ? '#4dffa6' : (s.frac > 0.5 ? '#ffd54f' : '#ff4d5e');
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = good ? 10 : 22;
      ctx.globalAlpha = good ? 0.55 : 0.95;
      ctx.lineWidth = good ? 5 : 7;
      if (s.head) {
        ctx.beginPath(); ctx.arc(s.a.x, s.a.y, 13, 0, 6.283); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.moveTo(s.a.x, s.a.y); ctx.lineTo(s.b.x, s.b.y); ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Strelica "pomeri se levo/desno" kad si van mrtve zone.
  drawMove(ctx, body) {
    const off = this.offX || 0;
    const y = this.h * 0.78;
    // uspravna oznaka gde treba da staneš
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#ffd180';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(this.center.x, y - this.h * 0.06);
    ctx.lineTo(this.center.x, this.h - 70);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    if (Math.abs(off) < 0.06) return;
    const dir = off > 0 ? -1 : 1;
    const heat = clamp(Math.abs(off) / 1.2, 0.35, 1);
    const x = clamp(body.center.x, 60, this.w - 60);
    ctx.save();
    ctx.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(this.t * 6));
    ctx.strokeStyle = heat > 0.7 ? '#ff6b7a' : '#ffd180';
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 20;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    const step = 34;
    for (let i = 1; i <= 3; i++) {
      const cxp = x + dir * (i * step + 18);
      ctx.beginPath();
      ctx.moveTo(cxp - dir * 12, y - 16);
      ctx.lineTo(cxp, y);
      ctx.lineTo(cxp - dir * 12, y + 16);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = '#fff';
    ctx.font = '900 ' + Math.round(clamp(this.h * 0.032, 13, 24)) + 'px "Segoe UI",system-ui,Arial,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(dir > 0 ? 'POMERI SE DESNO →' : '← POMERI SE LEVO', x, y - 34);
    ctx.restore();
  }

  // Mali stalni prikaz trazene poze u uglu - da je procitas i dok je zid daleko.
  drawPreview(ctx) {
    const u = Math.max(16, Math.min(this.w, this.h) * 0.055);
    const px = u * 2.5, py = this.h - u * 2.9;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(4,10,18,.62)';
    ctx.strokeStyle = 'rgba(255,179,71,.28)';
    ctx.lineWidth = 1.5;
    this.roundRect(ctx, px - u * 2.1, py - u * 2.2, u * 4.2, u * 4.0, 14);
    ctx.fill(); ctx.stroke();

    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#ffb347';
    ctx.shadowColor = '#ff8a5b';
    ctx.shadowBlur = 10;
    ctx.lineWidth = Math.max(4, 2 * this.diff.holeR * u);
    ctx.beginPath();
    for (const b of this.pose.bones) {
      ctx.moveTo(px + b[0].x * u, py + b[0].y * u);
      ctx.lineTo(px + b[1].x * u, py + b[1].y * u);
    }
    ctx.stroke();
    ctx.fillStyle = '#ffb347';
    ctx.beginPath();
    ctx.arc(px + this.pose.head.x * u, py + this.pose.head.y * u, this.diff.headR * u, 0, 6.283);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#fff';
    ctx.font = '800 ' + Math.round(Math.max(9, u * 0.36)) + 'px "Segoe UI",system-ui,Arial,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.pose.name, px, py + u * 1.66);
    ctx.restore();
  }

  drawMeter(ctx) {
    const need = this.diff.need;
    const W = Math.min(this.w * 0.5, 460), H = 16;
    const x = (this.w - W) / 2, y = this.h - 54;
    const f = clamp(this.fit, 0, 1);
    const ok = f >= need;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 1;
    this.roundRect(ctx, x, y, W, H, H / 2);
    ctx.fill(); ctx.stroke();

    const g = ctx.createLinearGradient(x, 0, x + W, 0);
    g.addColorStop(0, ok ? '#4dffa6' : '#ff8a5b');
    g.addColorStop(1, ok ? '#7ee8ff' : '#ffd54f');
    ctx.fillStyle = g;
    ctx.shadowColor = ok ? '#4dffa6' : '#ff8a5b';
    ctx.shadowBlur = 16;
    this.roundRect(ctx, x + 2, y + 2, Math.max(0, (W - 4) * f), H - 4, (H - 4) / 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // prag
    const tx = x + W * need;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(tx, y - 5); ctx.lineTo(tx, y + H + 5); ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = '800 12px "Segoe UI",system-ui,Arial,sans-serif';
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.85;
    ctx.fillText('POKLAPANJE ' + Math.round(f * 100) + '%   (treba ' + Math.round(need * 100) + '%)', this.w / 2, y - 12);
    ctx.restore();
  }

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  drawParticles(ctx) {
    ctx.save();
    for (const p of this.parts) {
      ctx.globalAlpha = clamp(p.life * 1.4, 0, 1);
      ctx.fillStyle = p.c;
      ctx.shadowColor = p.c; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
    }
    ctx.restore();
  }

  drawFlash(ctx) {
    const v = Math.max(this.flash, this.good);
    if (v < 0.02) return;
    const bad = this.flash >= this.good;
    ctx.save();
    ctx.globalAlpha = v * 0.55;
    const r = ctx.createRadialGradient(this.w / 2, this.h / 2, this.h * 0.2, this.w / 2, this.h / 2, this.h * 0.9);
    r.addColorStop(0, 'rgba(0,0,0,0)');
    r.addColorStop(1, bad ? 'rgba(255,30,60,.95)' : 'rgba(0,255,150,.75)');
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
const game = new WallGame(canvas, video, sfx);

let state = 'intro';        // intro | loading | calib | play | over
let last = performance.now();
let calSamples = 0;
let countdown = 0;
let toastT = 0;
let handsUpT = 0;
let chosen = 1;
let best = +(localStorage.getItem('wall_best') || 0);
$('best').textContent = best;

const SCREENS = ['screen-intro', 'screen-loading', 'screen-calib', 'screen-over'];
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

for (const b of document.querySelectorAll('[data-diff]')) {
  b.addEventListener('click', () => { chosen = +b.dataset.diff; startWithCamera(); });
}
$('btn-again').addEventListener('click', restart);
$('btn-menu').addEventListener('click', toMenu);
addEventListener('resize', () => game.resize());
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'm') toast(sfx.toggle() ? 'ZVUK UKLJUČEN' : 'ZVUK ISKLJUČEN');
  else if (k === 'b') game.debug = !game.debug;
  else if (k === 'r' && state === 'play') startCalib();
  else if (k === 'escape') toMenu();
  else if (k === ' ' && state === 'over') { restart(); e.preventDefault(); }
});

async function startWithCamera() {
  sfx.init(); sfx.resume();
  game.setDiff(chosen);
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
    $('load-msg').textContent = 'Proveri internet i osveži stranicu.';
    setTimeout(() => { show('screen-intro'); state = 'intro'; }, 3400);
    return;
  }
  startCalib();
}

function startCalib() {
  calSamples = 0;
  countdown = 0;
  state = 'calib';
  show('screen-calib');
  hud(false);
}

function startPlay() {
  const home = game.baseX;
  game.reset();
  game.setDiff(chosen);
  game.baseX = home;
  game.center.x = home;
  game.phase = 'wait';
  game.waitT = 0.8;
  $('level').textContent = DIFF[chosen].name;
  show(null);
  hud(true);
  state = 'play';
}

function restart() { handsUpT = 0; startPlay(); }
function toMenu() { state = 'intro'; show('screen-intro'); hud(false); }

function gameOver() {
  state = 'over';
  hud(false);
  best = Math.max(best, Math.round(game.score));
  localStorage.setItem('wall_best', String(best));
  $('r-score').textContent = Math.round(game.score);
  $('r-walls').textContent = game.passed;
  $('r-perfect').textContent = game.perfect;
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
  $('level').textContent = 'ZID ' + game.index + ' · ' + game.diff.name;
  $('poseName').textContent = game.pose ? game.pose.name : '';
  const el = $('lives');
  if (el.dataset.n !== String(game.lives)) {
    let s = '';
    for (let i = 0; i < 3; i++) s += '<i class="' + (i < game.lives ? '' : 'off') + '">♥</i>';
    el.innerHTML = s;
    el.dataset.n = String(game.lives);
  }
}

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
      game.baseX = game.center.x;
      const legs = game.vis(lms[LM.L_KNEE]) && game.vis(lms[LM.R_KNEE]);
      $('calib-hint').textContent = legs ? 'Vidim te celog. Spremi se!' : 'Odmakni se malo — ne vidim ti noge (igra će raditi i ovako).';
    } else {
      calSamples = Math.max(0, calSamples - 2);
      $('calib-hint').textContent = 'Tražim telo... stani ispred kamere';
    }
    $('calib-fill').style.width = Math.round(Math.min(1, calSamples / 50) * 100) + '%';
    if (calSamples >= 50) {
      if (countdown === 0) countdown = 3.999;
      countdown -= dt;
      const n = Math.max(1, Math.ceil(countdown - 0.999));
      if ($('calib-count').textContent !== String(n)) { $('calib-count').textContent = n; sfx.count(n === 1); }
      if (countdown <= 1) startPlay();
    } else {
      countdown = 0;
      $('calib-count').textContent = '3';
    }

  } else if (state === 'play') {
    game.update(dt, body);
    updateHud();

  } else if (state === 'over') {
    game.update(dt, body);
    handsUpT = handsAbove(lms) ? handsUpT + dt : Math.max(0, handsUpT - dt * 2);
    $('hu-fill').style.width = Math.round(Math.min(1, handsUpT / 1.1) * 100) + '%';
    if (handsUpT >= 1.1) restart();
  }

  game.render(body);

  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
  if ((now | 0) % 8 === 0) {
    $('status').textContent = 'PRAĆENJE TELA' + (state === 'play' ? '  ·  ' + tracker.fps + ' FPS' : '') + (game.debug ? '  ·  DEBUG' : '');
  }
}

window.WALL = { game: game, tracker: tracker, POSES: POSES, get state() { return state; } };
$('status').textContent = 'PRAĆENJE TELA';
requestAnimationFrame(frame);
