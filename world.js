// Construção do estabelecimento 3D: sala, balcão, prateleiras, caixa registradora, gaveta, computador, porta, janelas e decoração.
// Todo o conteúdo é gerado por código (geometria + texturas procedurais), sem arquivos externos.
import * as THREE from 'three';
import { labelTexture, signTexture } from './textures.js';
import { Body } from './physics.js';

export const PRODUCTS = {
  milk:   { name: 'Leite',    price: 5, c1: '#2c7be5', c2: '#1b4fa0', emoji: '🥛', shape: 'box',  size: [0.07, 0.19, 0.07], mass: 0.5 },
  bread:  { name: 'Pão',      price: 3, c1: '#d99a4e', c2: '#9a5f26', emoji: '🍞', shape: 'box',  size: [0.2, 0.09, 0.1],  mass: 0.3 },
  juice:  { name: 'Suco',     price: 6, c1: '#ff8a1f', c2: '#c4520a', emoji: '🍊', shape: 'cyl',  size: [0.04, 0.22, 0.04], mass: 0.5 },
  soda:   { name: 'Refri',    price: 4, c1: '#d92b3a', c2: '#8e1220', emoji: '🥤', shape: 'cyl',  size: [0.033, 0.12, 0.033], mass: 0.35 },
  cereal: { name: 'Cereal',   price: 8, c1: '#ffd23f', c2: '#e0901a', emoji: '🥣', shape: 'box',  size: [0.1, 0.26, 0.04], mass: 0.4 },
  apple:  { name: 'Maçã',     price: 2, c1: '#c62828', c2: '#7f1010', emoji: '🍎', shape: 'ball', size: [0.04, 0.04, 0.04], mass: 0.2 },
  choco:  { name: 'Chocolate',price: 3, c1: '#5a3320', c2: '#2d170c', emoji: '🍫', shape: 'box',  size: [0.1, 0.01, 0.05], mass: 0.15 },
  water:  { name: 'Água',     price: 2, c1: '#7fd6ff', c2: '#2c9ad6', emoji: '💧', shape: 'cyl',  size: [0.035, 0.2, 0.035], mass: 0.45 }
};
export const PRODUCT_KEYS = Object.keys(PRODUCTS);

const BILLS = {
  1:  { c: '#c9a227', t: 'R$1' }, 2: { c: '#6aa5d8', t: 'R$2' }, 5: { c: '#9b6bd6', t: 'R$5' },
  10: { c: '#e0603b', t: 'R$10' }, 20: { c: '#e8b830', t: 'R$20' }, 50: { c: '#d9803a', t: 'R$50' }
};

const _tex = {};
export function productMesh(key, quality) {
  const d = PRODUCTS[key];
  if (!_tex[key]) _tex[key] = labelTexture(d.name, d.c1, d.c2, d.emoji);
  const map = _tex[key];
  const mat = new THREE.MeshStandardMaterial({ map, roughness: key === 'apple' ? 0.45 : 0.55, metalness: key === 'soda' ? 0.4 : 0.0 });
  let geo; const [sx, sy, sz] = d.size;
  if (d.shape === 'box') geo = new THREE.BoxGeometry(sx * 2, sy * 2, sz * 2);
  else if (d.shape === 'cyl') geo = new THREE.CylinderGeometry(sx, sx, sy * 2, quality === 'low' ? 10 : 16);
  else geo = new THREE.SphereGeometry(sx, 14, 12);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true; m.receiveShadow = false;
  if (d.shape === 'cyl' && key === 'juice') { // tampa
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(sx * 0.55, sx * 0.55, 0.03, 10), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 }));
    cap.position.y = sy + 0.015; m.add(cap);
  }
  if (d.shape === 'cyl' && key === 'water') {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(sx * 0.4, sx * 0.4, 0.025, 10), new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.4 }));
    cap.position.y = sy + 0.012; m.add(cap);
  }
  if (key === 'apple') { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.025, 5), new THREE.MeshStandardMaterial({ color: 0x4a2f14 })); st.position.y = 0.042; m.add(st); }
  m.userData.productKey = key;
  return { mesh: m, half: new THREE.Vector3(sx, sy, sz) };
}

