// Spajanje svega: ekrani, kalibracija, petlja igre.
import { Sfx } from './audio.js';
import { PoseTracker, PoseAnalyzer } from './pose.js';
import { Game } from './game.js';

const $ = id => document.getElementById(id);
const video = $('cam');
const canvas = $('game');

const sfx = new Sfx();
const tracker = new PoseTracker();
const analyzer = new PoseAnalyzer();
const game = new Game(canvas, sfx);
game.setVideo(video);

let state = 'intro';           // intro | loading | calib | play | pause | over
let inputMode = 'keys';        // pose | motion | keys
let last = performance.now();
let countdown = 0;
let calibTime = 0;
let toastT = 0;
let best = +(localStorage.getItem('ka_best') || 0);

/* ---------------- ekrani ---------------- */
const SCREENS = ['screen-intro', 'screen-loading', 'screen-calib', 'screen-pause', 'screen-over'];
function show(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
}
function hud(on) {
  $('hud').classList.toggle('hidden', !on);
  $('cues').classList.toggle('hidden', !on);
}
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  toastT = 1.9;
}
game.onToast = toast;
game.onBiome = name => { $('biome').textContent = name; };
game.onGameOver = () => setTimeout(gameOver, 700);

function status(txt) { $('status').textContent = txt; }

/* ---------------- tastatura ---------------- */
const keys = { left: false, right: false, down: false };
let keyX = 0;
let keyJumpUntil = 0;


addEventListener('keydown', e => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === 'arrowleft' || k === 'a') { keys.left = true; }
  else if (k === 'arrowright' || k === 'd') { keys.right = true; }
  else if (k === 'arrowdown' || k === 's') { keys.down = true; }
  else if (k === ' ' || k === 'arrowup' || k === 'w') {
    keyJumpUntil = performance.now() + 480; sfx.jump();
    if (state === 'over') restart();
    e.preventDefault();
  }
  else if (k === 'm') { toast(sfx.toggle() ? 'ZVUK UKLJUČEN' : 'ZVUK ISKLJUČEN'); }
  else if (k === 'b') { game.debug = !game.debug; toast(game.debug ? 'DEBUG UKLJUČEN' : 'DEBUG ISKLJUČEN'); }
  else if (k === 'r' && inputMode === 'pose') { startCalibration(); }
  else if (k === 'escape') { toMenu(); }
});
addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  if (k === 'arrowleft' || k === 'a') keys.left = false;
  if (k === 'arrowright' || k === 'd') keys.right = false;
  if (k === 'arrowdown' || k === 's') keys.down = false;
});

/* ---------------- dugmad ---------------- */
$('btn-camera').addEventListener('click', startWithCamera);
$('btn-keys').addEventListener('click', () => { sfx.init(); sfx.resume(); inputMode = 'keys'; tracker.mode = 'keys'; startPlay(); });
$('btn-again').addEventListener('click', restart);
$('btn-calib-keys').addEventListener('click', () => { inputMode = 'keys'; tracker.mode = 'keys'; startPlay(); });
$('btn-menu').addEventListener('click', toMenu);
addEventListener('resize', () => game.resize());
addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') state = 'pause'; });

/* ---------------- tok ---------------- */
async function startWithCamera() {
  sfx.init(); sfx.resume();
  show('screen-loading');
  state = 'loading';
  $('load-title').textContent = 'UČITAVAM...';
  $('load-msg').textContent = 'Tražim dozvolu za kameru';
  try {
    await tracker.startCamera(video);
  } catch (e) {
    console.error(e);
    $('load-title').textContent = 'KAMERA NIJE DOSTUPNA';
    $('load-msg').textContent = 'Dozvoli pristup kameri u pregledaču, pa osveži stranicu. ' +
      'Možeš i da igraš tastaturom.';
    setTimeout(() => { show('screen-intro'); state = 'intro'; }, 3200);
    return;
  }
  $('load-msg').textContent = 'Pripremam prepoznavanje tela...';
  try {
    await tracker.initModel(msg => { $('load-msg').textContent = msg; });
    inputMode = 'pose';
  } catch (e) {
    console.error(e);
    inputMode = 'motion';
    tracker.mode = 'motion';
    toast('OGRANIČENI REŽIM (bez AI modela)');
  }
  if (inputMode === 'pose') startCalibration();
  else startPlay();
}

function startCalibration() {
  analyzer.reset();
  analyzer.calSamples.length = 0;
  state = 'calib';
  countdown = 0;
  calibTime = 0;
  $('btn-calib-keys').classList.add('hidden');
  show('screen-calib');
  hud(false);
  game.reset();
}

function startPlay() {
  game.reset();
  $('biome').textContent = game.biomeDef.name;
  show(null);
  hud(true);
  state = 'play';
  sfx.ready();
}

