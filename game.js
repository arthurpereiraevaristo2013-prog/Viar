// Laço do jogo: clientes (NPCs), pedidos, entrega, cobrança, dinheiro/troco, pontuação, monitor e HUD.
import * as THREE from 'three';
import { NPC, ARCHETYPES } from './npc.js';
import { PRODUCTS, PRODUCT_KEYS, moneyMesh } from './world.js';
import { Body } from './physics.js';
import { Interaction } from './interaction.js';
import { qualityProfile, settings } from './settings.js';

const inBox = (p, b) => p.x >= b.min.x && p.x <= b.max.x && p.y >= b.min.y - 0.02 && p.y <= b.max.y && p.z >= b.min.z && p.z <= b.max.z;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const fmt = (v) => 'R$ ' + v;

export class Game {
  constructor({ scene, physics, world, rig, audio, hands3d, tracker }) {
    Object.assign(this, { scene, physics, world, rig, audio, hands3d, tracker });
    this.customers = [];
    this.stats = { served: 0, money: 0, tips: 0, lost: 0, rating: 5.0, combo: 0, ratingN: 0 };
    this.till = 0;
    this.spawnT = 2.5; this.uid = 0;
    this.hint = ''; this.msg = ''; this.msgT = 0;
    this.monitorDirty = true; this.monitorT = 0;
    this.thumbT = 0; this.running = false; this.time = 0;
    this.interaction = new Interaction({
      scene, physics, world, hands3d, rig, audio,
      onButton: (name) => this.onButton(name),
      onGrab: (b) => { b.sleeping = false; },
      onRelease: (b) => this.onRelease(b)
    });
    this.physics.onImpact = (b, v) => this.audio.thud(b.pos.clone(), v);
    this._bag = [];
    this._makeHud();
    this.queueMax = qualityProfile().npcMax;
  }

