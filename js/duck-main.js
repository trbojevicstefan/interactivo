// LOV NA PATKE — spajanje: šaka (ciljanje) + mikrofon (pucanj) + igra.

import { Sfx } from './audio.js';
import { HandTracker, H, aimFromHand } from './hands.js';
import { SnapDetector } from './snap.js';
import { DuckGame } from './duck.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

const video = $('cam');
const canvas = $('game');
const sfx = new Sfx();
const tracker = new HandTracker();
const snap = new SnapDetector();
const game = new DuckGame(canvas, sfx);

let state = 'intro';        // intro | loading | calib | play | over
let okidac = 'snap';        // snap | mis
let ciljanje = 'saka';      // saka | mis
let last = performance.now();
let best = +(localStorage.getItem('duck_best') || 0);
let calT = 0;
let toastT = 0;
const nisan = { x: 0, y: 0, aktivan: false, videnT: 0 };
const mis = { x: 0, y: 0, ima: false };
let sakaPx = null;

$('best').textContent = best;

const SCREENS = ['screen-intro', 'screen-loading', 'screen-calib', 'screen-over'];
function show(id) { for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id); }
function hud(on) { $('hud').classList.toggle('hidden', !on); }
function toast(m) { const e = $('toast'); e.textContent = m; e.classList.add('show'); toastT = 2; }
function banner(a, b, lose) {
  const e = $('banner');
  e.innerHTML = a + (b ? '<small>' + b + '</small>' : '');
  e.classList.toggle('bad', !!lose);
  e.classList.remove('show'); void e.offsetWidth; e.classList.add('show');
}
game.onBanner = banner;
game.onOver = gameOver;
game.onRound = r => toast('RUNDA ' + r);

/* ---------------- ulaz ---------------- */
canvas.addEventListener('mousemove', e => { mis.x = e.clientX; mis.y = e.clientY; mis.ima = true; });
canvas.addEventListener('mousedown', e => {
  mis.x = e.clientX; mis.y = e.clientY; mis.ima = true;
  if (state === 'play') game.pucaj(nisan.x, nisan.y);
});
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === ' ') { if (state === 'play') game.pucaj(nisan.x, nisan.y); e.preventDefault(); }
  else if (k === 'm') toast(sfx.toggle() ? 'ZVUK UKLJUČEN' : 'ZVUK ISKLJUČEN');
  else if (k === 'escape') toMenu();
  else if (k === 'k' && snap.ready) { snap.calibrate(2); toast('MERIM POZADINSKI ŠUM...'); }
});
addEventListener('resize', () => game.resize());

$('btn-start').addEventListener('click', () => start('full'));
$('btn-nomic').addEventListener('click', () => start('nomic'));
$('btn-mouse').addEventListener('click', () => start('mis'));
$('btn-again').addEventListener('click', restart);
$('btn-menu').addEventListener('click', toMenu);
$('sens').addEventListener('input', e => {
  snap.setSensitivity(+e.target.value / 100);
  $('sens-val').textContent = Math.round(+e.target.value) + '%';
});

/* ---------------- tok ---------------- */
async function start(rezim) {
  const saSnapom = rezim === 'full';
  okidac = saSnapom ? 'snap' : 'mis';
  ciljanje = rezim === 'mis' ? 'mis' : 'saka';
  sfx.init(); sfx.resume();

  // Režim bez kamere: ciljaš mišem, pucaš klikom.
  if (ciljanje === 'mis') { startPlay(); return; }

  show('screen-loading'); state = 'loading';
  $('load-msg').textContent = 'Tražim dozvolu za kameru' + (saSnapom ? ' i mikrofon' : '');
  try {
    await tracker.startCamera(video, saSnapom);
  } catch (e) {
    console.error(e);
    $('load-title').textContent = 'NEMA PRISTUPA';
    $('load-msg').textContent = 'Dozvoli kameru' + (saSnapom ? ' i mikrofon' : '') + ' pa osveži stranicu.';
    setTimeout(() => { show('screen-intro'); state = 'intro'; }, 3400);
    return;
  }
  $('load-msg').textContent = 'Pripremam prepoznavanje šake...';
  try {
    await tracker.initModel(m => { $('load-msg').textContent = m; });
  } catch (e) {
    console.error(e);
    $('load-title').textContent = 'MODEL NIJE UČITAN';
    $('load-msg').textContent = 'Proveri internet pa osveži stranicu.';
    setTimeout(() => { show('screen-intro'); state = 'intro'; }, 3400);
    return;
  }
  if (saSnapom) {
    $('load-msg').textContent = 'Pripremam mikrofon...';
    try {
      await snap.start(tracker.stream);
      snap.setSensitivity(+$('sens').value / 100);
    } catch (e) {
      console.warn('mikrofon:', e);
      okidac = 'mis';
      toast('MIKROFON NE RADI — pucaj klikom');
    }
  }
  startCalib();
}

function startCalib() {
  state = 'calib';
  calT = 0;
  show('screen-calib');
  hud(false);
  $('calib-mic').classList.toggle('hidden', okidac !== 'snap');
  if (okidac === 'snap') snap.calibrate(2);
}

