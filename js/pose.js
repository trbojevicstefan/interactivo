// Praćenje tela preko kamere: MediaPipe Pose Landmarker (glavni režim)
// + rezervni režim detekcije pokreta (kad model ne može da se učita).

export const LM = {
  NOSE: 0, L_EYE: 2, R_EYE: 5, L_EAR: 7, R_EAR: 8,
  L_SHO: 11, R_SHO: 12, L_ELB: 13, R_ELB: 14, L_WRI: 15, R_WRI: 16,
  L_HIP: 23, R_HIP: 24, L_KNEE: 25, R_KNEE: 26, L_ANK: 27, R_ANK: 28
};

// Parovi tačaka za crtanje skeleta.
export const BONES = [
  [11, 12], [11, 23], [12, 24], [23, 24],
  [11, 13], [13, 15], [12, 14], [14, 16],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [0, 11], [0, 12]
];

const MP_VER = '0.10.14';
const MP_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + MP_VER;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/' +
  'pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export class PoseTracker {
  constructor() {
    this.video = null;
    this.stream = null;
    this.landmarker = null;
    this.mode = 'none';          // 'pose' | 'motion' | 'keys' | 'none'
    this.lastTs = -1;
    this.landmarks = null;
    this.motion = null;
    this.fps = 0;
    this._fpsT = 0;
    this._fpsN = 0;
  }

  async startCamera(videoEl) {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 960 }, height: { ideal: 540 }, facingMode: 'user', frameRate: { ideal: 30 } },
      audio: false
    });
    return this.attachStream(videoEl, stream);
  }

  // Zakači bilo koji MediaStream (lokalna kamera ili video sa telefona).
  async attachStream(videoEl, stream) {
    this.video = videoEl;
    this.stream = stream;
    videoEl.srcObject = stream;
    await videoEl.play().catch(() => {});
    if (!videoEl.videoWidth) {
      await new Promise(res => {
        const done = () => { videoEl.removeEventListener('loadeddata', done); res(); };
        videoEl.addEventListener('loadeddata', done);
        setTimeout(res, 4000);
      });
    }
    this.lastTs = -1;
    return true;
  }

  stopCamera() {
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null;
  }

  async initModel(onProgress) {
    const say = onProgress || function () {};
    let vision = null;
    const urls = [MP_BASE + '/vision_bundle.mjs', MP_BASE];
    for (const u of urls) {
      try { vision = await import(u); break; }
      catch (e) { console.warn('Import nije uspeo:', u, e); }
    }
    if (!vision || !vision.PoseLandmarker) throw new Error('Ne mogu da ucitam MediaPipe biblioteku.');

    say('Skidam model za prepoznavanje tela...');
    const fileset = await vision.FilesetResolver.forVisionTasks(MP_BASE + '/wasm');

    const make = (delegate) => vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    try {
      this.landmarker = await make('GPU');
    } catch (e) {
      console.warn('GPU delegat nije uspeo, prelazim na CPU', e);
      this.landmarker = await make('CPU');
    }
    this.mode = 'pose';
    return true;
  }

  // Vraća niz landmarkova ili null.
  update(nowMs) {
    this._fpsN++;
    if (nowMs - this._fpsT > 500) {
      this.fps = Math.round(this._fpsN * 1000 / (nowMs - this._fpsT));
      this._fpsT = nowMs; this._fpsN = 0;
    }

    const v = this.video;
    if (!v || !v.videoWidth || v.readyState < 2) return this.landmarks;

    if (this.mode === 'pose' && this.landmarker) {
      if (v.currentTime === this.lastTs) return this.landmarks;
      this.lastTs = v.currentTime;
      try {
        const res = this.landmarker.detectForVideo(v, nowMs);
        this.landmarks = (res && res.landmarks && res.landmarks.length) ? res.landmarks[0] : null;
      } catch (e) {
        console.warn('detekcija:', e);
      }
      return this.landmarks;
    }

    if (this.mode === 'motion') {
      if (!this.motion) this.motion = new MotionTracker();
      this.motion.update(v);
      return null;
    }
    return null;
  }
}

/* -------------------------------------------------------------
   Rezervni režim: razlika između frejmova (bez AI modela).
   Daje grubu horizontalnu poziciju i detekciju naglog pokreta gore.
------------------------------------------------------------- */
export class MotionTracker {
  constructor() {
    this.W = 64; this.H = 48;
    this.c = document.createElement('canvas');
    this.c.width = this.W; this.c.height = this.H;
    this.ctx = this.c.getContext('2d', { willReadFrequently: true });
    this.prev = null;
    this.x = 0; this.energyTop = 0; this.energyBottom = 0; this.total = 0;
  }

