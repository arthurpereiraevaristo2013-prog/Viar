// Interação mão -> mundo: pinçar/agarrar objetos, soltar com inércia, empurrar com os dedos,
// apertar botões com o indicador, puxar a gaveta e pegar dinheiro dos dispensadores.
import * as THREE from 'three';
import { Body } from './physics.js';
import { moneyMesh } from './world.js';

const V = () => new THREE.Vector3();

export class Interaction {
  constructor({ scene, physics, world, hands3d, rig, audio, onButton, onGrab, onRelease }) {
    Object.assign(this, { scene, physics, world, hands3d, rig, audio, onButton, onGrab, onRelease });
    this.state = {
      left: this._newHand(), right: this._newHand()
    };
    this.armScale = 1.6;
    this.prompt = '';
  }
  _newHand() {
    return {
      pinch: V(), palm: V(), tip: V(), tipDir: V(), prevPinch: V(), vel: V(), prevTip: V(), tipVel: V(),
      held: null, holdAnchor: 'pinch', offset: V(), drawerGrab: null, hover: null, wasPinching: false, valid: false, hoverBody: null
    };
  }

  // converte coordenadas locais da mão (espaço da cabeça) para mundo
  _toWorld(hand3d, local, out) { return hand3d.group.localToWorld(out.copy(local)); }

  update(dt, handStates) {
    this.rig.camera.updateMatrixWorld(true);
    let prompt = '';
    for (const side of ['left', 'right']) {
      const hs = handStates[side], h3 = this.hands3d[side], st = this.state[side];
      // posiciona o grupo da mão (aumenta o alcance do braço virtual)
      if (hs.opacity > 0.02) {
        const w = hs.joints[0];
        h3.group.position.set(w.x * (this.armScale - 1), w.y * (this.armScale - 1), w.z * (this.armScale - 1));
        h3.group.updateMatrixWorld(true);
      }
      st.valid = hs.visible && hs.opacity > 0.3;
      const J = hs.joints;
      const lp = new THREE.Vector3(), lc = new THREE.Vector3(), lt = new THREE.Vector3();
      lp.set((J[4].x + J[8].x) / 2, (J[4].y + J[8].y) / 2, (J[4].z + J[8].z) / 2);
      lc.set((J[0].x + J[9].x) / 2, (J[0].y + J[9].y) / 2, (J[0].z + J[9].z) / 2);
      lt.set(J[8].x, J[8].y, J[8].z);
      this._toWorld(h3, lp, st.pinch); this._toWorld(h3, lc, st.palm); this._toWorld(h3, lt, st.tip);
      // velocidades (para arremesso e empurrão)
      if (st.prevPinch.lengthSq() > 0 && dt > 0) {
        const nv = st.pinch.clone().sub(st.prevPinch).divideScalar(dt);
        st.vel.lerp(nv, 0.35);
        const nt = st.tip.clone().sub(st.prevTip).divideScalar(dt); st.tipVel.lerp(nt, 0.4);
      }
      st.prevPinch.copy(st.pinch); st.prevTip.copy(st.tip);
      if (!st.valid) { if (st.held) this._release(st, true); st.drawerGrab = null; continue; }

      const g = hs.gesture;
      const holding = g.pinching || g.grabbing;

      // ---- soltar ----
      if (st.held && !holding) this._release(st);
      if (st.drawerGrab && !holding) st.drawerGrab = null;

      // ---- agarrar ----
      st.hoverBody = null;
      if (!st.held && !st.drawerGrab) {
        const anchorPt = g.grabbing ? st.palm : st.pinch;
        const reach = g.grabbing ? 0.11 : 0.065;
        const cand = this.physics.nearest(anchorPt, reach, (b) => b.kind === 'product' || b.kind === 'money');
        // dica visual: objeto próximo da mão
        const hint = this.physics.nearest(st.pinch, 0.09, (b) => b.kind === 'product' || b.kind === 'money');
        st.hoverBody = hint;
        if (holding && !st.wasPinching) {
          if (cand) this._grab(st, cand, g.grabbing ? 'palm' : 'pinch', anchorPt, side);
          else if (this._tryDispense(st, anchorPt)) { /* pegou nota */ }
          else if (this._tryDrawerGrab(st, anchorPt)) { /* gaveta */ }
        }
      }
      st.wasPinching = holding;

      // ---- carregar ----
      if (st.held) this._carry(st, dt, g);

      // ---- gaveta (arrastar) ----
      if (st.drawerGrab) {
        const d = this.world.drawer;
        const target = st.drawerGrab.ext0 + (st.pinch.z - st.drawerGrab.z0);
        const prev = d.open;
        d.setExt(target);
        if (d.open !== prev) this.audio.drawer(this.world.drawerWorld(V()), d.open);
      } else if (!st.held) {
        // empurrar a gaveta fechando
        const d = this.world.drawer;
        if (d.ext > 0.01) {
          const hp = this.world.drawerWorld(V());
          if (st.tip.distanceTo(hp) < 0.1 && st.tipVel.z < -0.15 && !g.pinching) { const prev = d.open; d.setExt(d.ext + st.tipVel.z * dt * 1.2); if (prev && !d.open) this.audio.drawer(hp, false); }
        }
      }

      // ---- botões (dedo indicador) ----
      for (const b of this.world.buttons) {
        const d = Math.hypot(st.tip.x - b.pos.x, st.tip.z - b.pos.z);
        const dy = st.tip.y - b.pos.y;
        const hit = d < b.radius && dy < 0.025 && dy > -0.03 && !g.grabbing;
        if (hit && b.state === 0 && b.cool <= 0) { b.state = 1; b.cool = 0.45; this.audio.click(b.pos); this.onButton?.(b.name, side); }
        if (hit) b.hover = true;
        if (!hit && b.state === 1 && d > b.radius * 1.4) b.state = 0;
      }

      // ---- empurrar objetos com os dedos / palma ----
      if (!st.held && !st.drawerGrab) {
        const sp = st.tipVel.length();
        if (sp > 0.25) this.physics.pushFrom(st.tip, 0.022, st.tipVel, (b) => b.kind !== 'held');
        const palmSp = st.vel.length();
        if (palmSp > 0.3 && !g.pinching) this.physics.pushFrom(st.palm, 0.05, st.vel);
      }

      // ---- prompt contextual ----
      if (st.hoverBody && !st.held) prompt = st.hoverBody.kind === 'money' ? 'Pince para pegar o dinheiro' : `Pince para pegar: ${st.hoverBody.data.name || st.hoverBody.data.key}`;
    }
    for (const b of this.world.buttons) {
      b.cool = Math.max(0, b.cool - dt);
      if (!b.hover && b.state === 1 && b.cool <= 0) b.state = 0;
      const target = b.state === 1 ? 1 : 0;
      b.pressed += (target - b.pressed) * Math.min(1, dt * 20);
      b.mesh.position.y = b.base - b.travel * 0.6 * b.pressed;
      b.hover = false;
    }
    this.prompt = prompt;
  }

