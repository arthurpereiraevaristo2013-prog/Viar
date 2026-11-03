// Física leve própria (otimizada para celulares): corpos dinâmicos como caixas alinhadas ao eixo
// com gravidade, atrito, restituição, colisão com geometria estática (AABB) e entre corpos.
// A rotação visual é simulada por "tombo" em torno do eixo de velocidade (barato).
import * as THREE from 'three';

export class Body {
  constructor(mesh, half, { mass = 0.3, restitution = 0.25, friction = 0.85, kind = 'product', data = {} } = {}) {
    this.mesh = mesh; this.half = half.clone(); this.mass = mass;
    this.restitution = restitution; this.friction = friction;
    this.pos = mesh.position.clone(); this.vel = new THREE.Vector3();
    this.spin = new THREE.Vector3();
    this.held = null;          // referência à mão que segura
    this.sleeping = false; this.sleepT = 0;
    this.kind = kind; this.data = data; this.active = true;
    this.onGround = false; this.radius = Math.max(half.x, half.z);
    this.lastImpact = 0;
  }
  wake() { this.sleeping = false; this.sleepT = 0; }
}

export class Physics {
  constructor() {
    this.bodies = [];
    this.statics = [];   // {min,max,tag}
    this.gravity = -9.8;
    this.onImpact = null;
    this.activeRadius = 4;
    this.center = new THREE.Vector3();
    this.bounds = { min: new THREE.Vector3(-6, 0, -6), max: new THREE.Vector3(6, 4, 6) };
    this.triggers = [];
    this._tmp = new THREE.Vector3();
  }
  addStatic(min, max, tag = '') { const s = { min: min.clone(), max: max.clone(), tag, enabled: true }; this.statics.push(s); return s; }
  addBox(cx, cy, cz, sx, sy, sz, tag = '') {
    return this.addStatic(new THREE.Vector3(cx - sx / 2, cy - sy / 2, cz - sz / 2), new THREE.Vector3(cx + sx / 2, cy + sy / 2, cz + sz / 2), tag);
  }
  add(body) { this.bodies.push(body); return body; }
  remove(body) { const i = this.bodies.indexOf(body); if (i >= 0) this.bodies.splice(i, 1); }

  step(dt) {
    dt = Math.min(dt, 1 / 30);
    const sub = dt > 1 / 50 ? 2 : 1; const h = dt / sub;
    for (let s = 0; s < sub; s++) {
      for (const b of this.bodies) {
        if (!b.active || b.held) continue;
        // carregamento por proximidade: corpos longe do jogador dormem
        if (b.sleeping) continue;
        b.vel.y += this.gravity * h;
        b.vel.multiplyScalar(1 - 0.12 * h);
        b.pos.addScaledVector(b.vel, h);
        b.onGround = false;
        this._collideStatics(b);
        // limites do mundo
        const bd = this.bounds;
        if (b.pos.y < bd.min.y + b.half.y) { b.pos.y = bd.min.y + b.half.y; this._bounce(b, 'y', 1); b.onGround = true; }
        for (const ax of ['x', 'z']) {
          if (b.pos[ax] < bd.min[ax] + b.half[ax]) { b.pos[ax] = bd.min[ax] + b.half[ax]; this._bounce(b, ax, 1); }
          if (b.pos[ax] > bd.max[ax] - b.half[ax]) { b.pos[ax] = bd.max[ax] - b.half[ax]; this._bounce(b, ax, -1); }
        }
        if (b.onGround) {
          const f = Math.max(0, 1 - b.friction * 8 * h);
          b.vel.x *= f; b.vel.z *= f; b.spin.multiplyScalar(f);
          if (b.vel.lengthSq() < 0.01) { b.sleepT += h; if (b.sleepT > 0.6) { b.sleeping = true; b.vel.set(0, 0, 0); } } else b.sleepT = 0;
        }
      }
      this._collideBodies();
    }
    for (const b of this.bodies) {
      if (!b.active) continue;
      b.mesh.position.copy(b.pos);
      if (!b.held && !b.sleeping) {
        // rotação visual: tomba em direção ao movimento horizontal
        const sp = Math.hypot(b.vel.x, b.vel.z);
        if (!b.onGround && sp > 0.05) { b.mesh.rotation.x += b.vel.z * dt * 1.5; b.mesh.rotation.z -= b.vel.x * dt * 1.5; }
        else { // endireita suavemente quando apoiado
          b.mesh.rotation.x *= 0.85; b.mesh.rotation.z *= 0.85;
        }
      }
    }
  }

  _bounce(b, axis, sgn) {
    const v = b.vel[axis] * sgn; // velocidade na direção contra a parede
    if (v < 0) {
      const impact = -v;
      b.vel[axis] = -b.vel[axis] * b.restitution * (impact > 0.8 ? 1 : 0);
      if (impact > 0.9 && this.onImpact) { const now = performance.now(); if (now - b.lastImpact > 120) { b.lastImpact = now; this.onImpact(b, impact); } }
    }
  }

