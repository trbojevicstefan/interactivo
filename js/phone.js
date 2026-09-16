// Strana koja se otvara NA TELEFONU: uzima kameru i šalje je računaru (WebRTC).

const PEER_JS = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const $ = id => document.getElementById(id);

let stream = null;
let peer = null;
let call = null;
let facing = 'user';
let wakeLock = null;

function status(txt, cls) {
  const s = $('status');
  s.textContent = txt;
  s.className = cls || '';
}
function badge(txt, cls) {
  const b = $('badge');
  b.textContent = txt;
  b.className = cls || '';
}

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => res(true);
    s.onerror = () => rej(new Error('Ne mogu da učitam biblioteku (proveri internet).'));
    document.head.appendChild(s);
  });
}

// Kod iz adrese: phone.html#k3m9qp
function codeFromHash() {
  const h = (location.hash || '').replace('#', '').trim().toLowerCase();
  return /^[a-z0-9]{4,10}$/.test(h) ? h : '';
}

async function getCam() {
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: facing, width: { ideal: 960 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
    audio: false
  });
  $('preview').srcObject = stream;
  await $('preview').play().catch(() => {});
  checkOrientation();
  return stream;
}

// Uspravan telefon daje uzan video koji se u igri seče sa strana.
function checkOrientation() {
  if (!stream) return;
  const tr = stream.getVideoTracks()[0];
  if (!tr || !tr.getSettings) return;
  const st = tr.getSettings();
  const portret = st.width && st.height && st.height > st.width;
  $('rotate').classList.toggle('hidden', !portret);
}

async function keepAwake() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) { /* nije kritično */ }
}

async function connect() {
  const code = ($('code').value || '').trim().toLowerCase();
  if (!/^[a-z0-9]{4,10}$/.test(code)) {
    status('Ukucaj kod koji piše na računaru.', 'bad');
    return;
  }

  $('go').disabled = true;
  try {
    status('Tražim dozvolu za kameru...');
    await getCam();
  } catch (e) {
    console.error(e);
    status('Kamera nije dozvoljena. Dozvoli pristup pa probaj ponovo.', 'bad');
    $('go').disabled = false;
    return;
  }

  try {
    status('Pripremam vezu...');
    if (typeof window.Peer === 'undefined') await loadScript(PEER_JS);
  } catch (e) {
    status(String(e.message || e), 'bad');
    $('go').disabled = false;
    return;
  }

  if (peer) { try { peer.destroy(); } catch (e) {} }
  peer = new window.Peer({ debug: 0 });

  peer.on('open', () => {
    status('Zovem računar...');
    call = peer.call('kinnect-' + code, stream);
    if (!call) {
      status('Ne mogu da uspostavim poziv. Proveri kod.', 'bad');
      $('go').disabled = false;
      return;
    }
    let ok = false;
    const pc = call.peerConnection;
    if (pc) {
      pc.addEventListener('connectionstatechange', () => {
        if (pc.connectionState === 'connected') {
          ok = true;
          badge('POVEZANO — ŠALJEM', 'on');
          status('Radi! Nasloni telefon i stani ispred njega.', 'ok');
          keepAwake();
          $('go').textContent = 'PONOVO POVEŽI';
          $('go').disabled = false;
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          badge('VEZA PREKINUTA', 'off');
          status('Veza je pukla. Pritisni PONOVO POVEŽI.', 'bad');
          $('go').disabled = false;
        }
      });
    }
    call.on('close', () => {
      badge('NIJE POVEZANO', 'off');
      status('Računar je prekinuo vezu.', 'bad');
      $('go').disabled = false;
    });
    call.on('error', e => {
      console.warn(e);
      status('Greška u pozivu: ' + (e && e.type ? e.type : e), 'bad');
      $('go').disabled = false;
    });
    setTimeout(() => {
      if (!ok) {
        status('Ne javlja se. Proveri da je na računaru otvoren prozor sa kodom.', 'bad');
        $('go').disabled = false;
      }
    }, 15000);
  });

  peer.on('error', e => {
    console.warn('peer greška:', e && e.type, e);
    const t = e && e.type;
    if (t === 'peer-unavailable') status('Nema računara sa tim kodom. Proveri kod.', 'bad');
    else status('Veza nije uspela (' + (t || 'greška') + ').', 'bad');
    $('go').disabled = false;
  });
}

/* ---------- pokretanje ---------- */
const hashCode = codeFromHash();
if (hashCode) {
  $('code').value = hashCode;
  $('lead').textContent = 'Kod je učitan iz QR koda. Samo pritisni dugme.';
}

$('go').addEventListener('click', connect);

$('flip').addEventListener('click', async () => {
  facing = facing === 'user' ? 'environment' : 'user';
  try {
    const old = stream;
    await getCam();
    // zameni sliku i u već uspostavljenom pozivu
    if (call && call.peerConnection) {
      const track = stream.getVideoTracks()[0];
      for (const s of call.peerConnection.getSenders()) {
        if (s.track && s.track.kind === 'video') await s.replaceTrack(track);
      }
    }
    if (old) old.getTracks().forEach(t => t.stop());
    status(facing === 'user' ? 'Prednja kamera.' : 'Zadnja kamera.');
  } catch (e) {
    status('Ne mogu da promenim kameru.', 'bad');
  }
});

// vrati wake lock kad se korisnik vrati na stranu
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && wakeLock === null) keepAwake();
});

addEventListener('orientationchange', () => setTimeout(checkOrientation, 400));
addEventListener('resize', () => setTimeout(checkOrientation, 400));

if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
  status('Ovaj pregledač ne podržava kameru. Otvori stranu u Chrome-u ili Safari-ju.', 'bad');
  $('go').disabled = true;
} else if (!window.isSecureContext) {
  status('Strana mora biti otvorena preko https da bi kamera radila.', 'bad');
}
