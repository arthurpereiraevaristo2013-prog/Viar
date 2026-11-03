// Rastreamento real das mãos: câmera -> MediaPipe HandLandmarker (IA) -> filtro One Euro ->
// posição 3D em metros no referencial da cabeça (câmera do celular) -> mãos virtuais.
import { PointSetFilter, smoothingParams } from './filters.js';
import { GestureTracker, BONES, handSize } from './gestures.js';
import { settings } from './settings.js';

const MP_VERSION = '0.10.18';
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MODEL_REMOTE = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const MODEL_LOCAL = 'models/hand_landmarker.task'; // opcional: coloque o arquivo aqui para funcionar offline

export const REF_DIST = 0.35;          // distância (m) considerada confortável na calibração
export const CAMERA_HFOV_DEG = 65;     // FOV horizontal típico de câmera de celular (ajustado pela calibração de profundidade)
const HOLD_TIME = 0.35;                // s mantendo a pose quando a mão some (evita "pisca")

const PALM_IDS = [0, 5, 9, 13, 17];

// ---------- matemática pura (testável sem navegador) ----------

// Converte landmarks normalizados + métricos em 21 juntas no referencial da cabeça (x dir, y cima, -z frente).
export function mapToHeadSpace(norm, world, cfg) {
  const { aspect, hfovDeg, depthK, reach, mirror, offset } = cfg;
  const tanH = Math.tan((hfovDeg * Math.PI / 180) / 2);

  // escala imagem(larguras)/metro, usando só o plano da imagem para cancelar a perspectiva de rotação
  let sumImg = 0, sumW = 0;
  for (const [a, b] of BONES) {
    sumImg += Math.hypot(norm[a].x - norm[b].x, (norm[a].y - norm[b].y) / aspect);
    sumW += Math.hypot(world[a].x - world[b].x, world[a].y - world[b].y);
  }
  const scale = sumImg / Math.max(sumW, 1e-6);          // larguras de imagem por metro
  let d = (0.5 / (tanH * Math.max(scale, 1e-6))) * depthK; // distância em metros
  d = Math.min(1.2, Math.max(0.12, d));

  // centro da palma
  let cx = 0, cy = 0, wx = 0, wy = 0, wz = 0;
  for (const i of PALM_IDS) { cx += norm[i].x; cy += norm[i].y; wx += world[i].x; wy += world[i].y; wz += world[i].z; }
  const k = 1 / PALM_IDS.length;
  cx *= k; cy *= k; wx *= k; wy *= k; wz *= k;

  const sx = mirror ? -1 : 1;
  let px = (cx - 0.5) * 2 * tanH * d * sx;
  let py = -(cy - 0.5) * 2 * tanH * d / aspect;
  let pz = -d;
  // alcance (sensibilidade) em torno do ponto de repouso
  px *= reach; py *= reach; pz = -REF_DIST + (pz + REF_DIST) * reach;
  px += offset[0]; py += offset[1]; pz += offset[2];

  const joints = new Array(21);
  for (let i = 0; i < 21; i++) {
    joints[i] = {
      x: px + (world[i].x - wx) * sx,
      y: py - (world[i].y - wy),
      z: pz - (world[i].z - wz)
    };
  }
  return { joints, depth: d, center: { x: cx, y: cy } };
}

// Atribui detecções a "slots" esquerda/direita mantendo identidade entre quadros.
export function assignSlots(dets, slots, now) {
  const out = { left: null, right: null };
  const free = [];
  const used = new Set();
  // 1) continuidade: slot recente mais próximo
  const pairs = [];
  dets.forEach((d, i) => {
    for (const side of ['left', 'right']) {
      const s = slots[side];
      if (s.lastCenter && now - s.lastSeen < 1.0) {
        pairs.push({ i, side, dist: Math.hypot(d.cx - s.lastCenter.x, d.cy - s.lastCenter.y) });
      }
    }
  });
  pairs.sort((a, b) => a.dist - b.dist);
  const usedSides = new Set();
  for (const p of pairs) {
    if (used.has(p.i) || usedSides.has(p.side) || p.dist > 0.3) continue;
    out[p.side] = dets[p.i]; used.add(p.i); usedSides.add(p.side);
  }
  dets.forEach((d, i) => { if (!used.has(i)) free.push(d); });
  // 2) novas mãos: pela posição horizontal (menor x = mão esquerda do usuário)
  free.sort((a, b) => a.cx - b.cx);
  for (const d of free) {
    const wantLeft = d.cx < 0.5;
    let side = wantLeft ? 'left' : 'right';
    if (usedSides.has(side)) side = side === 'left' ? 'right' : 'left';
    if (usedSides.has(side)) continue;
    out[side] = d; usedSides.add(side);
  }
  return out;
}

