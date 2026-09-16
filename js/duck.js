// LOV NA PATKE — ciljaš kažiprstom, pucaš pucketanjem prstima.
// Kamera se ne prikazuje; vidi se samo nišan i obris šake kao potvrda praćenja.

import { Sfx } from './audio.js';
import { HandTracker, H, H_BONES, aimFromHand } from './hands.js';
import { SnapDetector } from './snap.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;

const PATKE_PO_RUNDI = 10;
const METAKA = 3;

const VRSTE = [
  { ime: 'crna',  telo: '#3d4a5c', krilo: '#6b7c93', glava: '#28313d', poeni: 500,  brzina: 1.00 },
  { ime: 'plava', telo: '#2f6fb5', krilo: '#5aa0e0', glava: '#1f4f85', poeni: 1000, brzina: 1.25 },
  { ime: 'crvena',telo: '#c0392b', krilo: '#e8705f', glava: '#8e2a20', poeni: 1500, brzina: 1.55 }
];

const NEBA = [
  ['#7ec8e3', '#f3e9c6'], ['#89c4f4', '#ffe9b0'], ['#6aa9d8', '#ffd59e'],
  ['#4a7fb5', '#ffb877'], ['#2e5a8a', '#ff9d6e'], ['#1f3f66', '#c96f8a']
];

