// Renderização estereoscópica (tela dividida) para VR Box, com correção de distorção de barril
// e controle de cabeça pelo giroscópio (DeviceOrientation). Fallback: arrastar com o dedo/mouse.
import * as THREE from 'three';
import { settings, qualityProfile } from './settings.js';

const DISTORT_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const DISTORT_FS = `
precision highp float;
uniform sampler2D map; uniform float k1; uniform float k2; uniform float aspect;
varying vec2 vUv;
void main(){
  vec2 c = vUv * 2.0 - 1.0;
  c.x *= aspect;
  float r2 = dot(c, c);
  // Correção de barril: o que a lente "estica" é comprimido antes (pincushion inverso).
  float f = 1.0 + k1 * r2 + k2 * r2 * r2;
  vec2 d = c / f;
  d.x /= aspect;
  vec2 uv = d * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0,0.0,0.0,1.0); return; }
  gl_FragColor = texture2D(map, uv);
}`;

const _euler = new THREE.Euler();
const _q0 = new THREE.Quaternion();
const _q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -90° em X (olhar para frente com o celular em pé)
const _zee = new THREE.Vector3(0, 0, 1);

export class VRRig {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.autoClear = true;

    this.head = new THREE.Group();            // posição da cabeça no mundo (yaw extra aplicado aqui)
    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.03, 60);
    this.head.add(this.camera);
    this.eyeL = new THREE.PerspectiveCamera(settings.fov, 1, 0.03, 60);
    this.eyeR = new THREE.PerspectiveCamera(settings.fov, 1, 0.03, 60);

    this.stereo = false;
    this.rt = null;
    this.quad = null;
    this.gyro = { enabled: false, alpha: 0, beta: 0, gamma: 0, have: false, orient: 0 };
    this.manual = { yaw: 0, pitch: 0, active: false };
    this.headQuat = new THREE.Quaternion();
    this.yawOffset = 0;
    this._lastPointer = null;
    this.size = new THREE.Vector2();

    this._initDistortion();
    this._bindInput();
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
  }

  _initDistortion() {
    const geo = new THREE.PlaneGeometry(2, 2);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: DISTORT_VS, fragmentShader: DISTORT_FS, depthTest: false, depthWrite: false,
      uniforms: { map: { value: null }, k1: { value: 0 }, k2: { value: 0 }, aspect: { value: 1 } }
    });
    this.quad = new THREE.Mesh(geo, this.mat);
    this.quad.frustumCulled = false;
    this.qScene = new THREE.Scene(); this.qScene.add(this.quad);
    this.qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  _bindInput() {
    const onOrient = (e) => {
      if (e.alpha === null && e.beta === null) return;
      this.gyro.alpha = e.alpha || 0; this.gyro.beta = e.beta || 0; this.gyro.gamma = e.gamma || 0; this.gyro.have = true;
    };
    this._onOrient = onOrient;
    addEventListener('deviceorientation', onOrient, true);
    const screenAngle = () => (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    this._screenAngle = screenAngle;

    this.canvas.addEventListener('pointerdown', (e) => { this._lastPointer = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 }; });
    addEventListener('pointermove', (e) => {
      if (!this._lastPointer || this.gyro.have || window.__handMouse) return; // arrastar só quando não há giroscópio (nem mouse-mão)
      const dx = e.clientX - this._lastPointer.x, dy = e.clientY - this._lastPointer.y;
      this._lastPointer.x = e.clientX; this._lastPointer.y = e.clientY;
      this.manual.yaw -= dx * 0.005 * settings.gyro; this.manual.pitch = Math.max(-1.4, Math.min(1.4, this.manual.pitch - dy * 0.005 * settings.gyro));
    });
    addEventListener('pointerup', () => { this._lastPointer = null; });
  }

  async requestGyroPermission() {
    // iOS exige permissão explícita; Android Chrome normalmente não.
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission();
        return r === 'granted';
      }
    } catch (e) { return false; }
    return true;
  }

  async enterVR() {
    this.stereo = true;
    try {
      const el = document.documentElement;
      if (el.requestFullscreen && !document.fullscreenElement) await el.requestFullscreen({ navigationUI: 'hide' });
      if (screen.orientation?.lock) await screen.orientation.lock('landscape').catch(() => {});
    } catch (e) { /* alguns navegadores negam; segue assim mesmo */ }
    try { if ('wakeLock' in navigator) this.wake = await navigator.wakeLock.request('screen'); } catch (e) { /* ignora */ }
    this.resize();
  }
  exitVR() {
    this.stereo = false;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    try { this.wake?.release(); } catch (e) { /* ignora */ }
    this.resize();
  }

  recenter() {
    // Define o yaw atual da cabeça como "frente".
    const e = new THREE.Euler().setFromQuaternion(this.headQuat, 'YXZ');
    this.yawOffset = -e.y;
    this.manual.yaw = 0;
  }

  resize() {
    const q = qualityProfile();
    const pr = Math.min(window.devicePixelRatio || 1, q.maxPixelRatio) * settings.renderScale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.renderer.getDrawingBufferSize(this.size);
    const W = this.size.x, H = this.size.y;
    if (this.stereo) {
      const w = Math.max(2, Math.floor(W / 2)), h = Math.max(2, H);
      if (!this.rt || this.rt.width !== w || this.rt.height !== h) {
        this.rt?.dispose();
        this.rt = new THREE.WebGLRenderTarget(w, h, { samples: 0, depthBuffer: true, colorSpace: THREE.SRGBColorSpace });
        this.rt.texture.minFilter = THREE.LinearFilter; this.rt.texture.magFilter = THREE.LinearFilter;
      }
      this.eyeL.aspect = this.eyeR.aspect = w / h;
    } else {
      this.camera.aspect = W / H;
    }
    this.camera.aspect = this.stereo ? (W / 2) / H : W / H;
    this.camera.fov = this.eyeL.fov = this.eyeR.fov = settings.fov;
    this.camera.updateProjectionMatrix(); this.eyeL.updateProjectionMatrix(); this.eyeR.updateProjectionMatrix();
  }

  updateHead() {
    const g = this.gyro;
    if (g.have && settings.gyro) {
      const a = THREE.MathUtils.degToRad(g.alpha), b = THREE.MathUtils.degToRad(g.beta), c = THREE.MathUtils.degToRad(g.gamma);
      const o = THREE.MathUtils.degToRad(this._screenAngle());
      _euler.set(b, a, -c, 'YXZ');
      const q = this.headQuat.setFromEuler(_euler);
      q.multiply(_q1);
      q.multiply(_q0.setFromAxisAngle(_zee, -o));
    } else {
      _euler.set(this.manual.pitch, this.manual.yaw, 0, 'YXZ');
      this.headQuat.setFromEuler(_euler);
    }
    // aplica o deslocamento de yaw (botão centralizar)
    const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yawOffset);
    this.camera.quaternion.copy(yawQ).multiply(this.headQuat);
    // sensibilidade: amplifica o yaw em relação à frente
    if (Math.abs(settings.gyro - 1) > 0.01 && g.have) {
      const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
      e.y *= settings.gyro; this.camera.quaternion.setFromEuler(e);
    }
    this.camera.position.set(0, 0, 0);
    this.head.updateMatrixWorld(true);
  }

  render(scene) {
    const r = this.renderer;
    this.updateHead();
    if (!this.stereo) {
      r.setRenderTarget(null);
      r.render(scene, this.camera);
      return;
    }
    const half = (settings.ipd / 1000) / 2;
    this.camera.updateMatrixWorld(true);
    for (const [eye, sign] of [[this.eyeL, -1], [this.eyeR, 1]]) {
      eye.fov = settings.fov; eye.aspect = this.camera.aspect; eye.updateProjectionMatrix();
      eye.matrixWorld.copy(this.camera.matrixWorld);
      eye.matrixWorld.multiply(new THREE.Matrix4().makeTranslation(sign * half, 0, 0));
      eye.matrixWorldInverse.copy(eye.matrixWorld).invert();
      eye.position.setFromMatrixPosition(eye.matrixWorld);
    }
    // viewport/scissor do three.js usam pixels CSS (o pixelRatio é aplicado internamente)
    const W = innerWidth, H = innerHeight;
    this.mat.uniforms.k1.value = settings.distortion;
    this.mat.uniforms.k2.value = settings.distortion * 0.35;
    this.mat.uniforms.aspect.value = (W / 2) / H;
    r.setScissorTest(true);
    for (const [eye, x] of [[this.eyeL, 0], [this.eyeR, Math.floor(W / 2)]]) {
      r.setRenderTarget(this.rt);
      r.setScissorTest(false);
      r.clear();
      r.render(scene, eye);
      r.setRenderTarget(null);
      r.setViewport(x, 0, Math.floor(W / 2), H);
      r.setScissor(x, 0, Math.floor(W / 2), H);
      this.mat.uniforms.map.value = this.rt.texture;
      r.setScissorTest(true);
      r.render(this.qScene, this.qCam);
    }
    r.setScissorTest(false);
    r.setViewport(0, 0, W, H);
  }
}
