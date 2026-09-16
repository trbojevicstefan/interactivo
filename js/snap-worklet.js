// Detekcija pucketanja u AUDIO NITI.
// Radi na svakom bloku od 128 uzoraka (~2.7 ms), pa ne zavisi od toga koliko
// brzo se igra crta — kratak prasak se ne može promašiti.
//
// Postupak:
//  1) dvostruka razlika susednih uzoraka -> jako naglašava visoke i prelaze
//     (pucketanje ima puno visokih, govor bitno manje)
//  2) brza i spora envelopa; kad brza naglo pretekne sporu -> kandidat
//  3) POTVRDA: posle 45 ms energija mora da padne ispod trećine vrha.
//     Pucketanje se ugasi za ~30 ms, a govor i muzika se nastavljaju — tako se
//     odbacuje okidanje na početak reči ili takta.

class SnapProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.prevSample = 0;
    this.prevDiff = 0;
    this.fast = 0;
    this.slow = 0;
    this.peak = 0;
    this.sinceSnap = 1e9;
    this.armed = true;

    this.cand = false;     // čeka se potvrda da je prasak kratak
    this.candT = 0;
    this.candPeak = 0;
    this.confirmSec = 0.045;
    this.decayTo = 0.35;   // koliko mora da opadne da bi se priznalo

    this.K = 6.0;          // koliko puta brza mora da pretekne sporu
    this.floor = 0.004;    // apsolutni prag (podesi se kalibracijom)
    this.refractory = 0.2; // sekundi između dva praska
    this.calUntil = 0;     // dok traje kalibracija samo merimo pozadinu
    this.calPeak = 0;

    // ~1 ms napad, ~250 ms opuštanje
    this.aFast = 1 - Math.exp(-1 / (0.001 * sampleRate));
    this.aSlow = 1 - Math.exp(-1 / (0.250 * sampleRate));

    this.reportEvery = Math.floor(sampleRate / 30);   // ~30 poruka u sekundi
    this.reportCount = 0;

    this.port.onmessage = e => {
      const m = e.data || {};
      if (m.type === 'tune') {
        if (m.K !== undefined) this.K = m.K;
        if (m.floor !== undefined) this.floor = m.floor;
      } else if (m.type === 'calibrate') {
        this.calUntil = currentTime + (m.sec || 2);
        this.calPeak = 0;
      }
    };
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;

    const dt = 1 / sampleRate;
    for (let i = 0; i < ch.length; i++) {
      const s = ch[i];
      const d1 = s - this.prevSample;      // prva razlika
      this.prevSample = s;
      const hp = d1 - this.prevDiff;       // druga razlika = jači naglasak visokih
      this.prevDiff = d1;
      const a = hp < 0 ? -hp : hp;

      this.fast += (a - this.fast) * this.aFast;
      this.slow += (a - this.slow) * this.aSlow;
      if (this.fast > this.peak) this.peak = this.fast;

      this.sinceSnap += dt;

      if (currentTime < this.calUntil) {
        if (this.fast > this.calPeak) this.calPeak = this.fast;
        continue;
      }

      const thr = Math.max(this.floor, this.slow * this.K);

      // faza potvrde: da li je prasak zaista kratak?
      if (this.cand) {
        this.candT += dt;
        if (this.fast > this.candPeak) this.candPeak = this.fast;
        if (this.candT >= this.confirmSec) {
          this.cand = false;
          if (this.fast < this.candPeak * this.decayTo) {
            this.sinceSnap = 0;
            this.port.postMessage({
              type: 'snap', t: currentTime,
              jacina: this.candPeak / Math.max(1e-9, thr)
            });
          }
        }
      }

      if (this.fast > thr) {
        if (this.armed && !this.cand && this.sinceSnap > this.refractory) {
          this.cand = true;
          this.candT = 0;
          this.candPeak = this.fast;
        }
        this.armed = false;
      } else if (this.fast < thr * 0.45) {
        this.armed = true;
      }
    }

    // kraj kalibracije
    if (this.calUntil && currentTime >= this.calUntil) {
      this.calUntil = 0;
      this.port.postMessage({ type: 'calibrated', pozadina: this.calPeak });
    }

    // povremeni izveštaj za prikaz nivoa
    this.reportCount += ch.length;
    if (this.reportCount >= this.reportEvery) {
      this.reportCount = 0;
      const thr = Math.max(this.floor, this.slow * this.K);
      this.port.postMessage({ type: 'level', nivo: Math.min(1, this.peak / Math.max(1e-9, thr)) });
      this.peak = 0;
    }
    return true;
  }
}

registerProcessor('snap-processor', SnapProcessor);