const _billTex = {};
export function moneyMesh(value) {
  const b = BILLS[value];
  if (!_billTex[value]) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
    g.fillStyle = b.c; g.fillRect(0, 0, 256, 128);
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 6; g.strokeRect(8, 8, 240, 112);
    g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(196, 64, 34, 0, 6.3); g.fill();
    g.fillStyle = '#10151f'; g.font = 'bold 54px system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(b.t, 22, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; _billTex[value] = t;
  }
  const isCoin = value === 1;
  let m;
  if (isCoin) {
    m = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.004, 16), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.3 }));
  } else {
    m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.003, 0.065), new THREE.MeshStandardMaterial({ map: _billTex[value], roughness: 0.8 }));
  }
  m.castShadow = false;
  m.userData.money = value;
  return { mesh: m, half: isCoin ? new THREE.Vector3(0.014, 0.003, 0.014) : new THREE.Vector3(0.07, 0.003, 0.033) };
}

function box(w, h, d, mat, x, y, z, parent, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m;
}

export function buildWorld(scene, physics, T, q, quality) {
  const W = { group: new THREE.Group(), buttons: [], shelves: [], products: [], monitorTex: null };
  scene.add(W.group);
  const G = W.group;

  // ---------- materiais ----------
  const mFloor = new THREE.MeshStandardMaterial({ map: T.floor, roughness: 0.35, metalness: 0.05 });
  const mWall = new THREE.MeshStandardMaterial({ map: T.wall, roughness: 0.95 });
  const mWood = new THREE.MeshStandardMaterial({ map: T.wood, roughness: 0.6 });
  const mCounter = new THREE.MeshStandardMaterial({ map: T.counter, roughness: 0.22, metalness: 0.1 });
  const mMetal = new THREE.MeshStandardMaterial({ map: T.metal, roughness: 0.35, metalness: 0.85 });
  const mDark = new THREE.MeshStandardMaterial({ color: 0x1b1f2a, roughness: 0.5, metalness: 0.3 });
  const mWhite = new THREE.MeshStandardMaterial({ color: 0xf3f3f1, roughness: 0.5 });
  const mGlass = new THREE.MeshStandardMaterial({ color: 0xaad4ff, roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.25 });
  const mLamp = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d6, emissiveIntensity: 1.6 });

  const RX = 4, ZMIN = -6, ZMAX = 3, H = 3.2;

  // ---------- sala ----------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(RX * 2, ZMAX - ZMIN), mFloor);
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, (ZMAX + ZMIN) / 2); floor.receiveShadow = true; G.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(RX * 2, ZMAX - ZMIN), new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 1 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H, (ZMAX + ZMIN) / 2); G.add(ceil);
  const wallsDef = [
    [0, H / 2, ZMIN, RX * 2, H, 0.1],   // frente (porta)
    [0, H / 2, ZMAX, RX * 2, H, 0.1],   // atrás
    [-RX, H / 2, (ZMAX + ZMIN) / 2, 0.1, H, ZMAX - ZMIN],
    [RX, H / 2, (ZMAX + ZMIN) / 2, 0.1, H, ZMAX - ZMIN]
  ];
  wallsDef.forEach(([x, y, z, w, h, d], i) => {
    if (i === 0) return; // parede com porta é montada à parte
    const m = box(w, h, d, mWall, x, y, z, G, false);
  });
  // parede da porta com abertura central (2 m)
  const doorW = 2.0, doorH = 2.3;
  box((RX * 2 - doorW) / 2, H, 0.12, mWall, -(doorW / 2 + (RX * 2 - doorW) / 4), H / 2, ZMIN, G, false);
  box((RX * 2 - doorW) / 2, H, 0.12, mWall, (doorW / 2 + (RX * 2 - doorW) / 4), H / 2, ZMIN, G, false);
  box(doorW, H - doorH, 0.12, mWall, 0, doorH + (H - doorH) / 2, ZMIN, G, false);
  // rodapé e faixa colorida
  for (const [x, z, w, d] of [[-RX + 0.06, (ZMAX + ZMIN) / 2, 0.04, ZMAX - ZMIN], [RX - 0.06, (ZMAX + ZMIN) / 2, 0.04, ZMAX - ZMIN]]) box(w, 0.12, d, mDark, x, 0.06, z, G, false);
  const stripe = new THREE.MeshStandardMaterial({ color: 0x3b5bdb, roughness: 0.6 });
  box(0.02, 0.18, ZMAX - ZMIN, stripe, -RX + 0.06, 1.1, (ZMAX + ZMIN) / 2, G, false);
  box(0.02, 0.18, ZMAX - ZMIN, stripe, RX - 0.06, 1.1, (ZMAX + ZMIN) / 2, G, false);
  // tapete e marcação de fila
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.2), new THREE.MeshStandardMaterial({ map: T.carpet, roughness: 1 }));
  carpet.rotation.x = -Math.PI / 2; carpet.position.set(0, 0.004, -2.4); carpet.receiveShadow = true; G.add(carpet);
  for (const z of [-3.1, -3.9, -4.7]) {
    const mk = new THREE.Mesh(new THREE.CircleGeometry(0.17, 20), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    mk.rotation.x = -Math.PI / 2; mk.position.set(0.0, 0.006, z); G.add(mk);
  }

  // placa da loja
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.5), new THREE.MeshBasicMaterial({ map: signTexture('VR MARKET', '#143d9c', '#ffd23f', 512, 100) }));
  sign.position.set(0, 2.75, ZMIN + 0.07); G.add(sign);
  const signBack = sign.clone(); signBack.position.set(0, 2.75, ZMIN + 0.07); G.add(signBack);

  // ---------- janelas (laterais, com céu emissivo) ----------
  const skyMat = new THREE.MeshBasicMaterial({ color: 0x9ed0ff });
  for (const side of [-1, 1]) {
    for (const z of [-4.2, -1.6]) {
      const x = side * (RX - 0.02);
      const sky = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.1), skyMat); sky.position.set(x, 1.7, z); sky.rotation.y = -side * Math.PI / 2; G.add(sky);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.1), mGlass); glass.position.set(x - side * 0.01, 1.7, z); glass.rotation.y = -side * Math.PI / 2; G.add(glass);
      const frame = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.4 });
      box(0.06, 0.06, 1.5, frame, x - side * 0.03, 2.28, z, G, false); box(0.06, 0.06, 1.5, frame, x - side * 0.03, 1.12, z, G, false);
      box(0.06, 1.2, 0.06, frame, x - side * 0.03, 1.7, z - 0.72, G, false); box(0.06, 1.2, 0.06, frame, x - side * 0.03, 1.7, z + 0.72, G, false);
      box(0.06, 1.2, 0.04, frame, x - side * 0.03, 1.7, z, G, false);
    }
  }

  // ---------- porta de vidro automática ----------
  const doorMatFrame = mMetal;
  W.door = { left: new THREE.Group(), right: new THREE.Group(), open: 0, target: 0 };
  for (const [grp, sgn] of [[W.door.left, -1], [W.door.right, 1]]) {
    const pw = doorW / 2 - 0.02;
    const gl = new THREE.Mesh(new THREE.BoxGeometry(pw, doorH - 0.05, 0.02), mGlass); gl.position.set(sgn * pw / 2, doorH / 2, 0); grp.add(gl);
    box(pw, 0.05, 0.05, doorMatFrame, sgn * pw / 2, 0.03, 0, grp, false); box(pw, 0.05, 0.05, doorMatFrame, sgn * pw / 2, doorH - 0.05, 0, grp, false);
    box(0.05, doorH, 0.05, doorMatFrame, sgn * 0.02, doorH / 2, 0, grp, false); box(0.05, doorH, 0.05, doorMatFrame, sgn * (pw - 0.02), doorH / 2, 0, grp, false);
    grp.position.set(0, 0, ZMIN + 0.02); G.add(grp);
  }
  W.door.update = (dt, wantOpen) => {
    const d = W.door; d.target = wantOpen ? 1 : 0;
    const prev = d.open; d.open += (d.target - d.open) * Math.min(1, dt * 4);
    const off = d.open * (doorW / 2 - 0.05);
    d.left.position.x = -off; d.right.position.x = off;
    return Math.abs(d.open - prev) > 0.002;
  };

  // ---------- balcão ----------
  const CT = { x: 0, z: -0.82, w: 3.0, d: 0.65, h: 0.95 };
  const counter = new THREE.Group(); G.add(counter);
  box(CT.w, 0.05, CT.d, mCounter, CT.x, CT.h - 0.025, CT.z, counter);
  box(CT.w - 0.1, CT.h - 0.05, CT.d - 0.1, mWood, CT.x, (CT.h - 0.05) / 2, CT.z - 0.02, counter);
  box(CT.w + 0.02, 0.08, 0.03, mMetal, CT.x, 0.1, CT.z + CT.d / 2 - 0.02, counter, false);
  physics.addBox(CT.x, CT.h / 2, CT.z, CT.w, CT.h, CT.d, 'counter');
  W.counter = CT;
  // zonas
  W.deliveryZone = { min: new THREE.Vector3(-0.75, CT.h, CT.z - CT.d / 2 - 0.05), max: new THREE.Vector3(0.45, CT.h + 0.4, CT.z + 0.05) };
  W.changeZone = { min: new THREE.Vector3(-1.1, CT.h, CT.z - CT.d / 2 - 0.05), max: new THREE.Vector3(-0.78, CT.h + 0.3, CT.z + 0.05) };
  const zoneMark = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.5), new THREE.MeshBasicMaterial({ color: 0x66ffcc, transparent: true, opacity: 0.12, depthWrite: false }));
  zoneMark.rotation.x = -Math.PI / 2; zoneMark.position.set(-0.15, CT.h + 0.002, CT.z - 0.08); G.add(zoneMark); W.zoneMark = zoneMark;
  const chMark = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.5), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.18, depthWrite: false }));
  chMark.rotation.x = -Math.PI / 2; chMark.position.set(-0.94, CT.h + 0.002, CT.z - 0.08); G.add(chMark); W.chMark = chMark;
  const txtM = (txt, col) => new THREE.MeshBasicMaterial({ map: signTexture(txt, 'rgba(0,0,0,0)', col, 256, 64), transparent: true, depthWrite: false });
  const lbl1 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.125), txtM('ENTREGAR', '#66ffcc')); lbl1.rotation.x = -Math.PI / 2; lbl1.position.set(-0.15, CT.h + 0.003, CT.z + 0.12); G.add(lbl1);
  const lbl2 = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.075), txtM('TROCO', '#ffd23f')); lbl2.rotation.x = -Math.PI / 2; lbl2.position.set(-0.94, CT.h + 0.003, CT.z + 0.12); G.add(lbl2);

  // ---------- caixa registradora + gaveta ----------
  const RG = { x: 0.95, z: CT.z + 0.02 };
  const reg = new THREE.Group(); reg.position.set(RG.x, CT.h, RG.z); G.add(reg);
  box(0.46, 0.1, 0.38, mDark, 0, 0.05, 0, reg);
  const regTop = box(0.42, 0.12, 0.2, mDark, 0, 0.16, -0.09, reg);
  const keys = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 0.15), new THREE.MeshStandardMaterial({ color: 0x2f3547, roughness: 0.6 }));
  keys.position.set(0, 0.13, 0.08); keys.rotation.x = -0.2; reg.add(keys);
  for (let i = 0; i < 12; i++) { const k = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.012, 0.03), new THREE.MeshStandardMaterial({ color: i % 4 === 3 ? 0xd94f4f : 0xe6e6e6, roughness: 0.5 })); k.position.set(-0.15 + (i % 4) * 0.1, 0.145 + (Math.floor(i / 4)) * 0.006, 0.04 + Math.floor(i / 4) * 0.045); k.rotation.x = -0.2; reg.add(k); }
  // display do caixa (texto do total)
  const dispC = document.createElement('canvas'); dispC.width = 256; dispC.height = 96; const dispT = new THREE.CanvasTexture(dispC); dispT.colorSpace = THREE.SRGBColorSpace;
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.08), new THREE.MeshBasicMaterial({ map: dispT }));
  disp.position.set(0, 0.2, -0.0); disp.rotation.x = -0.35; reg.add(disp);
  W.regDisplay = { c: dispC, t: dispT, last: '' };
  W.setRegDisplay = (text, sub = '') => {
    const key = text + '|' + sub; if (W.regDisplay.last === key) return; W.regDisplay.last = key;
    const g = dispC.getContext('2d'); g.fillStyle = '#0b2a1a'; g.fillRect(0, 0, 256, 96);
    g.fillStyle = '#7dffb0'; g.font = 'bold 44px monospace'; g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillText(text, 244, 36);
    g.font = '22px monospace'; g.fillStyle = '#4fbf84'; g.fillText(sub, 244, 74); dispT.needsUpdate = true;
  };
  W.setRegDisplay('R$ 0', 'PRONTO');

  // gaveta
  const drawer = { group: new THREE.Group(), ext: 0, max: 0.34, handleLocal: new THREE.Vector3(0, 0.05, 0.37), collider: null, open: false, grabbedBy: null, dispensers: [] };
  drawer.group.position.set(0, 0.05, 0.0); reg.add(drawer.group);
  const trayMat = new THREE.MeshStandardMaterial({ color: 0x5e6678, roughness: 0.4, metalness: 0.6 });
  box(0.44, 0.045, 0.36, trayMat, 0, 0.0, 0.0, drawer.group);
  box(0.44, 0.07, 0.02, mDark, 0, 0.02, 0.19, drawer.group); // frente
  const handle = box(0.16, 0.025, 0.03, mMetal, 0, 0.02, 0.215, drawer.group);
  drawer.handle = handle;
  // divisórias e dispensadores de notas (pegar = clona uma nota)
  const slotVals = [1, 2, 5, 10];
  slotVals.forEach((v, i) => {
    const x = -0.15 + i * 0.1;
    box(0.002, 0.04, 0.3, mMetal, x - 0.05, 0.03, -0.0, drawer.group, false);
    const stack = new THREE.Group(); stack.position.set(x, 0.035, 0);
    for (let k = 0; k < 4; k++) { const { mesh } = moneyMesh(v); mesh.rotation.y = Math.PI / 2; mesh.position.y = k * (v === 1 ? 0.006 : 0.004); mesh.scale.setScalar(0.62); stack.add(mesh); }
    drawer.group.add(stack);
    drawer.dispensers.push({ value: v, local: new THREE.Vector3(x, 0.07, 0), cool: 0 });
  });
  drawer.setExt = (e) => {
    drawer.ext = Math.max(0, Math.min(drawer.max, e));
    drawer.group.position.z = drawer.ext;
    drawer.open = drawer.ext > 0.12;
    if (!drawer.collider) drawer.collider = physics.addBox(0, 0, 0, 0.001, 0.001, 0.001, 'drawer'); // marcador (sem colisão relevante)
  };
  W.drawer = drawer; W.reg = reg;
  physics.addBox(RG.x, CT.h + 0.05, RG.z, 0.46, 0.1, 0.38, 'register');
  physics.addBox(RG.x, CT.h + 0.17, RG.z - 0.09, 0.42, 0.14, 0.2, 'register2');
  W.drawerWorld = (v = new THREE.Vector3()) => { drawer.handle.updateWorldMatrix(true, false); return v.setFromMatrixPosition(drawer.handle.matrixWorld); };
  // zona de depósito dentro da gaveta (em mundo, atualiza com ext)
  W.drawerZone = () => {
    const wp = new THREE.Vector3(); drawer.group.getWorldPosition(wp);
    return { min: new THREE.Vector3(wp.x - 0.24, wp.y - 0.03, wp.z - 0.2), max: new THREE.Vector3(wp.x + 0.24, wp.y + 0.35, wp.z + 0.2) };
  };

  // botão de chamada (sino)
  const bell = new THREE.Group(); bell.position.set(0.35, CT.h, CT.z + 0.05); G.add(bell);
  box(0.12, 0.02, 0.12, mMetal, 0, 0.01, 0, bell);
  const bellBtn = new THREE.Mesh(new THREE.SphereGeometry(0.04, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe5c14a, metalness: 0.9, roughness: 0.25 }));
  bellBtn.position.y = 0.02; bell.add(bellBtn);
  W.bell = { mesh: bellBtn };
  addButton(W, 'bell', bellBtn, new THREE.Vector3(0.35, CT.h + 0.05, CT.z + 0.05), 0.055, 0.03);

  // ---------- computador ----------
  const PC = { x: -1.0, z: CT.z - 0.1 };
  const pc = new THREE.Group(); pc.position.set(PC.x, CT.h, PC.z); G.add(pc);
  box(0.2, 0.02, 0.16, mDark, 0, 0.01, 0, pc);
  box(0.04, 0.16, 0.03, mDark, 0, 0.1, -0.02, pc);
  box(0.5, 0.31, 0.03, mDark, 0, 0.3, -0.04, pc);
  const scC = document.createElement('canvas'); scC.width = 512; scC.height = 300; const scT = new THREE.CanvasTexture(scC); scT.colorSpace = THREE.SRGBColorSpace; scT.anisotropy = 4;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.47, 0.275), new THREE.MeshBasicMaterial({ map: scT }));
  scr.position.set(0, 0.3, -0.024); scr.rotation.y = 0; pc.add(scr);
  W.monitor = { c: scC, t: scT, mesh: scr };
  // teclado com botões grandes
  const kb = box(0.44, 0.015, 0.14, mDark, 0.0, 0.0075, 0.2, pc);
  const mkBtn = (name, color, x, label) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.018, 0.07), new THREE.MeshStandardMaterial({ color, roughness: 0.4, emissive: color, emissiveIntensity: 0.25 }));
    b.position.set(x, 0.024, 0.2); pc.add(b);
    const tx = new THREE.Mesh(new THREE.PlaneGeometry(0.085, 0.03), new THREE.MeshBasicMaterial({ map: signTexture(label, 'rgba(0,0,0,0)', '#ffffff', 256, 90), transparent: true }));
    tx.rotation.x = -Math.PI / 2; tx.position.set(x, 0.0335, 0.2); pc.add(tx);
    addButton(W, name, b, new THREE.Vector3(PC.x + x, CT.h + 0.034, PC.z + 0.2), 0.05, 0.03);
  };
  mkBtn('charge', 0x1fa75a, -0.15, 'COBRAR'); mkBtn('clear', 0xd2483b, -0.05, 'LIMPAR'); mkBtn('next', 0x2f6fe0, 0.05, 'PRÓXIMO'); mkBtn('help', 0xcf8f1a, 0.15, 'AJUDA');
  physics.addBox(PC.x, CT.h + 0.15, PC.z - 0.04, 0.52, 0.3, 0.05, 'monitor');
  W.monitorPos = new THREE.Vector3(PC.x, CT.h + 0.3, PC.z - 0.03);
  // mouse (decoração)
  const mouse = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.03, 4, 8), mDark); mouse.rotation.x = Math.PI / 2; mouse.scale.y = 0.6; mouse.position.set(0.28, 0.02, 0.2); pc.add(mouse);

  // ---------- prateleiras (esquerda e direita do jogador) ----------
  const addShelfUnit = (cx, facing, keys) => {
    const unit = new THREE.Group(); unit.position.set(cx, 0, 0.1); G.add(unit);
    const L = 1.5, Dp = 0.4, Hh = 1.8;
    // laterais e fundo
    box(0.04, Hh, Dp, mWood, 0, Hh / 2, -L / 2, unit); box(0.04, Hh, Dp, mWood, 0, Hh / 2, L / 2, unit);
    box(0.02, Hh, L, mWood, -facing * (Dp / 2 - 0.01), Hh / 2, 0, unit, false);
    const levels = [0.35, 0.75, 1.15, 1.55];
    levels.forEach((y, li) => {
      box(Dp, 0.03, L, mWood, 0, y, 0, unit);
      physics.addBox(cx, y, 0.1, Dp, 0.03, L, 'shelf');
      // placa de preço
      const lip = box(0.015, 0.05, L - 0.06, mWhite, facing * (Dp / 2), y + 0.03, 0, unit, false);
    });
    box(Dp, 0.03, L + 0.04, mWood, 0, Hh, 0, unit);
    // paredes colisão
    physics.addBox(cx - facing * (Dp / 2 - 0.01), Hh / 2, 0.1, 0.02, Hh, L, 'shelfback');
    physics.addBox(cx, Hh / 2, 0.1 - L / 2, Dp, Hh, 0.04, 'shelfside');
    physics.addBox(cx, Hh / 2, 0.1 + L / 2, Dp, Hh, 0.04, 'shelfside');
    // produtos por prateleira
    const perLevel = [keys[0], keys[1], keys[2], keys[3]];
    levels.slice(0, 4).forEach((y, li) => {
      const key = perLevel[li]; const def = PRODUCTS[key];
      const slots = def.shape === 'box' && def.size[0] > 0.15 ? 5 : 8;
      for (let k = 0; k < slots; k++) {
        const { mesh, half } = productMesh(key, quality);
        const zz = 0.1 - L / 2 + 0.14 + (k / slots) * (L - 0.28) + (k % 2) * 0.012;
        const xx = cx - facing * 0.04 + (k % 2 === 0 ? 0 : 0);
        mesh.position.set(cx - facing * 0.02 + facing * (k % 2) * 0.0, y + 0.015 + half.y + 0.002, zz);
        const faceYaw = facing > 0 ? -Math.PI / 2 : Math.PI / 2; // rótulo voltado para o jogador
        mesh.rotation.y = faceYaw; scene.add(mesh);
        const body = new Body(mesh, half, { mass: def.mass, kind: 'product', data: { key } });
        body.sleeping = true;
        physics.add(body); W.products.push(body);
      }
    });
    W.shelves.push(unit);
  };
  addShelfUnit(-0.82, 1, ['milk', 'cereal', 'bread', 'choco']);
  addShelfUnit(0.82, -1, ['juice', 'soda', 'apple', 'water']);
  // cesta de maçãs/produtos extra no chão (organização)
  const crate = new THREE.Group(); crate.position.set(-0.45, 0, 0.9); G.add(crate);
  box(0.5, 0.04, 0.4, mWood, 0, 0.02, 0, crate); box(0.5, 0.25, 0.03, mWood, 0, 0.14, -0.185, crate); box(0.5, 0.25, 0.03, mWood, 0, 0.14, 0.185, crate);
  box(0.03, 0.25, 0.4, mWood, -0.235, 0.14, 0, crate); box(0.03, 0.25, 0.4, mWood, 0.235, 0.14, 0, crate);
  physics.addBox(-0.45, 0.02, 0.9, 0.5, 0.04, 0.4, 'crate'); physics.addBox(-0.45, 0.14, 0.9 - 0.185, 0.5, 0.25, 0.03, 'crate'); physics.addBox(-0.45, 0.14, 0.9 + 0.185, 0.5, 0.25, 0.03, 'crate');
  physics.addBox(-0.45 - 0.235, 0.14, 0.9, 0.03, 0.25, 0.4, 'crate'); physics.addBox(-0.45 + 0.235, 0.14, 0.9, 0.03, 0.25, 0.4, 'crate');
  W.crate = { x: -0.45, z: 0.9 };

  // ---------- decoração ----------
  // vasos com plantas
  const pot = (x, z) => {
    const p = new THREE.Group(); p.position.set(x, 0, z); G.add(p);
    const pm = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.36, 14), new THREE.MeshStandardMaterial({ color: 0xb4572f, roughness: 0.8 })); pm.position.y = 0.18; pm.castShadow = true; p.add(pm);
    const leafM = new THREE.MeshStandardMaterial({ color: 0x2f8f46, roughness: 0.7 });
    for (let i = 0; i < 9; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), leafM); const a = i / 9 * 6.28; l.scale.set(1, 1.8, 0.45); l.position.set(Math.cos(a) * 0.09, 0.6 + (i % 3) * 0.12, Math.sin(a) * 0.09); l.rotation.set(Math.sin(a) * 0.5, a, Math.cos(a) * 0.5); l.castShadow = true; p.add(l); }
    physics.addBox(x, 0.35, z, 0.38, 0.7, 0.38, 'plant');
  };
  pot(-3.4, -5.3); pot(3.4, -5.3); pot(-3.5, 2.4); pot(3.5, 2.4);
  // pôsteres
  const poster = (txt, x, y, z, ry, bg) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.2), new THREE.MeshBasicMaterial({ map: signTexture(txt, bg, '#ffffff', 256, 340) })); m.position.set(x, y, z); m.rotation.y = ry; G.add(m); };
  poster('OFERTA!', -RX + 0.07, 1.9, 0.6, Math.PI / 2, '#b3261e'); poster('FRESCO', RX - 0.07, 1.9, 0.6, -Math.PI / 2, '#1f7a43');
  poster('PROMO', -RX + 0.07, 1.9, 2.1, Math.PI / 2, '#6a2fb0');
  // relógio
  const clock = new THREE.Group(); clock.position.set(0, 2.6, ZMAX - 0.08); clock.rotation.y = Math.PI; G.add(clock);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), new THREE.MeshBasicMaterial({ color: 0xffffff })); clock.add(face);
  const hand = (l, w) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), new THREE.MeshBasicMaterial({ color: 0x111111 })); m.position.z = 0.005; const gr = new THREE.Group(); m.position.y = l / 2; gr.add(m); clock.add(gr); return gr; };
  W.clockH = hand(0.12, 0.012); W.clockM = hand(0.18, 0.008);
  // luminárias de teto
  W.lamps = [];
  for (const [x, z] of [[-1.8, -1.0], [1.8, -1.0], [-1.8, -4.0], [1.8, -4.0], [0, 1.4]]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.35), mLamp); lamp.position.set(x, H - 0.03, z); G.add(lamp); W.lamps.push(lamp);
  }
  // câmera de segurança / TV decorativa
  const tv = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.68), new THREE.MeshBasicMaterial({ map: signTexture('PROMOÇÃO DA SEMANA', '#10265c', '#7dffb0', 512, 290) }));
  tv.position.set(2.4, 2.35, ZMIN + 0.07); G.add(tv);
  // balcão de fundo (decoração) com garrafas
  const back = new THREE.Group(); back.position.set(2.8, 0, -4.9); G.add(back);
  box(1.2, 0.9, 0.5, mWood, 0, 0.45, 0, back);
  for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.26, 10), new THREE.MeshStandardMaterial({ color: [0x2c9ad6, 0xd92b3a, 0x2fa05a][i % 3], roughness: 0.2, metalness: 0.1 })); b.position.set(-0.45 + i * 0.18, 1.03, 0); b.castShadow = true; back.add(b); }
  physics.addBox(2.8, 0.45, -4.9, 1.2, 0.9, 0.5, 'deco');

  // ---------- luzes ----------
  scene.background = new THREE.Color(0x0b1020);
  const hemi = new THREE.HemisphereLight(0xdfeaff, 0x6b5a48, 0.65); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 0.8); sun.position.set(2.5, 3.0, 1.5); sun.target.position.set(0, 0.5, -2);
  sun.castShadow = q.shadows;
  if (q.shadows) { sun.shadow.mapSize.set(q.shadowSize, q.shadowSize); const c = sun.shadow.camera; c.left = -4; c.right = 4; c.top = 4; c.bottom = -4; c.near = 0.5; c.far = 9; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02; }
  scene.add(sun); scene.add(sun.target); W.sun = sun;
  const pls = [[0, 2.7, -1.0], [0, 2.7, -4.2], [-1.8, 2.7, 1.0], [1.8, 2.7, 1.0]];
  for (let i = 0; i < q.lights; i++) { const p = new THREE.PointLight(0xfff2dc, i === 0 ? 14 : 8, 8, 1.6); p.position.set(...pls[i % pls.length]); scene.add(p); }
  scene.fog = new THREE.Fog(0x0b1020, 9, 22);

  W.bounds = { min: new THREE.Vector3(-RX + 0.1, 0, ZMIN + 0.15), max: new THREE.Vector3(RX - 0.1, H, ZMAX - 0.1) };
  W.door.z = ZMIN; W.door.x = 0;
  W.queue = [new THREE.Vector3(0.05, 0, -1.85), new THREE.Vector3(0.05, 0, -3.1), new THREE.Vector3(0.05, 0, -3.9), new THREE.Vector3(0.05, 0, -4.7)];
  W.spawn = new THREE.Vector3(0, 0, -7.4);
  W.exit = new THREE.Vector3(0, 0, -7.6);
  W.update = (dt, time) => {
    const d = new Date();
    W.clockM.rotation.z = -(d.getMinutes() / 60) * Math.PI * 2; W.clockH.rotation.z = -((d.getHours() % 12) / 12 + d.getMinutes() / 720) * Math.PI * 2;
  };
  return W;
}

function addButton(W, name, mesh, pos, radius, travel) {
  W.buttons.push({ name, mesh, pos, radius, travel, base: mesh.position.y, pressed: 0, cool: 0, state: 0 });
}
