// Áudio 100% sintetizado em tempo real com WebAudio (sem arquivos), com espacialização 3D (HRTF/panner).
import { settings } from './settings.js';

export class AudioSys {
  constructor() { this.ctx = null; this.master = null; this.ambient = null; this.noiseBuf = null; this.music = null; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = settings.volume;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 1.0;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._startAmbient();
  }

  setVolume(v) { if (this.master) this.master.gain.value = v; }

  setListener(pos, fwd, up) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    if (l.positionX) {
      l.positionX.value = pos.x; l.positionY.value = pos.y; l.positionZ.value = pos.z;
      l.forwardX.value = fwd.x; l.forwardY.value = fwd.y; l.forwardZ.value = fwd.z;
      l.upX.value = up.x; l.upY.value = up.y; l.upZ.value = up.z;
    } else if (l.setPosition) { l.setPosition(pos.x, pos.y, pos.z); l.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z); }
  }

  _out(pos) {
    if (!pos || !this.ctx.createPanner) return this.master;
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 1; p.rolloffFactor = 1.2; p.maxDistance = 30;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
    p.connect(this.master);
    return p;
  }

  _env(g, t, a, d, peak) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }

  tone(freq, dur, { type = 'sine', vol = 0.2, pos = null, slide = 0, attack = 0.005 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    this._env(g, t, attack, dur, vol);
    o.connect(g); g.connect(this._out(pos));
    o.start(t); o.stop(t + dur + attack + 0.05);
  }

  noise(dur, { vol = 0.2, freq = 1500, q = 1, type = 'bandpass', pos = null, attack = 0.003 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); this._env(g, t, attack, dur, vol);
    s.connect(f); f.connect(g); g.connect(this._out(pos));
    s.start(t, Math.random() * 0.5); s.stop(t + dur + attack + 0.05);
  }

  // ---- efeitos do jogo ----
  step(pos) { this.noise(0.09, { vol: 0.12, freq: 220 + Math.random() * 80, q: 0.8, type: 'lowpass', pos }); }
  grab(pos) { this.tone(260, 0.07, { type: 'triangle', vol: 0.12, pos, slide: 1.4 }); this.noise(0.05, { vol: 0.05, freq: 3000, pos }); }
  release(pos) { this.tone(220, 0.07, { type: 'triangle', vol: 0.1, pos, slide: 0.7 }); }
  thud(pos, power = 1) { const v = Math.min(0.4, 0.08 + power * 0.08); this.noise(0.12, { vol: v, freq: 180, q: 0.7, type: 'lowpass', pos }); this.tone(110 + Math.random() * 30, 0.1, { vol: v * 0.8, type: 'sine', slide: 0.6, pos }); }
  click(pos) { this.tone(1800, 0.03, { type: 'square', vol: 0.06, pos }); }
  beep(pos) { this.tone(1320, 0.1, { type: 'square', vol: 0.07, pos }); }
  scan(pos) { this.tone(2400, 0.08, { type: 'square', vol: 0.08, pos }); }
  drawer(pos, open) { this.noise(0.25, { vol: 0.12, freq: open ? 700 : 500, q: 0.6, pos }); if (open) this.tone(1200, 0.2, { type: 'sine', vol: 0.05, pos, slide: 1.3 }); }
  cash(pos) { this.tone(2200, 0.35, { type: 'sine', vol: 0.12, pos }); this.tone(3300, 0.5, { type: 'sine', vol: 0.07, pos }); this.noise(0.1, { vol: 0.08, freq: 6000, pos }); }
  coin(pos) { this.tone(2900 + Math.random() * 400, 0.18, { type: 'sine', vol: 0.09, pos }); }
  door(pos) { this.tone(880, 0.14, { type: 'sine', vol: 0.12, pos }); this.tone(1175, 0.3, { type: 'sine', vol: 0.12, pos, attack: 0.1 }); }
  success() { [523, 659, 784].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, { type: 'triangle', vol: 0.12 }), i * 90)); }
  fail() { this.tone(200, 0.3, { type: 'sawtooth', vol: 0.08, slide: 0.6 }); }
  // voz do NPC: "balbucio" sintético (sílabas de formantes) — não é fala real
  voice(pos, pitch = 1, mood = 0) {
    if (!this.ctx) return;
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        const f = (140 + Math.random() * 60) * pitch * (mood > 0 ? 1.15 : mood < 0 ? 0.9 : 1);
        const t = this.ctx.currentTime;
        const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * (1 + mood * 0.15), t + 0.12);
        const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 6; bp.frequency.value = 500 + Math.random() * 900;
        const g = this.ctx.createGain(); this._env(g, t, 0.015, 0.11, 0.11);
        o.connect(bp); bp.connect(g); g.connect(this._out(pos));
        o.start(t); o.stop(t + 0.2);
      }, i * 130);
    }
  }

  _startAmbient() {
    // ar-condicionado/zumbido da loja + música suave em loop
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
    const g = ctx.createGain(); g.gain.value = 0.035;
    s.connect(f); f.connect(g); g.connect(this.master); s.start();
    const hum = ctx.createOscillator(); hum.type = 'sine'; hum.frequency.value = 60;
    const hg = ctx.createGain(); hg.gain.value = 0.012; hum.connect(hg); hg.connect(this.master); hum.start();
    // música: arpejo lento
    const notes = [261.6, 329.6, 392, 329.6, 293.7, 349.2, 440, 349.2];
    let i = 0;
    this._musicTimer = setInterval(() => {
      if (ctx.state !== 'running') return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = notes[i % notes.length] / 2;
      const gg = ctx.createGain(); this._env(gg, t, 0.05, 1.6, 0.025);
      o.connect(gg); gg.connect(this.master); o.start(t); o.stop(t + 1.8); i++;
    }, 900);
  }
}