// Mão sintética (apenas modo teste de mouse): 21 juntas com curvatura dos dedos e pinça.
export function makeTemplateHand(curl = 0, pinch = false) {
  const base = {
    thumb:  [[0.03, 0.02], [0.05, 0.045], [0.07, 0.065], [0.085, 0.08]],
    index:  [[0.03, 0.09], [0.035, 0.125], [0.037, 0.148], [0.038, 0.168]],
    middle: [[0.005, 0.095], [0.006, 0.135], [0.006, 0.16], [0.006, 0.182]],
    ring:   [[-0.02, 0.09], [-0.024, 0.125], [-0.026, 0.148], [-0.027, 0.167]],
    pinky:  [[-0.042, 0.08], [-0.05, 0.108], [-0.054, 0.126], [-0.057, 0.142]]
  };
  const pts = [{ x: 0, y: 0, z: 0 }];
  const bend = (arr, c, scaleA = 1) => {
    const out = [{ x: arr[0][0], y: arr[0][1], z: 0 }];
    let ang = 0;
    const angs = [0, 1.3 * c * scaleA, 1.5 * c * scaleA, 1.0 * c * scaleA];
    for (let i = 1; i < 4; i++) {
      const dx = arr[i][0] - arr[i - 1][0], dy = arr[i][1] - arr[i - 1][1];
      ang += angs[i];
      const l = Math.hypot(dx, dy), a0 = Math.atan2(dx, dy);
      out.push({ x: out[i - 1].x + Math.sin(a0) * l, y: out[i - 1].y + Math.cos(a0) * l * Math.cos(ang), z: out[i - 1].z - Math.cos(a0) * l * Math.sin(ang) });
    }
    return out;
  };
  const th = base.thumb.map(p => ({ x: p[0], y: p[1], z: 0 }));
  const idx = bend(base.index, pinch ? 0.45 : curl);
  const mid = bend(base.middle, pinch ? 0.2 : curl);
  const rng = bend(base.ring, pinch ? 0.2 : curl);
  const pnk = bend(base.pinky, pinch ? 0.2 : curl);
  let thumb = th;
  if (pinch) {
    const t = idx[3];
    thumb = [th[0], { x: (th[1].x + t.x) / 2, y: (th[1].y + t.y) / 2, z: t.z / 2 }, { x: (th[2].x + t.x) / 2 + 0.005, y: (th[2].y + t.y) / 2, z: t.z * 0.8 }, { x: t.x + 0.003, y: t.y, z: t.z }];
  } else if (curl > 0.5) {
    thumb = [th[0], { x: th[1].x - 0.01, y: th[1].y + 0.01, z: -0.02 }, { x: 0.02, y: 0.075, z: -0.04 }, { x: 0.0, y: 0.085, z: -0.05 }];
  }
  return pts.concat(thumb, idx, mid, rng, pnk);
}

// ---------- estado de cada mão ----------

