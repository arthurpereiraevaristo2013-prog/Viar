// Ponto de entrada: monta cena, VR, rastreamento, jogo e interface; roda o laço principal.
import * as THREE from 'three';
import { settings, loadSettings, saveSettings, qualityProfile } from './settings.js';
import { VRRig } from './vr.js';
import { HandTracker } from './handtracking.js';
import { Hand3D } from './hands3d.js';
import { AudioSys } from './audio.js';
import { makeTextures } from './textures.js';
import { Physics } from './physics.js';
import { buildWorld } from './world.js';
import { Game } from './game.js';
import { UI, HandCalibrator } from './ui.js';

const $ = (id) => document.getElementById(id);

class App {
  constructor() {
    loadSettings();
    this.bootQuality = settings.quality + (settings.perf ? '+perf' : '');
    this.ui = new UI(this);
    this.audio = new AudioSys();
    this.scene = new THREE.Scene();
    this.rig = new VRRig($('gl'));
    this.rig.head.position.set(0, 1.62, 0);
    this.scene.add(this.rig.head);
    const q = qualityProfile();
    this.textures = makeTextures();
    this.physics = new Physics();
    this.physics.bounds = { min: new THREE.Vector3(-3.9, 0, -5.9), max: new THREE.Vector3(3.9, 3.1, 2.9) };
    this.world = buildWorld(this.scene, this.physics, this.textures, q, settings.quality);
    this.tracker = new HandTracker($('cam'));
    this.tracker.onStatus = (m, c) => this.ui.setStatus(m, c);
    this.hands3d = { left: new Hand3D('left', this.rig.camera), right: new Hand3D('right', this.rig.camera) };
    this.game = new Game({ scene: this.scene, physics: this.physics, world: this.world, rig: this.rig, audio: this.audio, hands3d: this.hands3d, tracker: this.tracker });
    this.calibrator = new HandCalibrator(this.tracker, (m, c) => { const el = $('calib-info'); el.textContent = m; el.className = 'status ' + c; });
    this.mode = 'menu';       // menu | game | calib-vr
    this.last = performance.now(); this.fpsAcc = 0; this.fpsN = 0; this.slowT = 0; this.fastT = 0; this.frame = 0;
    this._bindInput();
    this.applySettings();
    this.ui.setStatus('Pronto. Toque em "Iniciar jogo" (a câmera será usada para rastrear suas mãos).');
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    $('loading').classList.remove('active');
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  applySettings() {
    if (this.bootQuality !== settings.quality + (settings.perf ? '+perf' : '')) {
      this.ui.setStatus('Qualidade alterada: recarregando para aplicar…'); saveSettings(); setTimeout(() => location.reload(), 400); return;
    }
    this.rig.resize(); this.audio.setVolume(settings.volume);
    $('overlay').style.display = settings.preview ? 'block' : 'none';
    $('fps').style.display = 'none';
    saveSettings();
  }

  _bindInput() {
    let down = null;
    const c = $('gl');
    c.addEventListener('pointerdown', () => { down = performance.now(); });
    addEventListener('pointerup', () => {
      if (down === null) return; const dt = performance.now() - down; down = null;
      if (this.mode !== 'game') return;
      if (dt > 1500) this.exitToMenu();
      else if (dt < 400 && !window.__handMouse) { this.rig.recenter(); this.game.toast('Visão centralizada', 1.5); }
    });
    addEventListener('keydown', (e) => {
      if (e.key === 'c') this.rig.recenter();
      if (e.key === 'Escape' && this.mode === 'game') this.exitToMenu();
      if (e.key === 'F3') { const f = $('fps'); f.style.display = f.style.display === 'block' ? 'none' : 'block'; }
      if (window.__handMouse) {
        const s = 0.06;
        if (e.key === 'ArrowLeft') this.rig.manual.yaw += s; if (e.key === 'ArrowRight') this.rig.manual.yaw -= s;
        if (e.key === 'ArrowUp') this.rig.manual.pitch = Math.min(1.4, this.rig.manual.pitch + s); if (e.key === 'ArrowDown') this.rig.manual.pitch = Math.max(-1.4, this.rig.manual.pitch - s);
      }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'game') this.game.interaction.releaseAll(); });
    // toque triplo no menu mostra FPS
    $('fps').addEventListener('click', () => {});
  }

