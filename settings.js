// Configurações persistentes (localStorage) com padrões e presets gráficos.
const KEY = 'vr-atendente-settings-v1';

export const DEFAULTS = {
  quality: 'medium',        // low | medium | high
  perf: false,              // modo desempenho
  renderScale: 0.8,         // escala da resolução interna
  volume: 0.8,
  gyro: 1.0,                // sensibilidade da cabeça
  reach: 1.0,               // alcance das mãos
  smooth: 0.5,              // 0 = bruto/rápido, 1 = muito suave
  fov: 85,
  ipd: 63,                  // mm
  distortion: 0.22,         // coeficiente de barril k1 (0 desliga)
  camera: 'environment',    // câmera para o rastreio (traseira enxerga as mãos dentro do VR Box)
  mirror: false,
  preview: false,
  handScale: 1.0,           // resultado da calibração de profundidade
  handRefSize: 0.0,         // tamanho aparente de referência (0 = sem calibração)
  handOffset: [0, -0.04, 0],// deslocamento câmera->olhos (m)
  yawOffset: 0
};

export const QUALITY = {
  low:    { shadows: false, shadowSize: 512,  maxPixelRatio: 1.0, lights: 2, anisotropy: 1, npcMax: 2, physicsRadius: 3.0, textureSize: 256 },
  medium: { shadows: true,  shadowSize: 1024, maxPixelRatio: 1.25, lights: 3, anisotropy: 2, npcMax: 3, physicsRadius: 4.0, textureSize: 512 },
  high:   { shadows: true,  shadowSize: 2048, maxPixelRatio: 1.6, lights: 4, anisotropy: 4, npcMax: 4, physicsRadius: 6.0, textureSize: 1024 }
};

export const settings = { ...DEFAULTS };

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(settings, JSON.parse(raw));
  } catch (e) { /* ignora */ }
  return settings;
}
export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* ignora */ }
}
export function resetSettings() {
  Object.assign(settings, DEFAULTS);
  saveSettings();
}
export function qualityProfile() {
  const q = { ...QUALITY[settings.quality] };
  if (settings.perf) {
    q.shadows = false; q.npcMax = Math.min(q.npcMax, 2); q.lights = Math.min(q.lights, 2);
    q.maxPixelRatio = Math.min(q.maxPixelRatio, 1.0); q.physicsRadius = Math.min(q.physicsRadius, 3);
  }
  return q;
}
