// Praćenje ŠAKE (21 tačka) — MediaPipe Hand Landmarker.
// Koristi se za ciljanje kažiprstom u igri sa patkama.

const MP_VER = '0.10.14';
const MP_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + MP_VER;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/' +
  'hand_landmarker/float16/1/hand_landmarker.task';

// Tačke šake koje nas zanimaju
export const H = {
  ZGLOB: 0,
  PALAC_KORen: 2, PALAC: 4,
  KAZI_KOREN: 5, KAZI_SREDINA: 6, KAZI_ZGLOB: 7, KAZI_VRH: 8,
  SREDNJI_KOREN: 9, SREDNJI_VRH: 12,
  DOMALI_VRH: 16,
  MALI_KOREN: 17, MALI_VRH: 20
};

// Kosti za crtanje šake
export const H_BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17]
];

export class HandTracker {
  constructor() {
    this.video = null;
    this.stream = null;
    this.landmarker = null;
    this.hands = [];
    this.lastTs = -1;
    this.fps = 0;
    this._fpsT = 0;
    this._fpsN = 0;
    this.stalled = false;
    this._moveT = 0;
    this._lastSeen = -1;
  }

  async startCamera(videoEl, withAudio) {
    const constraints = {
      video: { width: { ideal: 960 }, height: { ideal: 540 }, facingMode: 'user', frameRate: { ideal: 30 } },
      audio: withAudio ? {
        echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1
      } : false
    };
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    return this.attachStream(videoEl, this.stream);
  }

  async attachStream(videoEl, stream) {
    this.video = videoEl;
    this.stream = stream;
    // video element sme da dobije samo sliku
    const vOnly = new MediaStream(stream.getVideoTracks());
    videoEl.srcObject = vOnly;
    await videoEl.play().catch(() => {});
    if (!videoEl.videoWidth) {
      await new Promise(res => {
        const done = () => { videoEl.removeEventListener('loadeddata', done); res(); };
        videoEl.addEventListener('loadeddata', done);
        setTimeout(res, 4000);
      });
    }
    this.lastTs = -1;
    this._moveT = 0;
    this._lastSeen = -1;
    this.stalled = false;
    return true;
  }

  async initModel(onProgress) {
    const say = onProgress || function () {};
    let vision = null;
    for (const u of [MP_BASE + '/vision_bundle.mjs', MP_BASE]) {
      try { vision = await import(u); break; }
      catch (e) { console.warn('Import nije uspeo:', u, e); }
    }
    if (!vision || !vision.HandLandmarker) throw new Error('Ne mogu da ucitam MediaPipe biblioteku.');

    say('Skidam model za prepoznavanje šake...');
    const fileset = await vision.FilesetResolver.forVisionTasks(MP_BASE + '/wasm');
    const make = (delegate) => vision.HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: delegate },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.4,
      minHandPresenceConfidence: 0.4,
      minTrackingConfidence: 0.4
    });
    try { this.landmarker = await make('GPU'); }
    catch (e) {
      console.warn('GPU delegat nije uspeo, prelazim na CPU', e);
      this.landmarker = await make('CPU');
    }
    return true;
  }

  update(nowMs) {
    this._fpsN++;
    if (nowMs - this._fpsT > 500) {
      this.fps = Math.round(this._fpsN * 1000 / (nowMs - this._fpsT));
      this._fpsT = nowMs; this._fpsN = 0;
    }
    const v = this.video;
    if (!v || !v.videoWidth || v.readyState < 2) return this.hands;

    if (v.currentTime !== this._lastSeen) { this._lastSeen = v.currentTime; this._moveT = nowMs; }
    if (!this._moveT) this._moveT = nowMs;
    this.stalled = (nowMs - this._moveT) > 2500;

    if (!this.landmarker) return this.hands;
    if (v.currentTime === this.lastTs) return this.hands;
    this.lastTs = v.currentTime;
    try {
      const res = this.landmarker.detectForVideo(v, nowMs);
      this.hands = (res && res.landmarks) ? res.landmarks : [];
    } catch (e) { console.warn('detekcija šake:', e); }
    return this.hands;
  }

  stopCamera() {
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null;
  }
}

/**
 * Iz šake izvuci gde kažiprst POKAZUJE.
 * Vraća normalizovane koordinate (0..1 u slici) + koliko je prst ispružen.
 */
export function aimFromHand(lm, extend) {
  if (!lm || lm.length < 21) return null;
  const koren = lm[H.KAZI_KOREN];
  const vrh = lm[H.KAZI_VRH];
  const zglob = lm[H.ZGLOB];
  if (!koren || !vrh) return null;

  const dx = vrh.x - koren.x, dy = vrh.y - koren.y;
  const k = extend === undefined ? 0.8 : extend;

  // koliko je kažiprst ispružen u odnosu na dlan (za prikaz i filtriranje)
  const dlan = Math.hypot(lm[H.SREDNJI_KOREN].x - zglob.x, lm[H.SREDNJI_KOREN].y - zglob.y) || 0.001;
  const duz = Math.hypot(dx, dy);
  const ispruzen = Math.min(1.5, duz / dlan);

  return {
    x: vrh.x + dx * k,
    y: vrh.y + dy * k,
    vrh: { x: vrh.x, y: vrh.y },
    ispruzen: ispruzen
  };
}
