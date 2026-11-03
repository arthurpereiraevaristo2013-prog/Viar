// NPCs humanos estilizados (modelos procedurais), com aparências diferentes, animação de caminhada/idle/gestos,
// expressões faciais (textura do rosto), balão de fala e movimentação por waypoints com desvio leve.
import * as THREE from 'three';
import { faceTexture } from './textures.js';

export const ARCHETYPES = [
  { id: 'idosa',    name: 'Dona Maria',  skin: '#e8c3a5', shirt: 0x9b5fc0, pants: 0x3b3f58, hair: 0xd8d8d8, style: 'bun',    glasses: true,  scale: 0.94, patience: 70, speed: 0.75, pitch: 1.25, bills: [10, 20], desc: 'paciente' },
  { id: 'exec',     name: 'Sr. Carlos',  skin: '#c89a78', shirt: 0xf2f2f2, pants: 0x1c2233, hair: 0x2a1c14, style: 'short',  tie: 0xb3261e, scale: 1.06, patience: 28, speed: 1.15, pitch: 0.8, bills: [20, 50], desc: 'apressado' },
  { id: 'estud',    name: 'Julia',       skin: '#f0cfb2', shirt: 0xe85d75, pants: 0x2f4f8f, hair: 0x5a2d16, style: 'long',   scale: 0.98, patience: 50, speed: 1.0, pitch: 1.2, bills: [10, 20], desc: 'simpática' },
  { id: 'op',       name: 'Seu João',    skin: '#a9714f', shirt: 0xe0922b, pants: 0x31456b, hair: 0x1a1210, style: 'cap',    beard: true, scale: 1.04, patience: 45, speed: 1.0, pitch: 0.85, bills: [10, 20, 50], desc: 'tranquilo' },
  { id: 'jov',      name: 'Rafa',        skin: '#7a4b32', shirt: 0x2fa05a, pants: 0x23262e, hair: 0x0e0b0a, style: 'afro',   scale: 1.02, patience: 40, speed: 1.1, pitch: 0.95, bills: [5, 10, 20], desc: 'animado' },
  { id: 'dona',     name: 'Camila',      skin: '#5b3a28', shirt: 0x3aa8e0, pants: 0xdddddd, hair: 0x120d0b, style: 'long',   glasses: true, scale: 0.97, patience: 55, speed: 1.0, pitch: 1.15, bills: [10, 20, 50], desc: 'exigente' },
  { id: 'chef',     name: 'Marcos',      skin: '#e0b48f', shirt: 0xd9d9d9, pants: 0x4a3a2a, hair: 0x8a5a2c, style: 'short',  beard: true, scale: 1.08, patience: 35, speed: 1.0, pitch: 0.82, bills: [20, 50], desc: 'impaciente' },
  { id: 'mae',      name: 'Patrícia',    skin: '#d9a98a', shirt: 0xf2c94c, pants: 0x6a2f4f, hair: 0x3b2314, style: 'bun',    scale: 0.99, patience: 60, speed: 0.95, pitch: 1.18, bills: [10, 20], desc: 'gentil' }
];

const m = (c, r = 0.7, mt = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: mt });

export class NPC {
  constructor(arch, scene, quality) {
    this.arch = arch; this.scene = scene; this.name = arch.name;
    this.root = new THREE.Group(); scene.add(this.root);
    this.speed = 1.25 * arch.speed;
    this.path = []; this.target = null; this.walkPhase = Math.random() * 6; this.moving = false;
    this.mood = 0; this.moodTarget = 0; this.blink = 0; this.nextBlink = 2 + Math.random() * 3;
    this.state = 'spawn'; this.t = 0; this.data = {};
    this.armMode = 'swing';   // swing | offer | wave | cross | thumbs
    this.talkT = 0; this.faceYaw = 0; this.yaw = 0; this.stepFlag = 0;
    this.bagItems = [];
    this._build(arch, quality);
    this.bubble = this._makeBubble(); this.root.add(this.bubble.sprite); this.bubble.sprite.position.set(0, 2.05 * arch.scale, 0);
  }