export class HandState {
  constructor(side) {
    this.side = side;
    this.visible = false;
    this.opacity = 0;
    this.gesture = new GestureTracker();
    this.targetJoints = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: -REF_DIST }));
    this.joints = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: -REF_DIST })); // exibidos (por quadro de render)
    this.rel = null;          // juntas métricas relativas (para gestos)
    this.lastSeen = -1e9;
    this.lastCenter = null;
    this.vel = { x: 0, y: 0, z: 0 };
    this.depth = REF_DIST;
    this.justAppeared = false;
    this.filterWorld = new PointSetFilter(21, smoothingParams(settings.smooth));
    this.filterAnchor = new PointSetFilter(1, smoothingParams(settings.smooth));
    this._prevAnchor = null;
    this._lastDetect = 0;
  }
}

// ---------- rastreador ----------

export class HandTracker {
  constructor(video) {
    this.video = video;
    this.hands = { left: new HandState('left'), right: new HandState('right') };
    this.landmarker = null;
    this.running = false;
    this.ready = false;
    this.error = null;
    this.stream = null;
    this.fps = 0; this.inferMs = 0;
    this._frame = 0; this._fpsT = performance.now(); this._fpsN = 0;
    this.lastDetections = [];
    this.mouse = null;
    this.onStatus = () => {};
    this.rawDepthSample = null; // última distância bruta (sem calibração) para a tela de calibração
  }

  status(msg, cls = '') { this.onStatus(msg, cls); }

