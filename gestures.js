// Análise de gestos a partir dos 21 landmarks (coordenadas métricas "world" do MediaPipe).
// Índices: 0 punho, 1-4 polegar, 5-8 indicador, 9-12 médio, 13-16 anelar, 17-20 mindinho.

export const L = {
  WRIST: 0, THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4,
  INDEX_MCP: 5, INDEX_PIP: 6, INDEX_DIP: 7, INDEX_TIP: 8,
  MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
  RING_MCP: 13, RING_PIP: 14, RING_DIP: 15, RING_TIP: 16,
  PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20
};

export const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [9, 10], [10, 11], [11, 12],
  [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17]
];

const FINGERS = {
  thumb:  [1, 2, 3, 4],
  index:  [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring:   [13, 14, 15, 16],
  pinky:  [17, 18, 19, 20]
};

export function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function len(a) { return Math.hypot(a.x, a.y, a.z) || 1e-9; }

// Tamanho de referência da mão: punho -> base do dedo médio.
export function handSize(p) { return dist(p[L.WRIST], p[L.MIDDLE_MCP]); }

// Grau de extensão 0 (dobrado) .. 1 (esticado) usando o ângulo entre os segmentos do dedo.
export function fingerExtension(p, name) {
  const [a, b, c, d] = FINGERS[name];
  const v1 = sub(p[b], p[a]), v2 = sub(p[c], p[b]), v3 = sub(p[d], p[c]);
  const cos1 = dot(v1, v2) / (len(v1) * len(v2));
  const cos2 = dot(v2, v3) / (len(v2) * len(v3));
  if (name === 'thumb') {
    const cosAvg = (cos1 + cos2) / 2; // 1 = reto, ~0 ou negativo = dobrado
    return Math.max(0, Math.min(1, (cosAvg + 0.1) / 1.0));
  }
  // dedos longos: inclui a flexão da base (punho -> MCP -> PIP), que é a maior num punho fechado
  const v0 = sub(p[a], p[L.WRIST]);
  const cos0 = dot(v0, v1) / (len(v0) * len(v1));
  const cosAvg = (cos0 + cos1 + cos2) / 3;
  return Math.max(0, Math.min(1, (cosAvg - 0.1) / 0.8));
}

export function fingerStates(p) {
  const ext = {};
  for (const k of Object.keys(FINGERS)) ext[k] = fingerExtension(p, k);
  // Polegar: também considera distância da ponta até a base do mindinho (polegar recolhido sobre a palma).
  const hs = handSize(p);
  const tuck = dist(p[L.THUMB_TIP], p[L.PINKY_MCP]) / hs;
  ext.thumb = Math.min(ext.thumb, Math.max(0, Math.min(1, (tuck - 0.45) / 0.6)));
  return ext;
}

// Distância normalizada polegar-indicador (pinça). ~0.1 encostando, ~1 aberto.
export function pinchRatio(p) {
  return dist(p[L.THUMB_TIP], p[L.INDEX_TIP]) / handSize(p);
}

// Quão fechada está a mão (0 aberta .. 1 punho), média da flexão dos 4 dedos longos.
export function fistAmount(p) {
  const e = fingerStates(p);
  return 1 - (e.index + e.middle + e.ring + e.pinky) / 4;
}

// Estado com histerese para pinça e agarrar, mantido por mão.
export class GestureTracker {
  constructor() {
    this.pinching = false; this.grabbing = false;
    this.pinchOn = 0.30; this.pinchOff = 0.48;
    this.grabOn = 0.65; this.grabOff = 0.45;
    this._pc = 0; this._gc = 0; // debounce de frames
    this.ext = { thumb: 1, index: 1, middle: 1, ring: 1, pinky: 1 };
    this.pinch = 1; this.fist = 0; this.name = 'open';
    this.touchingFingers = { index: false, middle: false, ring: false, pinky: false };
  }
  update(p) {
    this.ext = fingerStates(p);
    this.pinch = pinchRatio(p);
    this.fist = fistAmount(p);

    // pinça (com 2 frames de confirmação para não disparar por ruído)
    const wantPinch = this.pinching ? this.pinch < this.pinchOff : this.pinch < this.pinchOn;
    if (wantPinch !== this.pinching) { this._pc++; if (this._pc >= 2) { this.pinching = wantPinch; this._pc = 0; } } else this._pc = 0;

    // agarrar (punho fechado), mutuamente exclusivo com pinça aberta
    const wantGrab = this.grabbing ? this.fist > this.grabOff : this.fist > this.grabOn;
    if (wantGrab !== this.grabbing) { this._gc++; if (this._gc >= 2) { this.grabbing = wantGrab; this._gc = 0; } } else this._gc = 0;

    // dedos encostando no polegar (gesto OK / contagem de toques)
    const hs = handSize(p);
    const th = p[L.THUMB_TIP];
    this.touchingFingers.index = dist(th, p[L.INDEX_TIP]) / hs < 0.32;
    this.touchingFingers.middle = dist(th, p[L.MIDDLE_TIP]) / hs < 0.34;
    this.touchingFingers.ring = dist(th, p[L.RING_TIP]) / hs < 0.34;
    this.touchingFingers.pinky = dist(th, p[L.PINKY_TIP]) / hs < 0.34;

    this.name = this.classify();
    return this;
  }
  classify() {
    const e = this.ext;
    if (this.grabbing) return 'fist';
    if (this.pinching) return 'pinch';
    const up = (x) => x > 0.6, down = (x) => x < 0.4;
    if (up(e.index) && down(e.middle) && down(e.ring) && down(e.pinky)) return 'point';
    if (up(e.index) && up(e.middle) && down(e.ring) && down(e.pinky)) return 'peace';
    if (up(e.thumb) && down(e.index) && down(e.middle) && down(e.ring) && down(e.pinky)) return 'thumbs';
    if (this.touchingFingers.middle && up(e.index) && up(e.ring)) return 'ok';
    if (up(e.index) && up(e.middle) && up(e.ring) && up(e.pinky)) return 'open';
    return 'relaxed';
  }
  get pointing() { return this.name === 'point'; }
}