  update(video) {
    this.ctx.drawImage(video, 0, 0, this.W, this.H);
    const img = this.ctx.getImageData(0, 0, this.W, this.H).data;
    const gray = new Uint8Array(this.W * this.H);
    for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
      gray[i] = (img[p] * 0.3 + img[p + 1] * 0.59 + img[p + 2] * 0.11) | 0;
    }
    if (!this.prev) { this.prev = gray; return; }

    let sum = 0, sx = 0, top = 0, bot = 0;
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const i = y * this.W + x;
        if (Math.abs(gray[i] - this.prev[i]) > 22) {
          sum++; sx += x;
          if (y < this.H * 0.42) top++;
          else if (y > this.H * 0.62) bot++;
        }
      }
    }
    this.prev = gray;
    this.total = sum / (this.W * this.H);
    if (sum > 40) {
      const cx = sx / sum / this.W;      // 0..1 u slici
      const mx = 1 - cx;                  // ogledalo
      this.x = this.x * 0.75 + (mx - 0.5) * 2 * 0.25;
    }
    this.energyTop = top / (this.W * this.H);
    this.energyBottom = bot / (this.W * this.H);
  }
}

/* -------------------------------------------------------------
   Analiza poze -> ulaz za igru.
------------------------------------------------------------- */
export class PoseAnalyzer {
  constructor() { this.reset(); }

  reset() {
    this.cal = null;
    this.sHip = null; this.sSho = null;
    this.jump = false; this.crouch = false;
    this.lastJump = -1e9; this.lastCrouch = -1e9;
    this.x = 0;
    this.box = null;
    this.handsUpT = 0;
    this.lostT = 0;
    this.calSamples = [];
  }

  // Sirove mere iz landmarkova (koordinate 0..1 u slici, x NIJE ogledalo).
  measure(lms) {
    if (!lms || lms.length < 29) return null;
    const ls = lms[LM.L_SHO], rs = lms[LM.R_SHO], lh = lms[LM.L_HIP], rh = lms[LM.R_HIP];
    const vis = p => (p.visibility === undefined ? 1 : p.visibility);
    if (Math.min(vis(ls), vis(rs), vis(lh), vis(rh)) < 0.3) return null;
    const shoY = (ls.y + rs.y) / 2, hipY = (lh.y + rh.y) / 2;
    const hipX = (lh.x + rh.x) / 2;
    const shoW = Math.max(0.04, Math.hypot(ls.x - rs.x, ls.y - rs.y));
    const torso = Math.max(0.05, Math.abs(hipY - shoY));
    return { shoY: shoY, hipY: hipY, hipX: hipX, shoW: shoW, torso: torso };
  }

  // Skuplja uzorke tokom kalibracije. Vraća { ok, progress, msg }.
  calibrate(lms) {
    const m = this.measure(lms);
    if (!m) {
      this.calSamples.length = 0;
      return { ok: false, progress: 0, msg: 'Tražim telo... stani ispred kamere' };
    }
    this.calSamples.push(m);
    const n = this.calSamples.length;
    const avg = k => this.calSamples.reduce((s, v) => s + v[k], 0) / n;
    if (n >= 45) {
      this.cal = {
        hipY: avg('hipY'), shoY: avg('shoY'), centerX: avg('hipX'),
        torso: avg('torso'), shoW: avg('shoW')
      };
      this.sHip = this.cal.hipY;
      this.sSho = this.cal.shoY;
      return { ok: true, progress: 1, msg: 'Spremno!' };
    }
    return { ok: false, progress: n / 45, msg: 'Miruj, uspravno...' };
  }