  async startCamera() {
    if (this.stream) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador não permite acesso à câmera (use HTTPS ou localhost).');
    const tryOpen = async (facing) => navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: facing }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } }
    });
    this.stream = await tryOpen(settings.camera);
    this.video.srcObject = this.stream;
    await this.video.play();
    await new Promise(r => { if (this.video.videoWidth) r(); else this.video.onloadedmetadata = () => r(); });
  }

  async loadModel() {
    if (this.landmarker) return;
    this.status('Carregando modelo de mãos (IA)…');
    const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
    let modelPath = MODEL_REMOTE;
    try { const r = await fetch(MODEL_LOCAL, { method: 'HEAD' }); if (r.ok) modelPath = MODEL_LOCAL; } catch (e) { /* usa remoto */ }
    const make = (delegate) => HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: modelPath, delegate },
      runningMode: 'VIDEO', numHands: 2,
      minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5
    });
    try { this.landmarker = await make('GPU'); }
    catch (e) { console.warn('GPU delegate falhou, usando CPU', e); this.landmarker = await make('CPU'); }
  }

  async start() {
    try {
      this.error = null;
      this.status('Abrindo câmera…');
      await this.startCamera();
      await this.loadModel();
      this.ready = true; this.running = true;
      this.status('Rastreamento ativo', 'ok');
      this._schedule();
    } catch (e) {
      this.error = e; this.running = false;
      const msg = e && e.name === 'NotAllowedError' ? 'Permissão de câmera negada. Libere a câmera nas configurações do site.' : (e.message || String(e));
      this.status('Hand tracking indisponível: ' + msg, 'bad');
      throw e;
    }
  }

  stop() {
    this.running = false;
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    this.video.srcObject = null;
  }

  async restartCamera() { this.stop(); this.ready = false; await this.start(); }

  _schedule() {
    if (!this.running) return;
    const cb = () => { this._tick(); this._schedule(); };
    if (this.video.requestVideoFrameCallback) this.video.requestVideoFrameCallback(cb);
    else requestAnimationFrame(cb);
  }

  _cfg() {
    const v = this.video;
    return {
      aspect: (v.videoWidth || 640) / (v.videoHeight || 480),
      hfovDeg: CAMERA_HFOV_DEG, depthK: settings.handScale, reach: settings.reach,
      mirror: settings.mirror, offset: settings.handOffset
    };
  }

  _tick() {
    if (!this.running || !this.landmarker || this.video.readyState < 2) return;
    this._frame++;
    if (settings.perf && (this._frame % 2)) return; // modo desempenho: ~15 FPS de inferência
    const t0 = performance.now();
    let res;
    try { res = this.landmarker.detectForVideo(this.video, t0); } catch (e) { return; }
    this.inferMs = this.inferMs * 0.9 + (performance.now() - t0) * 0.1;
    this._fpsN++;
    if (t0 - this._fpsT > 1000) { this.fps = this._fpsN * 1000 / (t0 - this._fpsT); this._fpsN = 0; this._fpsT = t0; }

    const now = t0 / 1000;
    const dets = [];
    const cfg = this._cfg();
    const flip = settings.mirror;
    (res.landmarks || []).forEach((lm, i) => {
      const world = res.worldLandmarks[i];
      const norm = flip ? lm.map(p => ({ x: 1 - p.x, y: p.y, z: p.z })) : lm.map(p => ({ x: p.x, y: p.y, z: p.z }));
      let cx = 0, cy = 0; for (const id of PALM_IDS) { cx += norm[id].x; cy += norm[id].y; }
      dets.push({ norm, world, cx: cx / 5, cy: cy / 5 });
    });
    this.lastDetections = dets;
    this._ingest(dets, now, cfg);
  }

  _ingest(dets, now, cfg) {
    const assign = assignSlots(dets, this.hands, now);
    for (const side of ['left', 'right']) {
      const h = this.hands[side];
      const det = assign[side];
      if (!det) continue;
      const gap = now - h.lastSeen;
      const fresh = gap > 0.25 || !h.visible && h.opacity <= 0.01;
      h.filterWorld.setParams(...Object.values(smoothingParams(settings.smooth)));
      h.filterAnchor.setParams(...Object.values(smoothingParams(settings.smooth)));
      if (fresh) { h.filterWorld.reset(); h.filterAnchor.reset(); h._prevAnchor = null; h.justAppeared = true; }

      // suaviza detalhes dos dedos (mundo) e o ponto de ancoragem (centro + escala) separadamente
      const worldF = h.filterWorld.filter(det.world, now);
      const normF = h.filterAnchor.filter([{ x: det.cx, y: det.cy, z: 0 }], now)[0];
      const normFull = det.norm.map(p => ({ x: p.x - det.cx + normF.x, y: p.y - det.cy + normF.y, z: p.z }));
      const m = mapToHeadSpace(normFull, worldF, cfg);
      this.rawDepthSample = m.depth / Math.max(cfg.depthK, 1e-6);

      // velocidade do pulso para extrapolação de baixa latência
      const wp = m.joints[0];
      if (h._prevAnchor && now > h._prevAnchor.t) {
        const dt = now - h._prevAnchor.t;
        const a = 0.5;
        h.vel.x = a * ((wp.x - h._prevAnchor.x) / dt) + (1 - a) * h.vel.x;
        h.vel.y = a * ((wp.y - h._prevAnchor.y) / dt) + (1 - a) * h.vel.y;
        h.vel.z = a * ((wp.z - h._prevAnchor.z) / dt) + (1 - a) * h.vel.z;
      }
      h._prevAnchor = { x: wp.x, y: wp.y, z: wp.z, t: now };

      h.targetJoints = m.joints;
      h.rel = worldF;
      h.depth = m.depth;
      h.gesture.update(worldF);
      h.lastSeen = now; h._lastDetect = now;
      h.lastCenter = { x: det.cx, y: det.cy };
      h.visible = true;
    }
  }

  // Chamado a cada quadro de renderização (60 Hz): interpola e extrapola suavemente.
  update(dt) {
    const now = performance.now() / 1000;
    if (this.mouse) this._updateMouse(now);
    for (const side of ['left', 'right']) {
      const h = this.hands[side];
      const appeared = h.justAppeared;
      h.justAppeared = false;
      const gap = now - h.lastSeen;
      if (h.visible && gap > HOLD_TIME) { h.visible = false; h.lastCenter = null; h.gesture.pinching = false; h.gesture.grabbing = false; }
      const targetOpacity = h.visible ? Math.max(0, 1 - Math.max(0, gap - 0.08) / HOLD_TIME) : 0;
      h.opacity += (targetOpacity - h.opacity) * Math.min(1, dt * 12);
      if (!h.visible && h.opacity < 0.02) { h.opacity = 0; continue; }
      // extrapolação limitada (compensa o intervalo entre detecções) com amortecimento quando a detecção está atrasada
      const since = Math.min(0.06, now - h._lastDetect);
      const damp = gap > 0.12 ? Math.max(0, 1 - (gap - 0.12) / 0.2) : 1;
      const k = 1 - Math.exp(-dt * 38);
      for (let i = 0; i < 21; i++) {
        const t = h.targetJoints[i], j = h.joints[i];
        const tx = t.x + h.vel.x * since * damp, ty = t.y + h.vel.y * since * damp, tz = t.z + h.vel.z * since * damp;
        if (appeared || (h.opacity < 0.05 && h.visible)) { j.x = tx; j.y = ty; j.z = tz; }
        else { j.x += (tx - j.x) * k; j.y += (ty - j.y) * k; j.z += (tz - j.z) * k; }
      }
    }
  }

  // ---------- modo teste no desktop (NÃO é rastreamento por câmera) ----------
  enableMouse(el) {
    this.mouse = { x: 0.5, y: 0.5, depth: 0.35, down: false, fist: false, left: false, active: false };
    const m = this.mouse;
    const move = (e) => { m.x = e.clientX / innerWidth; m.y = e.clientY / innerHeight; m.active = true; m.left = e.shiftKey; };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerdown', (e) => { m.down = true; move(e); });
    window.addEventListener('pointerup', () => { m.down = false; });
    el.addEventListener('wheel', (e) => { m.depth = Math.min(0.8, Math.max(0.15, m.depth + e.deltaY * 0.0005)); }, { passive: true });
    window.addEventListener('keydown', (e) => { if (e.key === 'f') m.fist = !m.fist; });
    this.ready = true;
    this.status('Modo teste: mouse = mão, clique = pinça, roda = profundidade, F = punho, Shift = mão esquerda', 'ok');
  }

  _updateMouse(now) {
    const m = this.mouse; if (!m.active) return;
    const side = m.left ? 'left' : 'right', other = m.left ? 'right' : 'left';
    const h = this.hands[side];
    const tanH = Math.tan((70 * Math.PI / 180) / 2);
    const aspect = innerWidth / innerHeight;
    const px = (m.x - 0.5) * 2 * tanH * m.depth, py = -(m.y - 0.5) * 2 * tanH * m.depth / aspect;
    const rel = makeTemplateHand(m.fist ? 1 : 0, m.down && !m.fist);
    const sx = m.left ? -1 : 1;
    const joints = rel.map(p => ({ x: px + p.x * sx, y: py + p.y - 0.09, z: -m.depth + p.z }));
    // tilt natural: dedos apontando para cima e um pouco para frente
    h.targetJoints = joints; h.rel = rel; h.depth = m.depth;
    h.gesture.update(rel);
    if (!h.visible) { h.justAppeared = true; h.joints = joints.map(j => ({ ...j })); }
    h.visible = true; h.lastSeen = now; h._lastDetect = now; h.vel = { x: 0, y: 0, z: 0 };
    this.hands[other].lastSeen = Math.min(this.hands[other].lastSeen, now - 5);
  }

  // Desenha a prévia (imagem da câmera + esqueleto) em um canvas 2D.
  drawPreview(canvas) {
    const v = this.video;
    if (!v.videoWidth) return;
    if (canvas.width !== v.videoWidth / 2) { canvas.width = v.videoWidth / 2; canvas.height = v.videoHeight / 2; }
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.save();
    if (settings.mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    ctx.drawImage(v, 0, 0, W, H);
    ctx.restore();
    ctx.lineWidth = 2;
    for (const det of this.lastDetections) {
      ctx.strokeStyle = '#7dffb0'; ctx.fillStyle = '#ffffff';
      for (const [a, b] of BONES) {
        ctx.beginPath(); ctx.moveTo(det.norm[a].x * W, det.norm[a].y * H); ctx.lineTo(det.norm[b].x * W, det.norm[b].y * H); ctx.stroke();
      }
      for (const p of det.norm) { ctx.beginPath(); ctx.arc(p.x * W, p.y * H, 2.5, 0, 6.283); ctx.fill(); }
    }
  }
}