  _build(a, quality) {
    const skin = m(new THREE.Color(a.skin), 0.55);
    const seg = quality === 'low' ? 8 : 14;
    const body = new THREE.Group(); this.root.add(body); this.body = body;
    body.scale.setScalar(a.scale);

    // pernas (pivôs no quadril)
    const mkLeg = (x) => {
      const piv = new THREE.Group(); piv.position.set(x, 0.92, 0); body.add(piv);
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.36, 4, seg), m(a.pants, 0.85)); thigh.position.y = -0.24; thigh.castShadow = true; piv.add(thigh);
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.34, 4, seg), m(a.pants, 0.85)); shin.position.y = -0.62; shin.castShadow = true; piv.add(shin);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.26), m(0x1b1b1f, 0.6)); shoe.position.set(0, -0.88, 0.05); shoe.castShadow = true; piv.add(shoe);
      return piv;
    };
    this.legL = mkLeg(-0.1); this.legR = mkLeg(0.1);

    // tronco
    const torso = new THREE.Group(); torso.position.y = 0.92; body.add(torso); this.torso = torso;
    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.38, 6, seg), m(a.shirt, 0.8)); chest.position.y = 0.3; chest.scale.set(1, 1, 0.62); chest.castShadow = true; torso.add(chest);
    const hip = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.1, 4, seg), m(a.pants, 0.85)); hip.position.y = 0.02; hip.scale.set(1, 1, 0.65); torso.add(hip);
    if (a.tie) { const tie = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.02), m(a.tie, 0.6)); tie.position.set(0, 0.34, 0.125); torso.add(tie); }
    // pescoço + cabeça
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 10), skin); neck.position.y = 0.66; torso.add(neck);
    const headPiv = new THREE.Group(); headPiv.position.y = 0.76; torso.add(headPiv); this.headPiv = headPiv;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.135, seg + 4, seg), skin); head.scale.set(0.95, 1.12, 1); head.position.y = 0.13; head.castShadow = true; headPiv.add(head);
    // nariz e orelhas
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), skin); nose.position.set(0, 0.12, 0.135); nose.scale.set(1, 1.2, 1.2); headPiv.add(nose);
    for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), skin); ear.position.set(s * 0.13, 0.13, 0); ear.scale.set(0.6, 1, 0.8); headPiv.add(ear); }
    // rosto (textura com olhos/boca)
    const face = faceTexture(a.skin, 0); this.face = face;
    // rosto: calota de esfera centrada em +Z (phi = PI/2); os UVs da calota cobrem a textura inteira
    const faceSph = new THREE.Mesh(new THREE.SphereGeometry(0.1355, 20, 16, Math.PI / 2 - 0.9, 1.8, 1.0, 1.3), new THREE.MeshStandardMaterial({ map: face.texture, roughness: 0.55 }));
    faceSph.scale.set(0.95, 1.12, 1); faceSph.position.y = 0.13;
    headPiv.add(faceSph); this.faceMesh = faceSph;
    // cabelo
    const hairM = m(a.hair, 0.9);
    const hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.142, seg + 4, seg, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM); hairTop.scale.set(0.97, 1.14, 1.03); hairTop.position.set(0, 0.145, -0.008); hairTop.rotation.x = -0.15; headPiv.add(hairTop);
    if (a.style === 'long') { const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.22, 4, seg), hairM); back.position.set(0, 0.0, -0.06); back.scale.set(1, 1, 0.7); headPiv.add(back); }
    if (a.style === 'bun') { const bun = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), hairM); bun.position.set(0, 0.29, -0.06); headPiv.add(bun); }
    if (a.style === 'afro') { const af = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), hairM); af.position.set(0, 0.2, -0.02); headPiv.add(af); }
    if (a.style === 'cap') {
      const capM = m(0x244a9c, 0.7); const cap = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), capM); cap.position.set(0, 0.16, 0); cap.scale.set(1, 0.9, 1.05); headPiv.add(cap);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.012, 0.12), capM); brim.position.set(0, 0.17, 0.14); headPiv.add(brim);
    }
    if (a.beard) { const bd = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), hairM); bd.position.set(0, 0.08, 0.03); bd.scale.set(1.0, 0.8, 1.0); headPiv.add(bd); }
    if (a.glasses) {
      const gm = m(0x111111, 0.3, 0.4);
      for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.005, 6, 14), gm); r.position.set(s * 0.045, 0.145, 0.135); headPiv.add(r); }
      const br = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.005, 0.005), gm); br.position.set(0, 0.148, 0.137); headPiv.add(br);
    }

    // braços
    const mkArm = (x) => {
      const piv = new THREE.Group(); piv.position.set(x, 0.58, 0); torso.add(piv);
      const up = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.22, 4, seg), m(a.shirt, 0.8)); up.position.y = -0.16; up.castShadow = true; piv.add(up);
      const elbow = new THREE.Group(); elbow.position.y = -0.32; piv.add(elbow);
      const low = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.2, 4, seg), skin); low.position.y = -0.13; low.castShadow = true; elbow.add(low);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), skin); hand.position.y = -0.28; hand.scale.set(0.9, 1.1, 0.6); elbow.add(hand);
      piv.userData = { elbow, hand };
      return piv;
    };
    this.armL = mkArm(-0.26); this.armR = mkArm(0.26);
    this.hand = this.armR.userData.hand;
    this.root.traverse(o => { if (o.isMesh) o.receiveShadow = false; });
  }

  _makeBubble() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 192;
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false }));
    sp.scale.set(1.5, 0.56, 1); sp.renderOrder = 999; sp.visible = false;
    return { sprite: sp, c, t, text: '' };
  }
  say(lines, color = '#ffffff', bg = 'rgba(20,28,60,.88)') {
    const b = this.bubble; const key = JSON.stringify(lines) + color; if (b.text === key) return; b.text = key;
    const g = b.c.getContext('2d'); g.clearRect(0, 0, 512, 192);
    g.fillStyle = bg; const r = 28; g.beginPath(); g.moveTo(r, 8); g.arcTo(504, 8, 504, 160, r); g.arcTo(504, 160, 8, 160, r); g.arcTo(8, 160, 8, 8, r); g.arcTo(8, 8, 504, 8, r); g.fill();
    g.beginPath(); g.moveTo(236, 158); g.lineTo(256, 190); g.lineTo(276, 158); g.fill();
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    const arr = Array.isArray(lines) ? lines : [lines];
    const fs = arr.length > 3 ? 30 : 38; g.font = `bold ${fs}px system-ui, sans-serif`;
    const lh = fs + 6, y0 = 84 - (arr.length - 1) * lh / 2;
    arr.forEach((l, i) => g.fillText(l, 256, y0 + i * lh, 480));
    b.t.needsUpdate = true; b.sprite.visible = true;
  }
  hush() { this.bubble.sprite.visible = false; this.bubble.text = ''; }

  setMood(m) { this.moodTarget = m; }
  walkTo(points) { this.path = points.map(p => p.clone()); this.moving = this.path.length > 0; }
  get atTarget() { return this.path.length === 0; }
  faceTowards(p) { this.faceYaw = Math.atan2(p.x - this.root.position.x, p.z - this.root.position.z); }

  handWorld(out = new THREE.Vector3()) { this.hand.updateWorldMatrix(true, false); return out.setFromMatrixPosition(this.hand.matrixWorld); }

  update(dt, audio, others = []) {
    this.t += dt;
    // movimento
    let speedNow = 0;
    if (this.path.length) {
      const tgt = this.path[0]; const p = this.root.position;
      const dx = tgt.x - p.x, dz = tgt.z - p.z; const d = Math.hypot(dx, dz);
      if (d < 0.08) { this.path.shift(); if (!this.path.length) this.moving = false; }
      else {
        let sx = dx / d, sz = dz / d;
        // desvio simples de outros NPCs
        for (const o of others) { if (o === this) continue; const ox = p.x - o.root.position.x, oz = p.z - o.root.position.z; const od = Math.hypot(ox, oz); if (od < 0.7 && od > 1e-3) { sx += ox / od * (0.7 - od) * 1.5; sz += oz / od * (0.7 - od) * 1.5; } }
        const l = Math.hypot(sx, sz) || 1; sx /= l; sz /= l;
        speedNow = this.speed * Math.min(1, d / 0.4 + 0.35);
        p.x += sx * speedNow * dt; p.z += sz * speedNow * dt;
        this.faceYaw = Math.atan2(sx, sz);
      }
    }
    // gira suavemente
    let dy = this.faceYaw - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); this.yaw += dy * Math.min(1, dt * 7);
    this.root.rotation.y = this.yaw;

    // ciclo de caminhada
    const walking = speedNow > 0.05;
    if (walking) this.walkPhase += dt * (4.5 + speedNow * 2.2);
    const amp = walking ? 0.55 : 0;
    const sw = Math.sin(this.walkPhase);
    this.legL.rotation.x = THREE.MathUtils.lerp(this.legL.rotation.x, sw * amp, Math.min(1, dt * 14));
    this.legR.rotation.x = THREE.MathUtils.lerp(this.legR.rotation.x, -sw * amp, Math.min(1, dt * 14));
    this.body.position.y = (walking ? Math.abs(Math.cos(this.walkPhase)) * 0.025 : Math.sin(this.t * 1.7) * 0.004);
    this.torso.rotation.y = walking ? sw * 0.08 : 0; this.torso.rotation.z = walking ? Math.cos(this.walkPhase) * 0.02 : 0;
    // passos (som)
    const flag = Math.sin(this.walkPhase) > 0 ? 1 : -1;
    if (walking && flag !== this.stepFlag) { this.stepFlag = flag; audio?.step(this.root.position.clone().setY(0.1)); }

    // braços
    const lerp = THREE.MathUtils.lerp; const k = Math.min(1, dt * 10);
    let aL = walking ? -sw * 0.5 : 0, aR = walking ? sw * 0.5 : 0, eR = 0, eL = 0, zL = -0.04, zR = 0.04;
    if (this.armMode === 'offer') { aR = -1.25; eR = -0.35; aL = -0.25; }
    else if (this.armMode === 'wave') { aR = -2.6 + Math.sin(this.t * 9) * 0.0; zR = 0.3 + Math.sin(this.t * 9) * 0.3; eR = -0.4; }
    else if (this.armMode === 'cross') { aL = -0.7; aR = -0.7; eL = -1.6; eR = -1.6; zL = -0.3; zR = 0.3; }
    else if (this.armMode === 'cheer') { aL = -2.8 + Math.sin(this.t * 10) * 0.2; aR = -2.8 - Math.sin(this.t * 10) * 0.2; }
    else if (this.armMode === 'receive') { aR = -1.0; eR = -0.9; aL = -1.0; eL = -0.9; }
    this.armL.rotation.x = lerp(this.armL.rotation.x, aL, k); this.armR.rotation.x = lerp(this.armR.rotation.x, aR, k);
    this.armL.rotation.z = lerp(this.armL.rotation.z, zL, k); this.armR.rotation.z = lerp(this.armR.rotation.z, zR, k);
    this.armL.userData.elbow.rotation.x = lerp(this.armL.userData.elbow.rotation.x, eL, k); this.armR.userData.elbow.rotation.x = lerp(this.armR.userData.elbow.rotation.x, eR, k);

    // cabeça: olha para o jogador quando perto do balcão; fala = leve balançar
    const talk = this.talkT > 0 ? (this.talkT -= dt, Math.sin(this.t * 14) * 0.04) : 0;
    this.headPiv.rotation.x = lerp(this.headPiv.rotation.x, (this.lookPitch || 0) + talk, k);
    this.headPiv.rotation.y = lerp(this.headPiv.rotation.y, this.lookYaw || 0, k);

    // expressão e piscar
    this.mood += (this.moodTarget - this.mood) * Math.min(1, dt * 4);
    this.nextBlink -= dt; let blink = 0;
    if (this.nextBlink < 0.12) blink = 1 - Math.abs(this.nextBlink - 0.06) / 0.06; if (this.nextBlink < 0) this.nextBlink = 2 + Math.random() * 3.5;
    const q = Math.round(this.mood * 2) / 2, qb = blink > 0.5 ? 1 : 0; const sig = q + ':' + qb;
    if (sig !== this._faceSig) { this._faceSig = sig; this.face.draw(q, qb); }
    // balão sempre voltado para a câmera (Sprite) — mantém altura
    this.bubble.sprite.position.y = 2.05 * this.arch.scale + Math.sin(this.t * 2) * 0.01;
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse(o => { if (o.isMesh) { o.geometry?.dispose(); const mt = o.material; if (Array.isArray(mt)) mt.forEach(x => x.dispose()); else mt?.dispose(); } });
    this.bubble.t.dispose();
  }
}
