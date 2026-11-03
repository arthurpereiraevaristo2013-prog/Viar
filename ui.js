// Menus, configurações e calibrações (HTML), ligados às configurações persistentes.
import { settings, saveSettings, resetSettings } from './settings.js';
import { REF_DIST } from './handtracking.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(app) {
    this.app = app;
    this._bindSettings();
    $('btn-start').onclick = () => app.startGame(window.__DEMO ? { mouse: true } : {});
    $('btn-desktop').onclick = () => app.startGame({ mouse: true });
    $('btn-settings').onclick = () => this.show('settings');
    $('btn-settings-back').onclick = () => { saveSettings(); this.show('menu'); app.applySettings(); };
    $('btn-reset').onclick = () => { resetSettings(); this.syncSettings(); app.applySettings(); };
    $('btn-calib-hands').onclick = () => app.calibrateHands();
    $('btn-calib-hands-back').onclick = () => app.endCalibrateHands();
    $('btn-calib-capture').onclick = () => app.captureHandCalibration();
    $('btn-calib-vr').onclick = () => app.calibrateVR();
    $('btn-vr-center').onclick = () => app.rig.recenter();
    $('btn-vr-done').onclick = () => app.endCalibrateVR();
    // sliders da calibração VR
    for (const [id, key] of [['c-ipd', 'ipd'], ['c-dist', 'distortion'], ['c-fov', 'fov']]) {
      $(id).oninput = (e) => { settings[key] = parseFloat(e.target.value); app.rig.resize(); };
    }
    this.syncSettings();
  }

  show(name) {
    for (const el of document.querySelectorAll('.screen')) el.classList.remove('active');
    if (name) $(name).classList.add('active');
    this.current = name;
  }

  setStatus(msg, cls = '') { const el = $('status'); el.textContent = msg; el.className = 'status ' + cls; }
  setLoading(msg) { $('loading-text').textContent = msg; }
  fatal(e) { this.show('fatal'); $('fatal-text').textContent = (e && (e.stack || e.message)) || String(e); }

  _bindSettings() {
    const num = (id, key, out, fmt = (v) => v, after) => {
      const el = $(id), o = $(out);
      el.oninput = () => { settings[key] = parseFloat(el.value); o.textContent = fmt(settings[key]); after?.(); };
    };
    num('s-scale', 'renderScale', 'o-scale', v => Math.round(v * 100) + '%', () => this.app.rig?.resize());
    num('s-vol', 'volume', 'o-vol', v => Math.round(v * 100) + '%', () => this.app.audio?.setVolume(settings.volume));
    num('s-gyro', 'gyro', 'o-gyro', v => v.toFixed(2) + '×');
    num('s-reach', 'reach', 'o-reach', v => v.toFixed(2) + '×');
    num('s-smooth', 'smooth', 'o-smooth', v => Math.round(v * 100) + '%');
    num('s-fov', 'fov', 'o-fov', v => v + '°', () => this.app.rig?.resize());
    num('s-ipd', 'ipd', 'o-ipd', v => v + ' mm');
    num('s-dist', 'distortion', 'o-dist', v => v.toFixed(2));
    $('s-quality').onchange = (e) => { settings.quality = e.target.value; };
    $('s-perf').onchange = (e) => { settings.perf = e.target.checked; if (e.target.checked) { settings.renderScale = Math.min(settings.renderScale, 0.6); } this.syncSettings(); };
    $('s-camera').onchange = (e) => { settings.camera = e.target.value; settings.mirror = e.target.value === 'user'; this.syncSettings(); };
    $('s-mirror').onchange = (e) => { settings.mirror = e.target.checked; };
    $('s-preview').onchange = (e) => { settings.preview = e.target.checked; };
  }

  syncSettings() {
    $('s-quality').value = settings.quality; $('s-perf').checked = settings.perf;
    const set = (id, v, out, fmt) => { $(id).value = v; $(out).textContent = fmt(v); };
    set('s-scale', settings.renderScale, 'o-scale', v => Math.round(v * 100) + '%');
    set('s-vol', settings.volume, 'o-vol', v => Math.round(v * 100) + '%');
    set('s-gyro', settings.gyro, 'o-gyro', v => v.toFixed(2) + '×');
    set('s-reach', settings.reach, 'o-reach', v => v.toFixed(2) + '×');
    set('s-smooth', settings.smooth, 'o-smooth', v => Math.round(v * 100) + '%');
    set('s-fov', settings.fov, 'o-fov', v => v + '°');
    set('s-ipd', settings.ipd, 'o-ipd', v => v + ' mm');
    set('s-dist', settings.distortion, 'o-dist', v => v.toFixed(2));
    $('s-camera').value = settings.camera; $('s-mirror').checked = settings.mirror; $('s-preview').checked = settings.preview;
    $('c-ipd').value = settings.ipd; $('c-dist').value = settings.distortion; $('c-fov').value = settings.fov;
  }
}

// Calibração de profundidade: mede por 3 s a distância estimada da mão aberta e ajusta a escala
// para que esse valor corresponda a REF_DIST (a mão fica "no alcance" certo no jogo).
export class HandCalibrator {
  constructor(tracker, info) { this.tracker = tracker; this.info = info; this.samples = []; this.until = 0; this.active = false; }
  begin() { this.samples = []; this.until = performance.now() + 3000; this.active = true; }
  update(now) {
    if (!this.active) return null;
    const h = this.tracker.hands.right.visible ? this.tracker.hands.right : this.tracker.hands.left;
    if (h.visible && this.tracker.rawDepthSample) this.samples.push(this.tracker.rawDepthSample);
    const left = Math.max(0, Math.ceil((this.until - now) / 1000));
    this.info(`Mantenha a mão aberta… ${left}s (${this.samples.length} amostras)`, '');
    if (now >= this.until) {
      this.active = false;
      if (this.samples.length < 8) { this.info('Não vi sua mão. Tente de novo com a mão aberta e bem iluminada.', 'bad'); return { ok: false }; }
      this.samples.sort((a, b) => a - b);
      const med = this.samples[Math.floor(this.samples.length / 2)];
      const scale = Math.min(2.5, Math.max(0.4, REF_DIST / med));
      settings.handScale = scale; saveSettings();
      this.info(`Calibrado! Escala de profundidade ${scale.toFixed(2)} (distância medida ${(med * 100).toFixed(0)} cm → alvo ${(REF_DIST * 100).toFixed(0)} cm).`, 'ok');
      return { ok: true, scale };
    }
    return null;
  }
}
