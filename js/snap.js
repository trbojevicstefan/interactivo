// Pucketanje prstima kao okidač — sluša mikrofon.
//
// Sama detekcija radi u AUDIO NITI (js/snap-worklet.js), na svakom bloku od
// 128 uzoraka. Zato se kratak prasak ne može promašiti ni kad igra padne u FPS.
// Ovde je samo povezivanje, kalibracija i red okinutih pucnjeva.

export class SnapDetector {
  constructor() {
    this.ctx = null;
    this.node = null;
    this.stream = null;
    this.ready = false;
    this.level = 0;            // 0..1 za prikaz
    this.pending = 0;          // koliko pucnjeva čeka da ih igra pokupi
    this.lastSnapAt = 0;
    this.background = 0;       // izmerena pozadina
    this.calibrating = false;
    this.onCalibrated = null;
    this.sensitivity = 0.5;    // 0..1
  }

  get K() { return 9 - this.sensitivity * 5.5; }   // 3.5 (osetljivo) .. 9 (strogo)

  async start(existingStream) {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    await this.ctx.resume();

    let stream = existingStream;
    if (!stream) {
      // Obrada glasa bi ubila kratak prasak — isključujemo je.
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1
        }
      });
      this.stream = stream;
    }
    const src = this.ctx.createMediaStreamSource(stream);
    await this.attach(src);
    return true;
  }

  // Poveži na bilo koji izvor (mikrofon ili test signal).
  async attach(sourceNode) {
    if (!this.ctx) this.ctx = sourceNode.context;
    const url = new URL('snap-worklet.js', import.meta.url).href;
    await this.ctx.audioWorklet.addModule(url);
    this.node = new AudioWorkletNode(this.ctx, 'snap-processor', {
      numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1]
    });
    this.node.port.onmessage = e => {
      const m = e.data;
      if (m.type === 'snap') {
        this.pending++;
        this.lastSnapAt = performance.now();
      } else if (m.type === 'level') {
        this.level = m.nivo;
      } else if (m.type === 'calibrated') {
        this.calibrating = false;
        this.background = m.pozadina;
        // prag iznad izmerene pozadine, sa donjom granicom
        const floor = Math.max(0.004, m.pozadina * 2.5);
        this.node.port.postMessage({ type: 'tune', K: this.K, floor: floor });
        if (this.onCalibrated) this.onCalibrated(floor);
      }
    };
    sourceNode.connect(this.node);
    // izlaz mora negde da ide da bi se graf izvršavao, ali ga utišamo
    const tih = this.ctx.createGain();
    tih.gain.value = 0;
    this.node.connect(tih);
    tih.connect(this.ctx.destination);

    this.node.port.postMessage({ type: 'tune', K: this.K, floor: 0.004 });
    this.ready = true;
    return this;
  }

  calibrate(sec) {
    if (!this.node) return;
    this.calibrating = true;
    this.node.port.postMessage({ type: 'calibrate', sec: sec || 2 });
  }

  setSensitivity(v) {
    this.sensitivity = Math.max(0, Math.min(1, v));
    if (this.node) this.node.port.postMessage({ type: 'tune', K: this.K });
  }

  // Igra poziva svakog frejma: vraća koliko je pucnjeva stiglo od prošlog puta.
  take() {
    const n = this.pending;
    this.pending = 0;
    return n;
  }

  stop() {
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null;
    if (this.ctx) { try { this.ctx.close(); } catch (e) {} }
    this.ready = false;
  }
}