  _collideStatics(b) {
    for (const s of this.statics) {
      if (!s.enabled) continue;
      const hx = b.half.x, hy = b.half.y, hz = b.half.z;
      const ox = Math.min(b.pos.x + hx - s.min.x, s.max.x - (b.pos.x - hx));
      const oy = Math.min(b.pos.y + hy - s.min.y, s.max.y - (b.pos.y - hy));
      const oz = Math.min(b.pos.z + hz - s.min.z, s.max.z - (b.pos.z - hz));
      if (ox <= 0 || oy <= 0 || oz <= 0) continue;
      // resolve pelo eixo de menor penetração (com preferência pelo topo se vier de cima)
      const cx = (s.min.x + s.max.x) / 2, cy = (s.min.y + s.max.y) / 2, cz = (s.min.z + s.max.z) / 2;
      if (oy <= ox && oy <= oz) {
        if (b.pos.y >= cy) { b.pos.y = s.max.y + hy; this._bounce(b, 'y', 1); b.onGround = true; }
        else { b.pos.y = s.min.y - hy; this._bounce(b, 'y', -1); }
      } else if (ox <= oz) {
        if (b.pos.x >= cx) { b.pos.x = s.max.x + hx; this._bounce(b, 'x', 1); } else { b.pos.x = s.min.x - hx; this._bounce(b, 'x', -1); }
      } else {
        if (b.pos.z >= cz) { b.pos.z = s.max.z + hz; this._bounce(b, 'z', 1); } else { b.pos.z = s.min.z - hz; this._bounce(b, 'z', -1); }
      }
    }
  }

  _collideBodies() {
    const n = this.bodies.length;
    for (let i = 0; i < n; i++) {
      const a = this.bodies[i]; if (!a.active) continue;
      for (let j = i + 1; j < n; j++) {
        const b = this.bodies[j]; if (!b.active) continue;
        if (a.sleeping && b.sleeping) continue;
        const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y, dz = b.pos.z - a.pos.z;
        const px = a.half.x + b.half.x - Math.abs(dx);
        if (px <= 0) continue;
        const py = a.half.y + b.half.y - Math.abs(dy); if (py <= 0) continue;
        const pz = a.half.z + b.half.z - Math.abs(dz); if (pz <= 0) continue;
        // separa pelo menor eixo; corpos segurados são imóveis (empurram os outros)
        const wa = a.held ? 0 : (a.sleeping ? 0.25 : 1) / a.mass, wb = b.held ? 0 : (b.sleeping ? 0.25 : 1) / b.mass;
        const wsum = wa + wb; if (wsum === 0) continue;
        let axis = 'y', pen = py, sgn = Math.sign(dy) || 1;
        if (px < pen) { axis = 'x'; pen = px; sgn = Math.sign(dx) || 1; }
        if (pz < pen) { axis = 'z'; pen = pz; sgn = Math.sign(dz) || 1; }
        a.pos[axis] -= sgn * pen * (wa / wsum); b.pos[axis] += sgn * pen * (wb / wsum);
        const rv = (b.vel[axis] - a.vel[axis]) * sgn;
        if (rv < 0) {
          const e = Math.min(a.restitution, b.restitution) * (-rv > 0.8 ? 1 : 0);
          const jimp = -(1 + e) * rv / wsum;
          a.vel[axis] -= sgn * jimp * wa; b.vel[axis] += sgn * jimp * wb;
        }
        if (axis === 'y') { if (sgn > 0) a.onGround = true; else b.onGround = true; }
        a.wake(); b.wake();
      }
    }
  }

  // Empurra corpos tocados por um ponto (dedos/mão) — resposta imediata.
  pushFrom(point, radius, vel, filter = null) {
    for (const b of this.bodies) {
      if (!b.active || b.held) continue;
      if (filter && !filter(b)) continue;
      const dx = Math.max(Math.abs(point.x - b.pos.x) - b.half.x, 0);
      const dy = Math.max(Math.abs(point.y - b.pos.y) - b.half.y, 0);
      const dz = Math.max(Math.abs(point.z - b.pos.z) - b.half.z, 0);
      if (dx * dx + dy * dy + dz * dz < radius * radius) {
        const dir = this._tmp.set(b.pos.x - point.x, 0, b.pos.z - point.z);
        if (dir.lengthSq() > 1e-6) dir.normalize();
        b.vel.addScaledVector(dir, 0.6).addScaledVector(vel, 0.35 / Math.max(b.mass, 0.1) * 0.3);
        b.wake();
      }
    }
  }

  // Desperta/dorme corpos por proximidade ao jogador (economiza CPU).
  updateActivity(center, radius) {
    this.center.copy(center); this.activeRadius = radius;
    for (const b of this.bodies) {
      if (!b.active) continue;
      const d = Math.hypot(b.pos.x - center.x, b.pos.z - center.z);
      b.mesh.visible = d < radius * 3 || b.kind === 'money';
    }
  }

  nearest(point, maxDist, filter) {
    let best = null, bd = maxDist;
    for (const b of this.bodies) {
      if (!b.active || b.held) continue;
      if (filter && !filter(b)) continue;
      const dx = Math.max(Math.abs(point.x - b.pos.x) - b.half.x, 0);
      const dy = Math.max(Math.abs(point.y - b.pos.y) - b.half.y, 0);
      const dz = Math.max(Math.abs(point.z - b.pos.z) - b.half.z, 0);
      const d = Math.hypot(dx, dy, dz);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
}
