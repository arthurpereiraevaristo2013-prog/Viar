// Texturas procedurais (canvas) — geradas em tempo de execução: carregamento rápido, zero download.
import * as THREE from 'three';
import { qualityProfile } from './settings.js';

function mk(size, draw, { repeat = null, srgb = true, aniso = 2 } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  return t;
}
function noise(g, s, amt, alpha = 1) {
  const img = g.getImageData(0, 0, s, s), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
}

export function makeTextures() {
  const q = qualityProfile(); const S = q.textureSize; const A = q.anisotropy;
  const T = {};

  T.floor = mk(S, (g, s) => {
    const n = 4, w = s / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = 205 + ((x + y) % 2 ? -14 : 0) + Math.random() * 8;
      g.fillStyle = `rgb(${v},${v - 3},${v - 10})`; g.fillRect(x * w, y * w, w, w);
    }
    g.strokeStyle = 'rgba(70,60,50,.55)'; g.lineWidth = 3;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * w, 0); g.lineTo(i * w, s); g.moveTo(0, i * w); g.lineTo(s, i * w); g.stroke(); }
    noise(g, s, 14);
  }, { repeat: [6, 5], aniso: A });

  T.wall = mk(S, (g, s) => {
    g.fillStyle = '#d9d2c4'; g.fillRect(0, 0, s, s);
    g.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < 60; i++) g.fillRect(Math.random() * s, Math.random() * s, 40, 2);
    noise(g, s, 10);
  }, { repeat: [4, 2], aniso: A });

  T.wood = mk(S, (g, s) => {
    g.fillStyle = '#8a5a34'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 90; i++) {
      g.strokeStyle = `rgba(${50 + Math.random() * 40},${25 + Math.random() * 25},10,${0.1 + Math.random() * 0.25})`;
      g.lineWidth = 1 + Math.random() * 2.5; g.beginPath();
      const y = Math.random() * s; g.moveTo(0, y);
      g.bezierCurveTo(s * 0.3, y + (Math.random() - 0.5) * 18, s * 0.6, y + (Math.random() - 0.5) * 18, s, y + (Math.random() - 0.5) * 10); g.stroke();
    }
    noise(g, s, 12);
  }, { repeat: [2, 2], aniso: A });

  T.counter = mk(S, (g, s) => {
    const gr = g.createLinearGradient(0, 0, s, s); gr.addColorStop(0, '#d8d8dc'); gr.addColorStop(1, '#bfc0c8');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? 90 : 255},${Math.random() < .5 ? 90 : 255},${Math.random() < .5 ? 100 : 255},.07)`; g.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 4, 2 + Math.random() * 4); }
    noise(g, s, 8);
  }, { repeat: [2, 1], aniso: A });

  T.metal = mk(128, (g, s) => {
    const gr = g.createLinearGradient(0, 0, s, 0); gr.addColorStop(0, '#9aa0aa'); gr.addColorStop(.5, '#d3d7de'); gr.addColorStop(1, '#8c929c');
    g.fillStyle = gr; g.fillRect(0, 0, s, s); noise(g, s, 14);
  }, { aniso: 1 });

  T.carpet = mk(S, (g, s) => {
    g.fillStyle = '#3a4a6e'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${40 + Math.random() * 40},${60 + Math.random() * 40},${100 + Math.random() * 50},.5)`; g.fillRect(Math.random() * s, Math.random() * s, 2, 2); }
  }, { repeat: [3, 3], aniso: A });

  T.glass = null; // materiais de vidro não usam textura
  return T;
}

// Rótulo de produto (caixa/lata/garrafa) — gera uma textura única por produto.
export function labelTexture(name, c1, c2, emoji = '', textColor = '#ffffff') {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, 96, 256, 64);
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 0, 256, 18); g.fillRect(0, 238, 256, 18);
  g.fillStyle = textColor; g.font = 'bold 40px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (emoji) { g.font = '64px system-ui, sans-serif'; g.fillText(emoji, 128, 60); g.font = 'bold 34px system-ui, sans-serif'; }
  g.fillText(name.toUpperCase(), 128, emoji ? 128 : 100, 236);
  g.font = '18px system-ui, sans-serif'; g.fillStyle = 'rgba(255,255,255,.8)'; g.fillText('VR MARKET', 128, 200);
  // código de barras
  g.fillStyle = '#fff'; g.fillRect(70, 212, 116, 22); g.fillStyle = '#000';
  for (let x = 74; x < 182; x += 4) g.fillRect(x, 214, 1 + (x % 3), 18);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2; return t;
}

export function signTexture(text, bg = '#1c2a5e', fg = '#ffffff', w = 512, h = 128) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
  g.fillStyle = fg; g.font = `bold ${h * 0.5}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 4, w - 40);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function faceTexture(skin, mood = 0, eye = '#2b1d12') {
  // textura de rosto (olhos, sobrancelhas, boca) — atualizada por expressão
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const draw = (m, blink = 0) => {
    const g = c.getContext('2d');
    g.fillStyle = skin; g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(255,120,120,.15)'; g.beginPath(); g.arc(30, 78, 12, 0, 6.3); g.arc(98, 78, 12, 0, 6.3); g.fill();
    for (const x of [40, 88]) {
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, 62, 10, 8 * (1 - blink) + 0.5, 0, 0, 6.3); g.fill();
      if (blink < 0.7) { g.fillStyle = eye; g.beginPath(); g.arc(x, 62, 4.6 * (1 - blink * .5), 0, 6.3); g.fill(); }
    }
    g.strokeStyle = '#3a2a1e'; g.lineWidth = 3.5; g.lineCap = 'round';
    const tilt = m < 0 ? 7 : m > 0 ? -2 : 0; // bravo: sobrancelhas inclinadas
    g.beginPath(); g.moveTo(28, 44 + tilt * (m < 0 ? 1 : 0)); g.lineTo(52, 44 - tilt * (m < 0 ? 1 : 0)); g.moveTo(76, 44 - tilt * (m < 0 ? 1 : 0)); g.lineTo(100, 44 + tilt * (m < 0 ? 1 : 0)); g.stroke();
    g.strokeStyle = '#7a2e2e'; g.lineWidth = 4; g.beginPath();
    if (m > 0.3) { g.arc(64, 90, 16, 0.15 * Math.PI, 0.85 * Math.PI); }
    else if (m < -0.3) { g.arc(64, 112, 14, 1.15 * Math.PI, 1.85 * Math.PI); }
    else { g.moveTo(50, 100); g.lineTo(78, 100); }
    g.stroke(); t.needsUpdate = true;
  };
  draw(mood);
  return { texture: t, draw };
}