  // ---------- HUD flutuante (dentro do campo de visão, discreto) ----------
  _makeHud() {
    const c = document.createElement('canvas'); c.width = 768; c.height = 128; this.hud = { c, last: '' };
    this.hud.t = new THREE.CanvasTexture(c); this.hud.t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.hud.t, transparent: true, depthTest: false, depthWrite: false, opacity: 0.92 }));
    sp.scale.set(0.9, 0.15, 1); sp.position.set(0, -0.3, -1.1); sp.renderOrder = 1000; this.rig.camera.add(sp); this.hud.sprite = sp;
  }
  _drawHud() {
    const s = this.stats;
    const l1 = `${fmt(s.money + s.tips)}  ·  ${s.served} atendidos  ·  ★ ${s.rating.toFixed(1)}`;
    const l2 = this.msgT > 0 ? this.msg : this.hint;
    const key = l1 + '|' + l2; if (key === this.hud.last) return; this.hud.last = key;
    const g = this.hud.c.getContext('2d'); g.clearRect(0, 0, 768, 128);
    g.fillStyle = 'rgba(8,12,30,.62)'; g.beginPath(); g.roundRect(6, 6, 756, 116, 26); g.fill();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffd23f'; g.font = 'bold 40px system-ui, sans-serif'; g.fillText(l1, 384, 38, 730);
    g.fillStyle = '#dff6ff'; g.font = '34px system-ui, sans-serif'; g.fillText(l2, 384, 90, 730);
    this.hud.t.needsUpdate = true;
  }
  toast(m, t = 3) { this.msg = m; this.msgT = t; }

  start() { this.running = true; this.spawnT = 1.5; this.toast('Olhe para a esquerda/direita: prateleiras. Pince para pegar.', 6); }

  // ---------- clientes ----------
  makeOrder(arch) {
    const n = 1 + Math.floor(Math.random() * 3) + (Math.random() < 0.25 ? 1 : 0);
    const items = {}; let total = 0;
    for (let i = 0; i < n; i++) {
      const key = pick(PRODUCT_KEYS); const price = PRODUCTS[key].price;
      if (total + price > 45) continue;
      items[key] = (items[key] || 0) + 1; total += price;
    }
    if (!total) { items.apple = 1; total = PRODUCTS.apple.price; }
    const bills = arch.bills.filter(b => b >= total).sort((a, b) => a - b);
    const pay = bills.length ? bills[0] : 50;
    return { items, total, pay, change: pay - total };
  }

  spawnCustomer() {
    const arch = pick(ARCHETYPES.filter(a => !this.customers.some(c => c.arch === a)) .concat(ARCHETYPES));
    const npc = new NPC(arch, this.scene, settings.quality);
    npc.root.position.copy(this.world.spawn); npc.root.position.z = this.world.spawn.z;
    npc.faceYaw = 0; npc.yaw = 0;
    const order = this.makeOrder(arch);
    const c = { id: ++this.uid, npc, arch, order, delivered: {}, state: 'entering', patience: arch.patience, maxPatience: arch.patience, paid: 0, changeGiven: 0, money: [], consuming: [], warned: new Set(), t: 0, announced: false, charged: false };
    this.customers.push(c);
    npc.walkTo([new THREE.Vector3(0, 0, -5.0), this.slotFor(this.customers.length - 1)]);
    npc.armMode = 'swing'; this.audio.door(new THREE.Vector3(0, 2, -6));
  }
  slotFor(i) { return this.world.queue[Math.min(i, this.world.queue.length - 1)]; }

  get active() { return this.customers.find(c => ['ordering', 'waiting_items', 'paying', 'waiting_change'].includes(c.state)) || null; }

  // ---------- botões do computador / sino ----------
  onButton(name) {
    const c = this.active;
    if (name === 'bell' || name === 'next') {
      this.audio.beep(this.world.monitorPos);
      if (this.customers.length < this.queueMax) { this.spawnT = 0; this.toast('Chamando próximo cliente…', 2); }
      else this.toast('Já há clientes suficientes na loja.', 2);
    } else if (name === 'help') {
      this.toast('Pegue os itens (pinça) → ENTREGAR → COBRAR → dinheiro na gaveta → troco', 7);
    } else if (name === 'clear') {
      this.audio.beep(this.world.monitorPos); this.toast('Visor limpo.', 1.5); this.monitorDirty = true;
    } else if (name === 'charge') {
      if (!c) { this.audio.fail(); this.toast('Nenhum cliente no balcão.', 2); return; }
      if (c.state === 'waiting_items') { this.audio.fail(); this.toast('Faltam itens do pedido.', 2.5); return; }
      if (c.state === 'paying') {
        if (!c.charged) { c.charged = true; this.world.drawer.setExt(this.world.drawer.max); this.audio.cash(this.world.drawerWorld()); this.toast(`Coloque o dinheiro do cliente na gaveta (${fmt(c.order.pay)}).`, 5); }
        else this.toast('Guarde o dinheiro na gaveta.', 2);
      } else if (c.state === 'waiting_change') { this.toast(`Troco: ${fmt(c.order.change)}. Pegue notas na gaveta.`, 3); }
      this.monitorDirty = true;
    }
  }

  onRelease(b) {
    if (b.kind !== 'product') return;
    // entregue diretamente na mão do cliente
    const c = this.active; if (!c || c.state !== 'waiting_items') return;
    const hp = c.npc.handWorld();
    if (b.pos.distanceTo(hp) < 0.55) { this.deliver(c, b); }
  }

  deliver(c, b) {
    const key = b.data.key; const need = (c.order.items[key] || 0) - (c.delivered[key] || 0);
    if (need <= 0) {
      if (!c.warned.has(b)) { c.warned.add(b); c.npc.say([`Não pedi ${PRODUCTS[key].name}`], '#ffd1d1'); this.audio.voice(c.npc.root.position.clone().setY(1.5), c.arch.pitch, -1); c.npc.talkT = 0.8; this.audio.fail(); c._sayT = 2.5; }
      return false;
    }
    c.delivered[key] = (c.delivered[key] || 0) + 1;
    b.active = false; b.held = null; this.physics.remove(b);
    c.consuming.push({ mesh: b.mesh, t: 0, from: b.mesh.position.clone() });
    this.audio.scan(b.pos.clone()); this.audio.coin(b.pos.clone());
    this.monitorDirty = true;
    return true;
  }

  // ---------- atualização por quadro ----------
  update(dt, handStates) {
    this.time += dt;
    if (!this.running) return;
    this.world.update(dt, this.time);
    this.interaction.update(dt, handStates);
    this.physics.updateActivity(this.rig.camera.getWorldPosition(new THREE.Vector3()), qualityProfile().physicsRadius);
    this.physics.step(dt);
    // gesto de centralizar: polegar para cima por 1,2 s
    let thumbs = false; for (const s of ['left', 'right']) { const h = handStates[s]; if (h.visible && h.gesture.name === 'thumbs') thumbs = true; }
    this.thumbT = thumbs ? this.thumbT + dt : 0;
    if (this.thumbT > 1.2) { this.rig.recenter(); this.thumbT = -2; this.toast('Visão centralizada 👍', 2); }
    if (this.thumbT < 0) this.thumbT = Math.min(0, this.thumbT + dt * 1);

    // spawn
    this.spawnT -= dt;
    if (this.spawnT <= 0) { if (this.customers.length < this.queueMax) this.spawnCustomer(); this.spawnT = 12 + Math.random() * 10; }

    this.updateCustomers(dt);
    this.updateDeliveries(dt);
    this.updateDrawerMoney();

    // porta
    let near = false; const dp = new THREE.Vector3(0, 0, -6);
    for (const c of this.customers) { const p = c.npc.root.position; if (Math.hypot(p.x - dp.x, p.z - dp.z) < 2.2) near = true; }
    const moved = this.world.door.update(dt, near);

    // áudio 3D: ouvinte
    const cam = this.rig.camera; const pos = cam.getWorldPosition(new THREE.Vector3());
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion())); this.audio.setListener(pos, fwd, new THREE.Vector3(0, 1, 0));

    // HUD / monitor
    this.msgT = Math.max(0, this.msgT - dt);
    this.hint = this.computeHint(handStates);
    this._drawHud();
    this.monitorT -= dt; if (this.monitorT <= 0 || this.monitorDirty) { this.monitorT = 0.3; this.drawMonitor(); this.monitorDirty = false; }
    this.updateRegister();
  }

  computeHint(hs) {
    const ip = this.interaction.prompt; if (ip) return ip;
    const c = this.active; if (!c) return this.customers.length ? 'Cliente chegando…' : 'Aperte PRÓXIMO ou o sino para chamar cliente';
    if (c.state === 'waiting_items') return 'Pegue os itens do pedido e coloque em ENTREGAR';
    if (c.state === 'paying') return c.charged ? 'Pegue o dinheiro e coloque na gaveta aberta' : 'Aperte COBRAR no computador';
    if (c.state === 'waiting_change') return `Dê o troco exato: ${fmt(c.order.change)} (notas da gaveta → TROCO)`;
    return '';
  }

  updateCustomers(dt) {
    const W = this.world; const npcs = this.customers.map(c => c.npc);
    this.customers.forEach((c, idx) => {
      const n = c.npc; c.t += dt;
      const prevState = c.state;
      const myPlace = c.state === 'leaving' ? null : this.slotFor(this.customers.filter(x => x.state !== 'leaving').indexOf(c));
      switch (c.state) {
        case 'entering': {
          if (n.atTarget) { if (this.customers.filter(x => x.state !== 'leaving').indexOf(c) === 0) { c.state = 'ordering'; c.t = 0; } else { c.state = 'queued'; } }
          break;
        }
        case 'queued': {
          const i = this.customers.filter(x => x.state !== 'leaving').indexOf(c);
          const slot = this.slotFor(i);
          if (n.atTarget && Math.hypot(n.root.position.x - slot.x, n.root.position.z - slot.z) > 0.25) n.walkTo([slot]);
          n.faceTowards(new THREE.Vector3(0, 0, -0));
          if (i === 0 && n.atTarget) { c.state = 'ordering'; c.t = 0; }
          c.patience -= dt * 0.25;
          break;
        }
        case 'ordering': {
          n.faceTowards(new THREE.Vector3(0, 0, 0)); n.lookYaw = 0; n.lookPitch = 0.1;
          if (!c.announced) {
            c.announced = true; n.armMode = 'wave';
            const lines = Object.entries(c.order.items).map(([k, q]) => `${q}x ${PRODUCTS[k].name}`);
            n.say(['Olá! Quero:'].concat(lines)); n.talkT = 2; this.audio.voice(n.root.position.clone().setY(1.5), c.arch.pitch, 1);
            this.audio.door(new THREE.Vector3(0, 2, -1.5)); n.setMood(0.6); this.monitorDirty = true;
          }
          if (c.t > 2.2) { n.armMode = 'swing'; c.state = 'waiting_items'; c.t = 0; }
          break;
        }
        case 'waiting_items': {
          n.faceTowards(new THREE.Vector3(0, 0, 0)); n.armMode = c.t % 9 > 6 ? 'cross' : 'swing';
          const left = Object.entries(c.order.items).reduce((a, [k, q]) => a + q - (c.delivered[k] || 0), 0);
          c.patience -= dt;
          this.moodByPatience(c);
          if (left === 0 && !c.consuming.length) {
            c.state = 'paying'; c.t = 0; n.armMode = 'offer'; n.setMood(0.5);
            n.say([`Total: ${fmt(c.order.total)}`, `Pago com ${fmt(c.order.pay)}`]); n.talkT = 1.5; this.audio.voice(n.root.position.clone().setY(1.5), c.arch.pitch, 1);
            this.audio.success(); this.monitorDirty = true;
            this.spawnMoney(c, c.order.pay);
          }
          if (c._sayT) { c._sayT -= dt; if (c._sayT <= 0) { c._sayT = 0; n.hush(); } }
          break;
        }
        case 'paying': {
          n.faceTowards(new THREE.Vector3(0, 0, 0));
          if (c.t > 2) n.armMode = 'swing';
          c.patience -= dt * 0.5; this.moodByPatience(c);
          if (c.paid >= c.order.pay) {
            if (c.order.change > 0) { c.state = 'waiting_change'; c.t = 0; n.say(['Meu troco,', `por favor: ${fmt(c.order.change)}`]); n.armMode = 'receive'; n.talkT = 1.6; this.audio.voice(n.root.position.clone().setY(1.5), c.arch.pitch, 0); this.monitorDirty = true; }
            else this.finish(c, true);
          }
          break;
        }
        case 'waiting_change': {
          n.faceTowards(new THREE.Vector3(0, 0, 0));
          c.patience -= dt * 0.6; this.moodByPatience(c);
          const sum = this.sumChange(c);
          if (sum === c.order.change) { this.consumeChange(c); this.finish(c, true); }
          else if (sum > c.order.change && !c._over) { c._over = true; n.say(['Troco demais!', 'Tire o excesso.'], '#ffe9a8'); this.audio.fail(); }
          else if (sum <= c.order.change) { c._over = false; }
          break;
        }
        case 'thanks': {
          if (c.t > 1.6) { c.state = 'leaving'; n.hush(); n.armMode = 'swing'; n.walkTo([new THREE.Vector3(0, 0, -5.0), W.exit]); }
          break;
        }
        case 'leaving': {
          if (n.atTarget) { c.state = 'gone'; }
          break;
        }
      }
      // paciência esgotada
      if (['waiting_items', 'paying', 'waiting_change', 'queued'].includes(c.state) && c.patience <= 0) this.finish(c, false);
      // olhar para o jogador
      if (['waiting_items', 'paying', 'waiting_change', 'ordering', 'thanks'].includes(c.state)) { n.lookYaw = 0; n.lookPitch = 0.08; }
      else { n.lookYaw = 0; n.lookPitch = 0; }
      n.update(dt, this.audio, npcs);
    });
    // reorganiza fila
    const live = this.customers.filter(x => x.state !== 'leaving' && x.state !== 'gone');
    live.forEach((c, i) => {
      if (['queued', 'entering'].includes(c.state) && c.npc.atTarget) { const slot = this.slotFor(i); if (Math.hypot(c.npc.root.position.x - slot.x, c.npc.root.position.z - slot.z) > 0.25) c.npc.walkTo([slot]); }
    });
    for (const c of this.customers.filter(x => x.state === 'gone')) { c.npc.dispose(); for (const m of c.money) { if (m.active) { m.active = false; this.physics.remove(m); this.scene.remove(m.mesh); } } }
    this.customers = this.customers.filter(c => c.state !== 'gone');
  }

  moodByPatience(c) {
    const r = c.patience / c.maxPatience;
    c.npc.setMood(r > 0.55 ? 0.4 : r > 0.25 ? 0 : -1);
    if (r < 0.25 && c.npc.armMode !== 'offer' && c.npc.armMode !== 'receive') c.npc.armMode = 'cross';
  }

  finish(c, ok) {
    const n = c.npc;
    if (ok) {
      const r = Math.max(0, c.patience / c.maxPatience); const tip = Math.round(r * 5);
      this.stats.served++; this.stats.money += c.order.total; this.stats.tips += tip; this.stats.combo++;
      const stars = 3 + r * 2; this.stats.ratingN++; this.stats.rating = (this.stats.rating * (this.stats.ratingN - 1) + stars) / this.stats.ratingN;
      n.setMood(1); n.armMode = 'cheer'; n.say(['Obrigado!', tip ? `Gorjeta ${fmt(tip)}` : 'Até logo!'], '#c8ffd9'); n.talkT = 1.4;
      this.audio.voice(n.root.position.clone().setY(1.5), c.arch.pitch, 1); this.audio.success(); this.audio.cash(this.world.drawerWorld());
      this.world.drawer.setExt(0); this.toast(`Venda concluída: ${fmt(c.order.total)}${tip ? ' + gorjeta ' + fmt(tip) : ''}`, 3);
      c.state = 'thanks'; c.t = 0;
    } else {
      this.stats.lost++; this.stats.combo = 0; this.stats.ratingN++; this.stats.rating = (this.stats.rating * (this.stats.ratingN - 1) + 1.5) / this.stats.ratingN;
      n.setMood(-1); n.armMode = 'cross'; n.say(['Cansei de esperar!', 'Vou embora.'], '#ffd1d1'); n.talkT = 1.4; this.audio.voice(n.root.position.clone().setY(1.5), c.arch.pitch, -1); this.audio.fail();
      this.toast(`${n.name} foi embora irritado(a).`, 3);
      c.state = 'thanks'; c.t = 0;
      // devolve itens/dinheiro pendente
      for (const m of c.money) { if (m.active && !m.held) { m.active = false; this.physics.remove(m); this.scene.remove(m.mesh); } }
    }
    this.monitorDirty = true;
  }

  spawnMoney(c, value) {
    const { mesh, half } = moneyMesh(value);
    const x = -0.2 + Math.random() * 0.2, z = this.world.counter.z - 0.14;
    mesh.position.set(x, this.world.counter.h + 0.12, z); mesh.rotation.y = (Math.random() - 0.5) * 0.6; this.scene.add(mesh);
    const b = new Body(mesh, half, { mass: 0.02, restitution: 0.05, friction: 0.95, kind: 'money', data: { value, key: fmt(value), customer: c.id } });
    b.pos.copy(mesh.position); this.physics.add(b); c.money.push(b); this.audio.coin(mesh.position.clone());
  }

  sumChange(c) {
    let s = 0; c._chg = [];
    for (const b of this.physics.bodies) {
      if (b.kind !== 'money' || !b.active || b.held || !b.data.fromDrawer) continue;
      if (inBox(b.pos, this.world.changeZone)) { s += b.data.value; c._chg.push(b); }
    }
    c.changeGiven = s; return s;
  }
  consumeChange(c) { for (const b of c._chg || []) { b.active = false; this.physics.remove(b); this.scene.remove(b.mesh); } c._chg = []; }

  // consumo animado dos produtos entregues + detecção na zona de entrega
  updateDeliveries(dt) {
    const c = this.active;
    for (const cu of this.customers) {
      cu.consuming = cu.consuming.filter(k => {
        k.t += dt * 3; const p = cu.npc.root.position;
        const target = new THREE.Vector3(p.x, 1.15, p.z);
        k.mesh.position.lerpVectors(k.from, target, Math.min(1, k.t)); k.mesh.scale.setScalar(Math.max(0.01, 1 - k.t * 0.8));
        if (k.t >= 1) { this.scene.remove(k.mesh); return false; } return true;
      });
    }
    if (!c || c.state !== 'waiting_items') return;
    for (const b of this.physics.bodies) {
      if (b.kind !== 'product' || !b.active || b.held) continue;
      if (inBox(b.pos, this.world.deliveryZone) && (b.onGround || b.sleeping || b.vel.lengthSq() < 0.05)) this.deliver(c, b);
    }
    // aviso para itens errados repetidos
    this.world.zoneMark.material.opacity = 0.12 + 0.06 * Math.sin(this.time * 4);
  }

  // dinheiro recebido pelo caixa: nota solta dentro da gaveta aberta
  updateDrawerMoney() {
    const d = this.world.drawer; if (!d.open) return;
    const z = this.world.drawerZone();
    for (const b of this.physics.bodies) {
      if (b.kind !== 'money' || !b.active || b.held || b.data.fromDrawer) continue;
      if (inBox(b.pos, z)) {
        const c = this.customers.find(x => x.id === b.data.customer);
        b.active = false; this.physics.remove(b); this.scene.remove(b.mesh);
        this.audio.cash(this.world.drawerWorld()); this.till += b.data.value;
        if (c) { c.paid += b.data.value; this.monitorDirty = true; }
        this.toast(`Recebido ${fmt(b.data.value)}`, 2);
      }
    }
  }

  updateRegister() {
    const c = this.active; const W = this.world;
    if (!c) { W.setRegDisplay(fmt(this.till), 'CAIXA'); return; }
    const total = Object.entries(c.delivered).reduce((a, [k, q]) => a + PRODUCTS[k].price * q, 0);
    if (c.state === 'waiting_items' || c.state === 'ordering') W.setRegDisplay(fmt(total), 'ITENS');
    else if (c.state === 'paying') W.setRegDisplay(fmt(c.order.total), c.charged ? 'RECEBER ' + fmt(c.order.pay) : 'COBRAR');
    else if (c.state === 'waiting_change') W.setRegDisplay(fmt(c.order.change), `TROCO ${fmt(c.changeGiven)}`);
  }

  drawMonitor() {
    const g = this.world.monitor.c.getContext('2d'); const W = 512, H = 300;
    const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#102050'); grd.addColorStop(1, '#0a1330'); g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.fillStyle = '#1f3a8a'; g.fillRect(0, 0, W, 34); g.fillStyle = '#fff'; g.font = 'bold 20px system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('VR MARKET · CAIXA', 12, 18);
    g.textAlign = 'right'; g.fillText(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), W - 12, 18);
    const c = this.active;
    g.textAlign = 'left';
    if (!c) {
      g.fillStyle = '#9fb4ff'; g.font = '24px system-ui, sans-serif'; g.fillText(this.customers.length ? 'Aguardando cliente…' : 'Sem clientes. Aperte PRÓXIMO.', 14, 80);
    } else {
      g.fillStyle = '#ffd23f'; g.font = 'bold 24px system-ui, sans-serif'; g.fillText(`${c.npc.name} (${c.arch.desc})`, 14, 56);
      // barra de paciência
      const r = Math.max(0, c.patience / c.maxPatience);
      g.fillStyle = '#243060'; g.fillRect(W - 170, 44, 150, 14); g.fillStyle = r > 0.5 ? '#46d37a' : r > 0.25 ? '#ffd23f' : '#ff5a5a'; g.fillRect(W - 170, 44, 150 * r, 14);
      g.font = '22px system-ui, sans-serif'; let y = 90;
      for (const [k, q] of Object.entries(c.order.items)) {
        const got = c.delivered[k] || 0; const ok = got >= q;
        g.fillStyle = ok ? '#7dffb0' : '#e6edff'; g.fillText(`${ok ? '✔' : '•'} ${PRODUCTS[k].emoji} ${PRODUCTS[k].name}  ${got}/${q}`, 18, y);
        g.textAlign = 'right'; g.fillText(fmt(PRODUCTS[k].price * q), W - 18, y); g.textAlign = 'left'; y += 30;
      }
      g.fillStyle = '#34437e'; g.fillRect(14, 218, W - 28, 2);
      g.fillStyle = '#fff'; g.font = 'bold 26px system-ui, sans-serif'; g.fillText(`TOTAL ${fmt(c.order.total)}`, 18, 242);
      g.font = '20px system-ui, sans-serif'; g.fillStyle = '#9fb4ff';
      let st = '';
      if (c.state === 'ordering') st = 'Anotando pedido…'; else if (c.state === 'waiting_items') st = 'Entregue os itens no balcão';
      else if (c.state === 'paying') st = c.charged ? `Receba ${fmt(c.order.pay)} na gaveta` : 'Aperte COBRAR';
      else if (c.state === 'waiting_change') st = `Troco ${fmt(c.order.change)} (entregue ${fmt(c.changeGiven)})`;
      g.fillText(st, 18, 274);
    }
    g.fillStyle = '#0d1a4a'; g.fillRect(0, H - 22, W, 22); g.fillStyle = '#7dffb0'; g.font = '14px monospace'; g.textAlign = 'left';
    g.fillText(`Vendas ${this.stats.served}  Caixa ${fmt(this.till)}  Gorjetas ${fmt(this.stats.tips)}  ★${this.stats.rating.toFixed(1)}`, 10, H - 11);
    this.world.monitor.t.needsUpdate = true;
  }
}