export class DuckGame {
  constructor(canvas, sfx) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sfx = sfx;
    this.onRound = null;
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
    this.travaY = this.h * 0.78;
    this.grmovi = [];
    for (let i = 0; i < 14; i++) {
      this.grmovi.push({ x: Math.random() * this.w, r: rand(0.04, 0.09) * this.w, t: Math.random() });
    }
  }

  reset() {
    this.runda = 1;
    this.poeni = 0;
    this.patke = [];
    this.perje = [];
    this.pucnji = [];
    this.natpisi = [];
    this.metaka = METAKA;
    this.uRundi = 0;          // koliko je pušteno u ovoj rundi
    this.pogodjeno = 0;
    this.pobeglo = 0;
    this.rezultatRunde = [];  // za red ikonica
    this.faza = 'pauza';      // pauza | let | kraj-runde
    this.pauzaT = 1.2;
    this.t = 0;
    this.trzaj = 0;
    this.blesak = 0;
    this.pas = null;
    this.gotovo = false;
  }

  get kvota() { return Math.min(9, 5 + Math.floor(this.runda / 2)); }
  get nebo() { return NEBA[Math.min(NEBA.length - 1, this.runda - 1)]; }

  /* ---------------- patke ---------------- */
  pustiPatke() {
    const koliko = this.runda >= 3 && Math.random() < 0.45 ? 2 : 1;
    for (let i = 0; i < koliko; i++) {
      if (this.uRundi >= PATKE_POiRUNDI_safe()) break;
      this.uRundi++;
      const vrsta = VRSTE[Math.min(VRSTE.length - 1,
        Math.random() < 0.15 + this.runda * 0.06 ? (Math.random() < 0.4 ? 2 : 1) : 0)];
      const sLeva = Math.random() < 0.5;
      const brzina = (0.16 + this.runda * 0.015) * vrsta.brzina * this.w;
      this.patke.push({
        vrsta: vrsta,
        x: sLeva ? rand(this.w * 0.15, this.w * 0.45) : rand(this.w * 0.55, this.w * 0.85),
        y: this.travaY + rand(0, 30),
        vx: (sLeva ? 1 : -1) * brzina * rand(0.6, 1),
        vy: -brzina * rand(0.55, 0.85),
        faza: Math.random() * 6,
        skreni: rand(1.2, 2.4),
        r: this.w * 0.035,
        stanje: 'leti',       // leti | pogodjena | pada | gotova
        t: 0,
        zivot: 0,
        letVreme: Math.max(4.2, 7.5 - this.runda * 0.35)
      });
      this.sfx.tone(rand(700, 900), 0.09, { type: 'square', vol: 0.18, to: 420 });
    }
    this.metaka = METAKA;
    this.faza = 'let';
  }

  update(dt, nisan) {
    this.t += dt;
    this.trzaj = Math.max(0, this.trzaj - dt * 3);
    this.blesak = Math.max(0, this.blesak - dt * 6);

    for (const p of this.perje) { p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; p.rot += p.vrot * dt; }
    this.perje = this.perje.filter(p => p.t > 0);
    for (const s of this.pucnji) s.t -= dt * 4;
    this.pucnji = this.pucnji.filter(s => s.t > 0);
    for (const n of this.natpisi) { n.t -= dt; n.y -= dt * 40; }
    this.natpisi = this.natpisi.filter(n => n.t > 0);
    if (this.pas) {
      this.pas.t += dt;
      if (this.pas.t > this.pas.trajanje) this.pas = null;
    }

    if (this.gotovo) return;

    if (this.faza === 'pauza') {
      this.pauzaT -= dt;
      if (this.pauzaT <= 0) {
        if (this.uRundi >= PATKE_PO_RUNDI) this.zavrsiRundu();
        else this.pustiPatke();
      }
      return;
    }

    if (this.faza === 'kraj-runde') return;

    // let
    let uLetu = 0;
    for (const p of this.patke) {
      p.t += dt;
      p.faza += dt * 12;

      if (p.stanje === 'leti') {
        uLetu++;
        p.zivot += dt;
        // vijuganje
        p.vy += Math.sin(p.t * p.skreni) * 40 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        // odbij se od ivica i plafona
        if (p.x < p.r) { p.x = p.r; p.vx = Math.abs(p.vx); }
        if (p.x > this.w - p.r) { p.x = this.w - p.r; p.vx = -Math.abs(p.vx); }
        if (p.y < p.r) { p.y = p.r; p.vy = Math.abs(p.vy) * 0.6; }
        if (p.y > this.travaY - 10) { p.y = this.travaY - 10; p.vy = -Math.abs(p.vy); }
        // pobegla
        if (p.zivot > p.letVreme) {
          p.stanje = 'bezi';
          p.vy = -this.h * 0.55;
          p.vx *= 0.6;
        }
      } else if (p.stanje === 'bezi') {
        uLetu++;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y < -p.r * 2) {
          p.stanje = 'gotova';
          this.pobeglo++;
          this.rezultatRunde.push(false);
          this.sfx.tone(300, 0.4, { type: 'sine', vol: 0.22, to: 150 });
        }
      } else if (p.stanje === 'pogodjena') {
        p.t2 = (p.t2 || 0) + dt;
        if (p.t2 > 0.35) { p.stanje = 'pada'; p.vy = 0; }
      } else if (p.stanje === 'pada') {
        p.vy += 900 * dt;
        p.y += p.vy * dt;
        p.rot = (p.rot || 0) + dt * 6;
        if (p.y > this.travaY + 10) {
          p.stanje = 'gotova';
          this.sfx.noise(0.18, { vol: 0.25, freq: 500 });
          this.perjeBurst(p.x, this.travaY, p.vrsta.telo, 10);
        }
      }
    }
    this.patke = this.patke.filter(p => p.stanje !== 'gotova' || p.t < 0);

    // kad nema više patki u vazduhu -> sledeći talas
    const ostalo = this.patke.some(p => p.stanje !== 'gotova');
    if (!ostalo) {
      this.faza = 'pauza';
      this.pauzaT = 0.9;
    }
  }

  // Pucanj na zadatoj tački
  pucaj(x, y) {
    if (this.gotovo || this.faza !== 'let') return false;
    if (this.metaka <= 0) {
      this.sfx.tone(180, 0.08, { type: 'square', vol: 0.15 });   // prazno
      return false;
    }
    this.metaka--;
    this.trzaj = 1;
    this.blesak = 1;
    this.pucnji.push({ x: x, y: y, t: 1 });
    this.sfx.noise(0.16, { vol: 0.5, freq: 1200 });
    this.sfx.tone(120, 0.22, { type: 'sawtooth', vol: 0.4, to: 45 });

    // pogodak? gađamo najbližu patku u krugu
    let meta = null, najbliza = 1e9;
    for (const p of this.patke) {
      if (p.stanje !== 'leti' && p.stanje !== 'bezi') continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < p.r * 1.9 && d < najbliza) { najbliza = d; meta = p; }
    }
    if (meta) {
      meta.stanje = 'pogodjena';
      meta.t2 = 0;
      const poeni = meta.vrsta.poeni;
      this.poeni += poeni;
      this.pogodjeno++;
      this.rezultatRunde.push(true);
      this.natpisi.push({ x: meta.x, y: meta.y, tekst: '+' + poeni, t: 1.1, boja: '#ffd54f' });
      this.perjeBurst(meta.x, meta.y, meta.vrsta.krilo, 18);
      this.sfx.tone(880, 0.1, { type: 'triangle', vol: 0.3 });
      this.sfx.tone(1320, 0.14, { type: 'triangle', vol: 0.25, delay: 0.07 });
      return true;
    }
    return false;
  }

  zavrsiRundu() {
    this.faza = 'kraj-runde';
    const prosao = this.pogodjeno >= this.kvota;
    this.pas = { t: 0, trajanje: 2.6, smeje: !prosao, patke: Math.min(2, this.pogodjeno) };
    if (prosao) {
      const bonus = this.pogodjeno === PATKE_PO_RUNDI ? 10000 : 0;
      this.poeni += bonus;
      this.sfx.ready();
      if (this.onBanner) this.onBanner('RUNDA ' + this.runda + ' PROŠLA',
        this.pogodjeno + '/' + PATKE_PO_RUNDI + (bonus ? '  SAVRŠENO +10000' : ''), false);
      setTimeout(() => {
        this.runda++;
        this.uRundi = 0;
        this.pogodjeno = 0;
        this.pobeglo = 0;
        this.rezultatRunde = [];
        this.patke = [];
        this.faza = 'pauza';
        this.pauzaT = 1.0;
        if (this.onRound) this.onRound(this.runda);
      }, 2800);
    } else {
      this.sfx.gameover();
      if (this.onBanner) this.onBanner('PROMAŠIO SI RUNDU',
        this.pogodjeno + '/' + PATKE_PO_RUNDI + ', trebalo je ' + this.kvota, true);
      this.gotovo = true;
      if (this.onOver) setTimeout(this.onOver, 2600);
    }
  }

  perjeBurst(x, y, boja, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = rand(40, 220);
      this.perje.push({
        x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60,
        t: rand(0.5, 1.2), boja: boja, r: rand(3, 7),
        rot: Math.random() * 6, vrot: rand(-6, 6)
      });
    }
  }

  /* ---------------- crtanje ---------------- */
  render(nisan, saka, mic) {
    const ctx = this.ctx;
    ctx.save();
    if (this.trzaj > 0.01) {
      const s = this.trzaj * 7;
      ctx.translate(rand(-s, s), rand(-s, s));
    }
    this.crtajPozadinu(ctx);
    for (const p of this.patke) this.crtajPatku(ctx, p);
    this.crtajPerje(ctx);
    this.crtajTravu(ctx);
    if (this.pas) this.crtajPsa(ctx);
    this.crtajPucnje(ctx, nisan);
    this.crtajNatpise(ctx);
    ctx.restore();
    if (saka) this.crtajSaku(ctx, saka);
    if (nisan) this.crtajNisan(ctx, nisan);
    if (this.blesak > 0.02) {
      ctx.save();
      ctx.globalAlpha = this.blesak * 0.25;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.restore();
    }
  }

  crtajPozadinu(ctx) {
    const [a, b] = this.nebo;
    const g = ctx.createLinearGradient(0, 0, 0, this.travaY);
    g.addColorStop(0, a); g.addColorStop(1, b);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.travaY + 2);

    // sunce
    ctx.save();
    ctx.globalAlpha = 0.5;
    const sg = ctx.createRadialGradient(this.w * 0.78, this.h * 0.2, 4, this.w * 0.78, this.h * 0.2, this.w * 0.2);
    sg.addColorStop(0, '#fff6d0'); sg.addColorStop(1, 'rgba(255,246,208,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(this.w * 0.78, this.h * 0.2, this.w * 0.2, 0, 6.283); ctx.fill();
    ctx.restore();

    // oblaci
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 4; i++) {
      const x = ((this.t * 6 + i * 340) % (this.w + 300)) - 150;
      const y = this.h * (0.12 + i * 0.07);
      const r = this.w * 0.035;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 6.283);
      ctx.arc(x + r, y + r * 0.2, r * 0.8, 0, 6.283);
      ctx.arc(x - r, y + r * 0.25, r * 0.7, 0, 6.283);
      ctx.fill();
    }
    ctx.restore();

    // brda
    ctx.fillStyle = 'rgba(60,110,70,.55)';
    ctx.beginPath();
    ctx.moveTo(0, this.travaY);
    for (let i = 0; i <= 8; i++) {
      const x = this.w * i / 8;
      ctx.lineTo(x, this.travaY - Math.abs(Math.sin(i * 1.7)) * this.h * 0.13 - this.h * 0.02);
    }
    ctx.lineTo(this.w, this.travaY);
    ctx.closePath(); ctx.fill();
  }

  crtajTravu(ctx) {
    ctx.fillStyle = '#3f7a3f';
    ctx.fillRect(0, this.travaY, this.w, this.h - this.travaY);
    ctx.fillStyle = '#2f5f2f';
    for (const g of this.grmovi) {
      ctx.beginPath();
      ctx.arc(g.x, this.travaY + g.r * 0.25, g.r, Math.PI, 0);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.fillRect(0, this.travaY, this.w, 4);
  }

  crtajPatku(ctx, p) {
    if (p.stanje === 'gotova') return;
    const V = p.vrsta;
    const smer = p.vx >= 0 ? 1 : -1;
    const r = p.r;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.rot) ctx.rotate(p.rot);
    ctx.scale(smer, 1);

    if (p.stanje === 'pogodjena') {
      // zaustavljena u vazduhu, krila gore
      ctx.fillStyle = V.krilo;
      ctx.beginPath(); ctx.ellipse(-r * 0.1, -r * 0.9, r * 0.35, r * 0.75, 0.3, 0, 6.283); ctx.fill();
    } else {
      const zamah = Math.sin(p.faza) * 0.9;
      ctx.fillStyle = V.krilo;
      ctx.save(); ctx.rotate(zamah * 0.5);
      ctx.beginPath(); ctx.ellipse(-r * 0.15, -r * 0.55, r * 0.34, r * 0.72, 0.25, 0, 6.283); ctx.fill();
      ctx.restore();
    }

    // telo
    ctx.fillStyle = V.telo;
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.62, 0, 0, 6.283); ctx.fill();
    // rep
    ctx.beginPath();
    ctx.moveTo(-r * 0.85, -r * 0.1);
    ctx.lineTo(-r * 1.45, -r * 0.42);
    ctx.lineTo(-r * 0.85, r * 0.25);
    ctx.closePath(); ctx.fill();
    // vrat i glava
    ctx.fillStyle = V.glava;
    ctx.beginPath(); ctx.ellipse(r * 0.72, -r * 0.42, r * 0.36, r * 0.32, -0.3, 0, 6.283); ctx.fill();
    // kljun
    ctx.fillStyle = '#f0a02a';
    ctx.beginPath();
    ctx.moveTo(r * 1.02, -r * 0.45);
    ctx.lineTo(r * 1.5, -r * 0.34);
    ctx.lineTo(r * 1.02, -r * 0.2);
    ctx.closePath(); ctx.fill();
    // oko
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(r * 0.82, -r * 0.5, r * 0.1, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(r * 0.84, -r * 0.5, r * 0.05, 0, 6.283); ctx.fill();

    if (p.stanje === 'leti' || p.stanje === 'bezi') {
      const zamah = Math.sin(p.faza + 0.6) * 0.9;
      ctx.fillStyle = V.krilo;
      ctx.save(); ctx.rotate(-zamah * 0.5);
      ctx.beginPath(); ctx.ellipse(-r * 0.1, r * 0.35, r * 0.32, r * 0.62, -0.2, 0, 6.283); ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    if (p.stanje === 'bezi') {
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#fff';
      ctx.font = '900 ' + Math.round(this.w * 0.022) + 'px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('BEŽI!', p.x, p.y - r * 1.6);
      ctx.restore();
    }
  }

  crtajPerje(ctx) {
    ctx.save();
    for (const p of this.perje) {
      ctx.globalAlpha = clamp(p.t, 0, 1);
      ctx.fillStyle = p.boja;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.45, 0, 0, 6.283); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  crtajPucnje(ctx, nisan) {
    ctx.save();
    for (const s of this.pucnji) {
      ctx.globalAlpha = clamp(s.t, 0, 1) * 0.8;
      const r = (1 - s.t) * this.w * 0.06 + 8;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, 6.283); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      for (let i = 0; i < 6; i++) {
        const a = i * 1.047 + s.t * 2;
        ctx.beginPath();
        ctx.arc(s.x + Math.cos(a) * r * 0.6, s.y + Math.sin(a) * r * 0.6, 3, 0, 6.283);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  crtajNatpise(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    for (const n of this.natpisi) {
      ctx.globalAlpha = clamp(n.t, 0, 1);
      ctx.fillStyle = n.boja;
      ctx.font = '900 ' + Math.round(this.w * 0.024) + 'px system-ui,sans-serif';
      ctx.shadowColor = '#000'; ctx.shadowBlur = 8;
      ctx.fillText(n.tekst, n.x, n.y);
    }
    ctx.restore();
  }

  crtajPsa(ctx) {
    const d = this.pas;
    const napred = clamp(d.t / 0.5, 0, 1) * clamp((d.trajanje - d.t) / 0.5, 0, 1);
    const y = this.travaY + 40 - napred * this.h * 0.19;
    const x = this.w * 0.5;
    const s = this.w * 0.055;
    ctx.save();
    ctx.translate(x, y);
    // telo
    ctx.fillStyle = '#b5762f';
    ctx.beginPath(); ctx.ellipse(0, s * 0.6, s * 0.9, s * 0.7, 0, 0, 6.283); ctx.fill();
    // glava
    ctx.beginPath(); ctx.ellipse(s * 0.5, -s * 0.25, s * 0.55, s * 0.45, 0, 0, 6.283); ctx.fill();
    // uvo
    ctx.fillStyle = '#8a5622';
    ctx.beginPath(); ctx.ellipse(s * 0.15, -s * 0.35, s * 0.22, s * 0.42, 0.3, 0, 6.283); ctx.fill();
    // njuska
    ctx.fillStyle = '#e8d3b0';
    ctx.beginPath(); ctx.ellipse(s * 0.95, -s * 0.12, s * 0.3, s * 0.22, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(s * 1.2, -s * 0.18, s * 0.08, 0, 6.283); ctx.fill();
    // oko
    ctx.beginPath(); ctx.arc(s * 0.55, -s * 0.4, s * 0.07, 0, 6.283); ctx.fill();

    if (d.smeje) {
      // otvorena usta = smeje se
      ctx.fillStyle = '#7a2020';
      ctx.beginPath(); ctx.ellipse(s * 0.95, s * 0.05, s * 0.22, s * 0.14, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '900 ' + Math.round(this.w * 0.026) + 'px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('HA HA!', 0, -s * 1.3);
    } else {
      // drži patke
      for (let i = 0; i < d.patke; i++) {
        ctx.fillStyle = '#3d4a5c';
        ctx.beginPath();
        ctx.ellipse(-s * 0.5 + i * s * 0.7, -s * 0.85, s * 0.3, s * 0.2, -0.4, 0, 6.283);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // obris šake — potvrda da praćenje radi (kamera se ne prikazuje)
  crtajSaku(ctx, saka) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
    ctx.beginPath();
    for (const b of H_BONES) {
      const a = saka[b[0]], c = saka[b[1]];
      if (!a || !c) continue;
      ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y);
    }
    ctx.stroke();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#ffd54f';
    const vrh = saka[H.KAZI_VRH];
    if (vrh) { ctx.beginPath(); ctx.arc(vrh.x, vrh.y, 5, 0, 6.283); ctx.fill(); }
    ctx.restore();
  }

  crtajNisan(ctx, n) {
    const r = Math.max(18, this.w * 0.024);
    const boja = n.aktivan ? '#ff3b30' : '#8a95a5';
    ctx.save();
    ctx.translate(n.x, n.y);
    ctx.strokeStyle = boja;
    ctx.lineWidth = 3;
    ctx.shadowColor = boja; ctx.shadowBlur = 12;
    ctx.globalAlpha = n.aktivan ? 1 : 0.5;

    ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-r * 1.6, 0); ctx.lineTo(-r * 0.4, 0);
    ctx.moveTo(r * 0.4, 0); ctx.lineTo(r * 1.6, 0);
    ctx.moveTo(0, -r * 1.6); ctx.lineTo(0, -r * 0.4);
    ctx.moveTo(0, r * 0.4); ctx.lineTo(0, r * 1.6);
    ctx.stroke();
    ctx.fillStyle = boja;
    ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, 6.283); ctx.fill();

    // prsten koji pulsira posle pucnja
    if (this.trzaj > 0.02) {
      ctx.globalAlpha = this.trzaj * 0.8;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, r * (1.6 + (1 - this.trzaj) * 1.4), 0, 6.283); ctx.stroke();
    }
    ctx.restore();
  }
}

function PATKE_POiRUNDI_safe() { return PATKE_PO_RUNDI; }
