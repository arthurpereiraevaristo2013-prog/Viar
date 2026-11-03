// Mãos virtuais 3D: esqueleto de 21 juntas (esferas + cápsulas) + palma, posicionadas pelos landmarks reais.
import * as THREE from 'three';
import { BONES } from './gestures.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const BONE_RADIUS = (i, j) => {
  const tip = [4, 8, 12, 16, 20];
  if (tip.includes(i) || tip.includes(j)) return 0.0085;
  return 0.0105;
};

export class Hand3D {
  constructor(side, parent) {
    this.side = side;
    this.group = new THREE.Group();
    this.group.visible = false;
    parent.add(this.group);
    this.mat = new THREE.MeshStandardMaterial({ color: side === 'left' ? 0xe0ac94 : 0xe6b59c, roughness: 0.62, metalness: 0.0, transparent: true });
    this.joints = [];
    const sg = new THREE.SphereGeometry(1, 10, 8);
    for (let i = 0; i < 21; i++) {
      const m = new THREE.Mesh(sg, this.mat);
      const r = [4, 8, 12, 16, 20].includes(i) ? 0.0092 : i === 0 ? 0.019 : 0.0112;
      m.scale.setScalar(r);
      m.castShadow = false;
      this.group.add(m); this.joints.push(m);
    }
    const cg = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    this.bones = BONES.map(([i, j]) => {
      const m = new THREE.Mesh(cg, this.mat);
      m.userData = { i, j, r: BONE_RADIUS(i, j) };
      this.group.add(m); return m;
    });
    // palma
    const palmIdx = [0, 1, 5, 9, 13, 17];
    this.palmIdx = palmIdx;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(palmIdx.length * 3), 3));
    g.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5, 0, 5, 1, 0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 5, 4, 0, 1, 5]);
    this.palm = new THREE.Mesh(g, this.mat); this.palm.frustumCulled = false;
    this.palm.material = new THREE.MeshStandardMaterial({ color: this.mat.color, roughness: 0.65, side: THREE.DoubleSide, transparent: true });
    this.group.add(this.palm);
    // indicador de pinça/agarrar (anel na ponta)
    this.glow = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 10), new THREE.MeshBasicMaterial({ color: 0x66ffcc, transparent: true, opacity: 0.0, depthWrite: false }));
    this.group.add(this.glow);
    // raio de apontar
    this.ray = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 1, 6), new THREE.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.55, depthWrite: false }));
    this.ray.visible = false; this.group.add(this.ray);
  }

  // Posição do ponto de pinça (média polegar+indicador) em coordenadas locais do group.
  update(state) {
    const vis = state.opacity > 0.02;
    this.group.visible = vis;
    if (!vis) return;
    const J = state.joints;
    for (let i = 0; i < 21; i++) this.joints[i].position.set(J[i].x, J[i].y, J[i].z);
    for (const m of this.bones) {
      const { i, j, r } = m.userData;
      _a.set(J[i].x, J[i].y, J[i].z); _b.set(J[j].x, J[j].y, J[j].z);
      _d.subVectors(_b, _a);
      const len = _d.length();
      m.position.copy(_a).addScaledVector(_d, 0.5);
      m.scale.set(r, Math.max(len, 1e-4), r);
      m.quaternion.setFromUnitVectors(UP, _d.normalize());
    }
    const pos = this.palm.geometry.attributes.position;
    this.palmIdx.forEach((id, k) => pos.setXYZ(k, J[id].x, J[id].y, J[id].z));
    pos.needsUpdate = true;
    this.palm.geometry.computeVertexNormals();
    const op = state.opacity;
    this.mat.opacity = op; this.palm.material.opacity = op;
    // brilho ao pinçar / agarrar
    const g = state.gesture;
    const on = g.pinching || g.grabbing;
    this.glow.material.opacity += ((on ? 0.7 : 0) - this.glow.material.opacity) * 0.3;
    this.glow.position.set((J[4].x + J[8].x) / 2, (J[4].y + J[8].y) / 2, (J[4].z + J[8].z) / 2);
    if (g.grabbing) this.glow.position.set((J[0].x + J[9].x) / 2, (J[0].y + J[9].y) / 2, (J[0].z + J[9].z) / 2);
    // raio de apontar (a partir da ponta do indicador, na direção MCP->TIP)
    const pointing = g.pointing;
    this.ray.visible = pointing;
    if (pointing) {
      _a.set(J[8].x, J[8].y, J[8].z); _b.set(J[5].x, J[5].y, J[5].z);
      _d.subVectors(_a, _b).normalize();
      const L = 0.8;
      this.ray.position.copy(_a).addScaledVector(_d, L / 2);
      this.ray.scale.set(1, L, 1);
      this.ray.quaternion.setFromUnitVectors(UP, _d);
    }
  }

  setQuality(low) {
    // modo desempenho: sem raio/brilho extras são baratos; aqui só reduz nada crítico.
    this.glow.visible = !low;
  }
}

// Utilidades para a interação
export function pinchPoint(state, out = new THREE.Vector3()) {
  const J = state.joints;
  return out.set((J[4].x + J[8].x) / 2, (J[4].y + J[8].y) / 2, (J[4].z + J[8].z) / 2);
}
export function palmPoint(state, out = new THREE.Vector3()) {
  const J = state.joints;
  return out.set((J[0].x + J[9].x) / 2, (J[0].y + J[9].y) / 2, (J[0].z + J[9].z) / 2);
}
export function indexTip(state, out = new THREE.Vector3()) {
  const J = state.joints; return out.set(J[8].x, J[8].y, J[8].z);
}
export function pointDir(state, out = new THREE.Vector3()) {
  const J = state.joints;
  return out.set(J[8].x - J[5].x, J[8].y - J[5].y, J[8].z - J[5].z).normalize();
}