function restart() {
  if (inputMode === 'pose' && !analyzer.cal) { startCalibration(); return; }
  analyzer.handsUpT = 0;
  startPlay();
}

function toMenu() {
  state = 'intro';
  show('screen-intro');
  hud(false);
}

function gameOver() {
  state = 'over';
  hud(false);
  best = Math.max(best, Math.round(game.score));
  localStorage.setItem('ka_best', String(best));
  $('r-score').textContent = Math.round(game.score);
  $('r-dist').textContent = Math.round(game.dist) + ' m';
  $('r-best').textContent = best;
  $('handsup').classList.toggle('hidden', inputMode !== 'pose');
  analyzer.handsUpT = 0;
  show('screen-over');
}

/* ---------------- ulaz ---------------- */
function mergeKeys(input, now) {
  const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  keyX += (dir - keyX) * 0.15;
  if (Math.abs(keyX) < 0.004 && dir === 0) keyX = 0;

  if (inputMode === 'keys') input.x = Math.max(-1, Math.min(1, keyX));
  else if (keyX !== 0) input.x = Math.max(-1, Math.min(1, input.x + keyX * 0.9));

  if (now < keyJumpUntil) { input.jump = true; input.jumpRecent = true; }
  if (keys.down) { input.crouch = true; input.crouchRecent = true; }
  if (inputMode === 'keys') { input.present = true; input.lost = 0; }
  return input;
}

/* ---------------- glavna petlja ---------------- */
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;

  const lms = tracker.update(now);
  let input = analyzer.read(lms, game, now, dt, tracker.motion);
  input = mergeKeys(input, now);

  if (state === 'calib') {
    const r = analyzer.calibrate(lms);
    $('calib-fill').style.width = Math.round(r.progress * 100) + '%';
    $('calib-hint').textContent = r.msg;
    calibTime += dt;
    if (!r.ok && calibTime > 8) $('btn-calib-keys').classList.remove('hidden');
    if (r.ok) {
      if (countdown === 0) { countdown = 3.999; }
      countdown -= dt;
      const n = Math.max(1, Math.ceil(countdown - 0.999));
      const shown = $('calib-count').textContent;
      if (shown !== String(n)) { $('calib-count').textContent = n; sfx.count(n === 1); }
      if (countdown <= 1) { startPlay(); }
    } else {
      $('calib-count').textContent = '3';
      countdown = 0;
    }
    game.idleUpdate(dt);

  } else if (state === 'play') {
    if (inputMode !== 'keys' && input.lost > 1.3) {
      state = 'pause';
      show('screen-pause');
    } else {
      game.update(dt, input);
      updateHud(input);
    }

  } else if (state === 'pause') {
    if (input.present || inputMode === 'keys') { show(null); state = 'play'; }

  } else if (state === 'over') {
    if (inputMode === 'pose') {
      $('hu-fill').style.width = Math.round(input.handsUpHold * 100) + '%';
      if (input.handsUpHold >= 1) restart();
    }
    game.updateParticles(dt);

  } else {
    game.idleUpdate(dt);
  }

  game.render(input);

  // toast
  if (toastT > 0) {
    toastT -= dt;
    if (toastT <= 0) $('toast').classList.remove('show');
  }

  // statusna linija
  if ((now | 0) % 8 === 0) {
    const m = inputMode === 'pose' ? 'PRAĆENJE TELA' : (inputMode === 'motion' ? 'OGRANIČENI REŽIM' : 'TASTATURA');
    const extra = state === 'play' ? '  ·  ' + tracker.fps + ' FPS' : '';
    status(m + extra + (game.debug ? '  ·  DEBUG' : ''));
  }
}

function updateHud(input) {
  $('score').textContent = Math.round(game.score);
  $('dist').textContent = Math.round(game.dist);
  $('speedTag').textContent = (game.speed / 13).toFixed(1) + 'x';
  const m = game.mult;
  $('combo').textContent = game.combo > 2 ? ('KOMBO x' + m + '  (' + game.combo + ')') : '';
  let hearts = '';
  for (let i = 0; i < 3; i++) hearts += '<i class="' + (i < game.lives ? '' : 'off') + '">♥</i>';
  const el = $('lives');
  if (el.dataset.n !== String(game.lives)) { el.innerHTML = hearts; el.dataset.n = String(game.lives); }
  $('cue-jump').classList.toggle('on', !!input.jump);
  $('cue-crouch').classList.toggle('on', !!input.crouch);
}

// Debug pristup iz konzole: KA.game, KA.tracker, KA.analyzer
window.KA = {
  game: game, tracker: tracker, analyzer: analyzer, sfx: sfx,
  get state() { return state; },
  get inputMode() { return inputMode; }
};

status('TASTATURA');
requestAnimationFrame(frame);
