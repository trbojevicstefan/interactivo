// Kamera sa telefona: telefon šalje video direktno u pregledač na računaru (WebRTC).
// Na istoj mreži veza ide direktno između uređaja; javni PeerJS broker se koristi
// samo za početno rukovanje (razmenu adresa), video ne prolazi kroz njega.

const PEER_JS = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const QR_JS = 'https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js';

let peer = null;
let overlay = null;
let onNewStream = null;

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => res(true);
    s.onerror = () => rej(new Error('Ne mogu da učitam ' + src));
    document.head.appendChild(s);
  });
}

function randomCode() {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789';   // bez slova/brojeva koji se mešaju
  let s = '';
  for (let i = 0; i < 6; i++) s += abc[(Math.random() * abc.length) | 0];
  return s;
}

function phoneUrl(code) {
  return new URL('phone.html#' + code, location.href).href;
}

function buildOverlay() {
  const el = document.createElement('div');
  el.id = 'phone-overlay';
  el.innerHTML = [
    '<div class="pc-panel">',
    '  <h2>KAMERA SA TELEFONA</h2>',
    '  <p class="pc-tag">Telefon i računar ne moraju biti na istoj mreži, ali ako jesu — veza je brža.</p>',
    '  <div class="pc-body">',
    '    <div class="pc-qr"><canvas id="pc-qr-canvas"></canvas></div>',
    '    <div class="pc-steps">',
    '      <div class="pc-step"><b>1</b><span>Skeniraj kod telefonom<br><small id="pc-url"></small></span></div>',
    '      <div class="pc-step"><b>2</b><span>Ili otvori <b>phone.html</b> na telefonu i ukucaj kod:<br><span class="pc-code" id="pc-code">------</span></span></div>',
    '      <div class="pc-step"><b>3</b><span>Nasloni telefon tako da te vidi celog i pritisni <b>POŠALJI</b></span></div>',
    '    </div>',
    '  </div>',
    '  <div class="pc-status" id="pc-status">Čekam telefon...</div>',
    '  <button class="btn ghost" id="pc-cancel">Otkaži</button>',
    '</div>'
  ].join('');
  document.body.appendChild(el);
  return el;
}

function setStatus(txt, cls) {
  const s = document.getElementById('pc-status');
  if (s) { s.textContent = txt; s.className = 'pc-status ' + (cls || ''); }
}

/**
 * Otvara panel sa QR kodom i čeka da se telefon poveže.
 * Vraća MediaStream sa telefona.
 * onReplace(stream) se poziva ako se telefon kasnije ponovo poveže.
 */
export async function requestPhoneCam(onReplace) {
  onNewStream = onReplace || null;
  if (!overlay) overlay = buildOverlay();
  overlay.classList.add('show');
  setStatus('Pripremam vezu...');

  const cancelBtn = document.getElementById('pc-cancel');

  try {
    if (typeof window.Peer === 'undefined') await loadScript(PEER_JS);
  } catch (e) {
    setStatus('Nema interneta za uspostavljanje veze.', 'bad');
    throw e;
  }

  const code = randomCode();
  const url = phoneUrl(code);
  document.getElementById('pc-code').textContent = code;
  const urlEl = document.getElementById('pc-url');
  urlEl.textContent = url.replace(/^https?:\/\//, '').replace('#' + code, '');

  // QR kod (ako biblioteka ne može da se učita, ostaje kod za kucanje)
  try {
    if (typeof window.QRious === 'undefined') await loadScript(QR_JS);
    /* global QRious */
    new QRious({
      element: document.getElementById('pc-qr-canvas'),
      value: url, size: 260, level: 'M',
      background: '#ffffff', foreground: '#0b1018'
    });
  } catch (e) {
    console.warn('QR nije dostupan:', e);
    document.querySelector('.pc-qr').innerHTML = '<div class="pc-noqr">Ukucaj kod na telefonu</div>';
  }

  if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }

  return await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (stream) => {
      if (settled) { if (onNewStream) onNewStream(stream); return; }
      settled = true;
      setStatus('Telefon povezan!', 'ok');
      setTimeout(() => overlay.classList.remove('show'), 700);
      resolve(stream);
    };
    const fail = (msg, err) => {
      if (settled) return;
      settled = true;
      setStatus(msg, 'bad');
      setTimeout(() => overlay.classList.remove('show'), 2600);
      reject(err || new Error(msg));
    };

    cancelBtn.onclick = () => {
      if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }
      overlay.classList.remove('show');
      fail('Otkazano');
    };

    peer = new window.Peer('kinnect-' + code, { debug: 0 });

    peer.on('open', () => setStatus('Čekam telefon... kod: ' + code.toUpperCase()));

    peer.on('call', call => {
      setStatus('Telefon zove, povezujem...');
      call.answer();                       // primamo, ne šaljemo ništa nazad
      call.on('stream', s => finish(s));
      call.on('error', e => console.warn('greška poziva:', e));
    });

    peer.on('error', e => {
      console.warn('peer greška:', e && e.type, e);
      if (e && e.type === 'unavailable-id') { fail('Kod je zauzet, probaj ponovo.', e); return; }
      if (!settled) fail('Veza nije uspela (' + (e && e.type ? e.type : 'greška') + ')', e);
    });

    setTimeout(() => { if (!settled) setStatus('I dalje čekam telefon... kod: ' + code.toUpperCase()); }, 15000);
  });
}

export function phoneCamActive() { return !!peer && !peer.destroyed; }

export function closePhoneCam() {
  if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }
  if (overlay) overlay.classList.remove('show');
}