  // ---------- fluxos ----------
  async startGame({ mouse = false } = {}) {
    try {
      this.ui.show('loading'); this.ui.setLoading('Preparando áudio e sensores…');
      this.audio.init();
      await this.rig.requestGyroPermission();
      if (mouse) {
        window.__handMouse = true; this.tracker.enableMouse($('gl'));
      } else {
        this.ui.setLoading('Abrindo a câmera e carregando a IA de mãos…');
        try { await this.tracker.start(); }
        catch (e) {
          console.warn(e);
          this.ui.show('menu');
          this.ui.setStatus('Não foi possível iniciar o rastreamento das mãos: ' + (e.message || e) + ' — verifique permissão da câmera, conexão (CDN) e HTTPS. Você pode usar "Modo teste (mouse)".', 'bad');
          return;
        }
      }
      this.ui.show(null);
      if (!window.__DEMO) await this.rig.enterVR();
      this.rig.recenter();
      this.mode = 'game';
      this.game.start();
    } catch (e) { this.ui.fatal(e); }
  }

  exitToMenu() {
    this.game.interaction.releaseAll();
    this.rig.exitVR(); this.mode = 'menu'; this.ui.show('menu');
  }

  async calibrateHands() {
    this.ui.show('calib-hands'); $('calib-info').textContent = 'Abrindo câmera…'; $('calib-info').className = 'status';
    try { this.audio.init(); await this.tracker.start(); this.mode = 'calib-hands'; $('calib-info').textContent = 'Câmera ativa. Mostre uma mão aberta e toque em Capturar.'; }
    catch (e) { $('calib-info').textContent = 'Erro: ' + (e.message || e); $('calib-info').className = 'status bad'; }
  }
  captureHandCalibration() { this.calibrator.begin(); }
  endCalibrateHands() { this.mode = 'menu'; this.tracker.stop(); this.tracker.ready = false; this.ui.show('menu'); }

  async calibrateVR() {
    this.audio.init(); await this.rig.requestGyroPermission();
    this.ui.show('calib-vr'); this.ui.syncSettings();
    await this.rig.enterVR(); this.rig.recenter(); this.mode = 'calib-vr';
  }
  endCalibrateVR() { saveSettings(); this.rig.exitVR(); this.mode = 'menu'; this.ui.show('menu'); }

  // ---------- laço ----------
  loop(now) {
    requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000; this.last = now; dt = Math.min(dt, 0.1);
    this.frame++;

    if (this.mode === 'calib-hands') {
      this.tracker.drawPreview($('calib-canvas'));
      this.calibrator.update(performance.now());
    }
    if (this.mode === 'game' || this.mode === 'calib-vr' || this.mode === 'menu') {
      this.rig.updateHead();
      if (this.mode === 'game') {
        this.tracker.update(dt);
        this.game.update(dt, this.tracker.hands);
        for (const s of ['left', 'right']) this.hands3d[s].update(this.tracker.hands[s]);
        if (settings.preview && this.frame % 3 === 0) this.tracker.drawPreview($('overlay'));
      } else {
        // menu / calibração: mundo parado com animação leve
        this.world.update(dt, 0);
        for (const s of ['left', 'right']) this.hands3d[s].group.visible = false;
      }
      this.rig.render(this.scene);
    }
    this.adaptiveResolution(dt);
    if ($('fps').style.display === 'block' && this.frame % 20 === 0) {
      $('fps').textContent = `${(this.fpsAcc / Math.max(1, this.fpsN)).toFixed(0)} fps | mãos ${this.tracker.fps.toFixed(0)} Hz ${this.tracker.inferMs.toFixed(0)} ms | res ${(settings.renderScale * 100) | 0}%`;
    }
  }

  // Resolução dinâmica: reduz se o FPS cair, recupera devagar se sobrar folga (apenas no jogo).
  adaptiveResolution(dt) {
    if (this.mode !== 'game') { this.fpsAcc = 0; this.fpsN = 0; return; }
    this.fpsAcc += 1 / Math.max(dt, 1e-3); this.fpsN++;
    const fps = 1 / Math.max(dt, 1e-3);
    if (fps < 38) { this.slowT += dt; this.fastT = 0; } else if (fps > 56) { this.fastT += dt; this.slowT = 0; } else { this.slowT = 0; this.fastT = 0; }
    if (this.slowT > 2 && settings.renderScale > 0.5) { settings.renderScale = Math.max(0.5, settings.renderScale - 0.05); this.rig.resize(); this.slowT = 0; }
    if (this.fastT > 8 && settings.renderScale < 0.9 && !settings.perf) { settings.renderScale = Math.min(0.9, settings.renderScale + 0.05); this.rig.resize(); this.fastT = 0; }
    if (this.frame % 120 === 0) { this.fpsAcc = 0; this.fpsN = 0; }
  }
}

window.addEventListener('error', (e) => { const f = $('fatal'); if (f && !window.__app) { f.classList.add('active'); $('fatal-text').textContent = String(e.error?.stack || e.message); } });
try { window.__app = new App(); } catch (e) { console.error(e); $('fatal').classList.add('active'); $('fatal-text').textContent = String(e.stack || e); }