  _grab(st, body, anchor, point, side) {
    st.held = body; st.holdAnchor = anchor; body.held = side; body.wake();
    st.offset.copy(body.pos).sub(point);
    if (st.offset.length() > 0.14) st.offset.setLength(0.14);
    this.audio.grab(body.pos); this.onGrab?.(body, side);
  }

  _carry(st, dt, g) {
    const b = st.held;
    // se trocar pinça<->punho, reancora
    const anchorPt = g.grabbing ? st.palm : st.pinch;
    const target = anchorPt.clone().add(st.offset);
    const k = 1 - Math.exp(-dt * 35);
    const prev = b.pos.clone();
    b.pos.lerp(target, k);
    b.vel.set(0, 0, 0);
    this.physics._collideStatics(b);       // não atravessa balcão/prateleiras
    b.mesh.position.copy(b.pos);
    // inclina levemente seguindo a velocidade
    b.mesh.rotation.x += (-0.0 - b.mesh.rotation.x) * 0.2; b.mesh.rotation.z += (0 - b.mesh.rotation.z) * 0.2;
    b._carryVel = b.pos.clone().sub(prev).divideScalar(Math.max(dt, 1e-3));
  }

  _release(st, lost = false) {
    const b = st.held; if (!b) return;
    st.held = null; b.held = null; b.wake();
    const v = (b._carryVel || st.vel).clone();
    if (lost) v.multiplyScalar(0.3);
    if (v.length() > 4) v.setLength(4);
    b.vel.copy(v);
    this.audio.release(b.pos); this.onRelease?.(b);
  }

  _tryDispense(st, point) {
    const d = this.world.drawer;
    if (!d.open) return false;
    d.group.updateWorldMatrix(true, false);
    for (const disp of d.dispensers) {
      const wp = disp.local.clone().applyMatrix4(d.group.matrixWorld);
      if (point.distanceTo(wp) < 0.09) {
        const { mesh, half } = moneyMesh(disp.value);
        mesh.position.copy(wp); this.scene.add(mesh);
        const body = new Body(mesh, half, { mass: 0.02, restitution: 0.05, friction: 0.95, kind: 'money', data: { value: disp.value, key: 'R$ ' + disp.value, fromDrawer: true } });
        body.pos.copy(wp); this.physics.add(body);
        this._grab(st, body, 'pinch', point, st === this.state.left ? 'left' : 'right');
        this.audio.coin(wp);
        return true;
      }
    }
    return false;
  }

  _tryDrawerGrab(st, point) {
    const d = this.world.drawer;
    const hp = this.world.drawerWorld(V());
    if (point.distanceTo(hp) < 0.1) { st.drawerGrab = { ext0: d.ext, z0: point.z }; this.audio.click(hp); return true; }
    return false;
  }

  releaseAll() { for (const s of Object.values(this.state)) { if (s.held) this._release(s, true); s.drawerGrab = null; } }
}
