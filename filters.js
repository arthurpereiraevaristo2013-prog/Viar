// Filtro One Euro (Casiez et al. 2012): suaviza muito quando a mão está parada (sem tremor)
// e quase nada quando se move rápido (sem atraso perceptível).

function alpha(cutoff, dt) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

export class LowPass {
  constructor() { this.y = null; }
  filter(x, a) { this.y = this.y === null ? x : a * x + (1 - a) * this.y; return this.y; }
  reset() { this.y = null; }
}

export class OneEuro {
  constructor({ minCutoff = 1.2, beta = 0.05, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff;
    this.x = new LowPass(); this.dx = new LowPass(); this.last = null; this.prevRaw = null;
  }
  filter(v, t) { // t em segundos
    if (this.last === null) { this.last = t; this.prevRaw = v; this.x.filter(v, 1); this.dx.filter(0, 1); return v; }
    const dt = Math.max(1e-3, t - this.last);
    this.last = t;
    const dvRaw = (v - this.prevRaw) / dt;
    this.prevRaw = v;
    const edv = this.dx.filter(dvRaw, alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edv);
    return this.x.filter(v, alpha(cutoff, dt));
  }
  reset() { this.x.reset(); this.dx.reset(); this.last = null; this.prevRaw = null; }
}

// Conjunto de filtros para N pontos 3D (ex.: 21 landmarks da mão).
export class PointSetFilter {
  constructor(n, opts) {
    this.fs = Array.from({ length: n * 3 }, () => new OneEuro(opts));
    this.n = n;
  }
  setParams(minCutoff, beta) { for (const f of this.fs) { f.minCutoff = minCutoff; f.beta = beta; } }
  // pts: array de {x,y,z}; devolve nova array
  filter(pts, t) {
    const out = new Array(this.n);
    for (let i = 0; i < this.n; i++) {
      const p = pts[i];
      out[i] = {
        x: this.fs[i * 3].filter(p.x, t),
        y: this.fs[i * 3 + 1].filter(p.y, t),
        z: this.fs[i * 3 + 2].filter(p.z, t)
      };
    }
    return out;
  }
  reset() { for (const f of this.fs) f.reset(); }
}

// Mapeia o controle "suavização" (0..1) para parâmetros do One Euro.
export function smoothingParams(s) {
  const minCutoff = 3.0 - 2.5 * s;      // 3.0 (pouca suavização) .. 0.5 (muita)
  const beta = 0.02 + 0.10 * (1 - s) + 0.02; // reage mais rápido quando s é baixo
  return { minCutoff, beta };
}