function startPlay() {
  game.reset();
  show(null);
  hud(true);
  state = 'play';
  sfx.ready();
}
function restart() { startPlay(); }
function toMenu() { state = 'intro'; show('screen-intro'); hud(false); }

function gameOver() {
  state = 'over';
  hud(false);
  best = Math.max(best, game.poeni);
  localStorage.setItem('duck_best', String(best));
  $('r-poeni').textContent = game.poeni;
  $('r-runda').textContent = game.runda;
  $('r-best').textContent = best;
  show('screen-over');
}

/* ---------------- ciljanje ---------------- */
// Iz normalizovanih koordinata u ekran: ogledalo + uvećanje središta kadra,
// da ne moraš da mašeš rukom do ivice slike.
function uEkran(nx, ny) {
  const mx = 1 - nx;
  return {
    x: clamp((mx - 0.15) / 0.70, 0, 1) * game.w,
    y: clamp((ny - 0.12) / 0.66, 0, 1) * game.h
  };
}

function odaberiSaku(hands) {
  if (!hands || !hands.length) return null;
  let naj = null, najv = -1;
  for (const h of hands) {
    const a = aimFromHand(h, 0);
    if (!a) continue;
    if (a.ispruzen > najv) { najv = a.ispruzen; naj = h; }
  }
  return naj;
}

function osvezNisan(hands, dt, now) {
  const saka = odaberiSaku(hands);
  sakaPx = null;

  if (saka) {
    const a = aimFromHand(saka, 0.8);
    if (a) {
      const p = uEkran(a.x, a.y);
      // glatko kad miruje, brzo kad se pomera
      const d = Math.hypot(p.x - nisan.x, p.y - nisan.y);
      const alfa = clamp(0.14 + d / (game.w * 0.09) * 0.5, 0.14, 0.7);
      nisan.x = lerp(nisan.x, p.x, alfa);
      nisan.y = lerp(nisan.y, p.y, alfa);
      nisan.videnT = now;
      // obris šake za prikaz
      sakaPx = saka.map(q => uEkran(q.x, q.y));
    }
  }
  if (ciljanje === 'mis' && mis.ima) {
    nisan.x = mis.x; nisan.y = mis.y; nisan.videnT = now;
  }
  nisan.aktivan = (now - nisan.videnT) < 400;
}

/* ---------------- HUD ---------------- */
function osveziHud() {
  $('poeni').textContent = game.poeni;
  $('runda').textContent = 'RUNDA ' + game.runda;
  $('kvota').textContent = game.pogodjeno + '/' + game.kvota;
  let m = '';
  for (let i = 0; i < 3; i++) m += '<i class="' + (i < game.metaka ? '' : 'off') + '">❚</i>';
  const el = $('meci');
  if (el.dataset.n !== String(game.metaka)) { el.innerHTML = m; el.dataset.n = String(game.metaka); }
  let r = '';
  for (let i = 0; i < 10; i++) {
    const v = game.rezultatRunde[i];
    r += '<i class="' + (v === true ? 'hit' : v === false ? 'miss' : '') + '">▲</i>';
  }
  const rel = $('red');
  if (rel.dataset.n !== String(game.rezultatRunde.length)) { rel.innerHTML = r; rel.dataset.n = String(game.rezultatRunde.length); }
  if (okidac === 'snap') {
    $('mic-bar').style.width = Math.round(clamp(snap.level, 0, 1) * 100) + '%';
  }
}

/* ---------------- petlja ---------------- */
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;

  const hands = tracker.update(now);
  osvezNisan(hands, dt, now);

  if (okidac === 'snap' && snap.ready) {
    const n = snap.take();
    for (let i = 0; i < n; i++) {
      if (state === 'play') game.pucaj(nisan.x, nisan.y);
      else if (state === 'calib') { $('calib-test').textContent = 'Čuo sam pucketanje! ✓'; $('calib-test').className = 'ok'; }
    }
  }

  if (state === 'calib') {
    calT += dt;
    const vidim = nisan.aktivan;
    $('calib-hand').textContent = vidim ? 'Vidim šaku ✓' : 'Podigni šaku ispred kamere i ispruži kažiprst';
    $('calib-hand').className = vidim ? 'ok' : '';
    const spreman = vidim && calT > 2.5 && (okidac !== 'snap' || !snap.calibrating);
    $('btn-go').disabled = !spreman;
    $('btn-go').textContent = spreman ? 'KRENI!' : 'Pripremam...';
  } else if (state === 'play') {
    game.update(dt, nisan);
    osveziHud();
  }

  game.render(nisan, sakaPx, snap);

  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
  if ((now | 0) % 8 === 0) {
    $('status').textContent = (ciljanje === 'mis' ? 'MIŠ' : (okidac === 'snap' ? 'PRST + PUCKETANJE' : 'PRST + KLIK')) +
      (state === 'play' ? '  ·  ' + tracker.fps + ' FPS' : '') +
      (tracker.stalled ? '  ·  SLIKA STOJI' : '');
  }
}

$('btn-go').addEventListener('click', startPlay);

window.DUCK = { game: game, tracker: tracker, snap: snap, nisan: nisan, get state() { return state; } };
$('status').textContent = 'SPREMAN';
requestAnimationFrame(frame);