  // Okvir tela na ekranu (za izrezivanje igrača iz slike).
  updateBox(lms, view) {
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    for (const p of lms) {
      if (p.visibility !== undefined && p.visibility < 0.35) continue;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    if (minX > maxX) return this.box;
    const a = view.videoToScreen(maxX, minY);
    const b = view.videoToScreen(minX, maxY);
    const box = {
      x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y),
      x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y)
    };
    if (this.box) {
      this.box.x0 += (box.x0 - this.box.x0) * 0.35;
      this.box.y0 += (box.y0 - this.box.y0) * 0.35;
      this.box.x1 += (box.x1 - this.box.x1) * 0.35;
      this.box.y1 += (box.y1 - this.box.y1) * 0.35;
    } else {
      this.box = box;
    }
    return this.box;
  }

  // Glavni čitač. `view` mora da ima videoToScreen(nx, ny).
  read(lms, view, now, dt, motion) {
    const out = {
      present: false, x: this.x, jump: false, crouch: false,
      jumpRecent: false, crouchRecent: false, handsUp: false, handsUpHold: 0,
      hands: null, lms: null, box: null, rise: 0, drop: 0, lost: 0
    };

    const m = lms ? this.measure(lms) : null;

    if (m) {
      // Ruke, skelet i okvir tela racunamo uvek - i pre kalibracije.
      const lw0 = lms[LM.L_WRI], rw0 = lms[LM.R_WRI];
      const okv0 = q => q && (q.visibility === undefined || q.visibility > 0.4);
      out.hands = [];
      if (okv0(lw0)) out.hands.push(view.videoToScreen(lw0.x, lw0.y));
      if (okv0(rw0)) out.hands.push(view.videoToScreen(rw0.x, rw0.y));
      out.lms = lms;
      out.box = this.updateBox(lms, view);
    }

    if (m && this.cal) {
      out.present = true;
      this.lostT = 0;

      this.sHip = this.sHip === null ? m.hipY : this.sHip + (m.hipY - this.sHip) * 0.55;
      this.sSho = this.sSho === null ? m.shoY : this.sSho + (m.shoY - this.sSho) * 0.55;

      const unit = Math.max(0.06, this.cal.torso);
      const rise = (this.cal.hipY - this.sHip) / unit;   // + kada telo ide gore
      const drop = (this.sSho - this.cal.shoY) / unit;   // + kada ramena padaju
      out.rise = rise; out.drop = drop;

      // SKOK (histereza)
      if (!this.jump && rise > 0.18) { this.jump = true; out.jumpStart = true; }
      else if (this.jump && rise < 0.08) { this.jump = false; }
      // ČUČANJ (histereza) - skok ima prednost
      if (!this.crouch && drop > 0.45 && rise < 0.05) { this.crouch = true; out.crouchStart = true; }
      else if (this.crouch && drop < 0.26) { this.crouch = false; }
      if (this.jump) this.crouch = false;

      out.jump = this.jump;
      out.crouch = this.crouch;
      if (this.jump) this.lastJump = now;
      if (this.crouch) this.lastCrouch = now;

      // Horizontala: ogledalo + normalizacija širinom ramena.
      const mirroredX = 1 - m.hipX;
      const baseMX = 1 - this.cal.centerX;
      const lean = (mirroredX - baseMX) / Math.max(0.05, this.cal.shoW);
      const target = Math.max(-1, Math.min(1, lean / 1.35));
      this.x += (target - this.x) * Math.min(1, dt * 14);

      // Spora adaptacija osnove dok mirujemo (hod napred/nazad ne kvari kalibraciju).
      if (!this.jump && !this.crouch) {
        const k = Math.min(1, dt * 0.35);
        this.cal.hipY += (m.hipY - this.cal.hipY) * k;
        this.cal.shoY += (m.shoY - this.cal.shoY) * k;
        this.cal.torso += (m.torso - this.cal.torso) * k;
        this.cal.shoW += (m.shoW - this.cal.shoW) * k;
      }

      // Obe ruke iznad glave?
      const lw = lms[LM.L_WRI], rw = lms[LM.R_WRI];
      const head = lms[LM.NOSE];
      const up = !!(lw && rw && head && lw.y < head.y - 0.02 && rw.y < head.y - 0.02);
      out.handsUp = up;
      this.handsUpT = up ? this.handsUpT + dt : Math.max(0, this.handsUpT - dt * 2);
      out.handsUpHold = Math.min(1, this.handsUpT / 1.1);


    } else if (motion) {
      // Rezervni režim bez modela.
      out.present = true;   // bez modela ne znamo pouzdano - ne pauziraj
      const t = Math.max(-1, Math.min(1, motion.x * 1.6));
      this.x += (t - this.x) * Math.min(1, dt * 10);
      if (motion.energyTop > 0.055) { this.jump = true; this.lastJump = now; }
      else if (motion.energyTop < 0.03) { this.jump = false; }
      out.jump = this.jump;
    }

    if (!out.present) this.lostT += dt;
    out.lost = this.lostT;
    out.x = this.x;
    out.jumpRecent = out.jump || (now - this.lastJump) < 260;
    out.crouchRecent = out.crouch || (now - this.lastCrouch) < 260;
    return out;
  }
}
