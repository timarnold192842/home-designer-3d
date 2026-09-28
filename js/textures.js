import * as THREE from 'three';
import { seeded } from './util.js';

// Procedural canvas textures. Each entry: [canvas px, tile size in feet (w,h), draw fn]. UVs are in feet everywhere.
const cache = new Map();
const canvases = new Map();

function noise(ctx, w, h, rnd, amt, alpha = 0.08, size = 1) {
  for (let i = 0; i < amt; i++) {
    const v = rnd() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * rnd()})`;
    ctx.fillRect(rnd() * w, rnd() * h, size, size);
  }
}
const jitter = (hex, rnd, amt = 0.12) => {
  const c = new THREE.Color(hex);
  const k = 1 + (rnd() - 0.5) * 2 * amt;
  return `rgb(${Math.min(255, c.r * 255 * k) | 0},${Math.min(255, c.g * 255 * k) | 0},${Math.min(255, c.b * 255 * k) | 0})`;
};

const GEN = {
  brick: [512, [2.667, 2.667], (ctx, n, rnd, o) => {
    ctx.fillStyle = o.mortar || '#b9b2a6'; ctx.fillRect(0, 0, n, n);
    const cw = n / 4, ch = n / 12, m = n / 110;
    for (let r = 0; r < 12; r++) for (let c = -1; c < 5; c++) {
      const x = c * cw + (r % 2 ? cw / 2 : 0);
      ctx.fillStyle = jitter(o.color || '#8c4a35', rnd, 0.16);
      ctx.fillRect(x + m, r * ch + m, cw - 2 * m, ch - 2 * m);
    }
    noise(ctx, n, n, rnd, 9000, 0.12, 2);
  }],
  block: [512, [5.333, 5.333], (ctx, n, rnd, o) => {
    ctx.fillStyle = '#9d9d98'; ctx.fillRect(0, 0, n, n);
    const cw = n / 3, ch = n / 8, m = n / 170;
    for (let r = 0; r < 8; r++) for (let c = -1; c < 4; c++) {
      ctx.fillStyle = jitter(o.color || '#b7b5ae', rnd, 0.06);
      ctx.fillRect(c * cw + (r % 2 ? cw / 2 : 0) + m, r * ch + m, cw - 2 * m, ch - 2 * m);
    }
    noise(ctx, n, n, rnd, 16000, 0.12, 2);
  }],
  siding: [256, [4, 4], (ctx, n, rnd, o) => {
    const rows = 8, rh = n / rows;
    for (let r = 0; r < rows; r++) {
      const g = ctx.createLinearGradient(0, r * rh, 0, (r + 1) * rh);
      const c = new THREE.Color(o.color || '#e8e6df');
      g.addColorStop(0, `#${c.clone().multiplyScalar(0.78).getHexString()}`);
      g.addColorStop(0.18, `#${c.getHexString()}`);
      g.addColorStop(1, `#${c.clone().multiplyScalar(0.94).getHexString()}`);
      ctx.fillStyle = g; ctx.fillRect(0, r * rh, n, rh);
    }
    noise(ctx, n, n, rnd, 2500, 0.05, 1);
  }],
  shingle: [512, [6, 5], (ctx, n, rnd, o) => {
    const base = o.color || '#474a4f';
    ctx.fillStyle = base; ctx.fillRect(0, 0, n, n);
    const rows = 12, rh = n / rows, tabs = 6, tw = n / tabs;
    for (let r = 0; r < rows; r++) for (let c = -1; c <= tabs; c++) {
      ctx.fillStyle = jitter(base, rnd, 0.22);
      const x = c * tw + (r % 2 ? tw / 2 : 0);
      ctx.fillRect(x + 1, r * rh, tw - 2, rh - 3);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x, r * rh + rh - 3, tw, 3);
    }
    noise(ctx, n, n, rnd, 26000, 0.2, 1);
  }],
  metal: [256, [3, 3], (ctx, n, rnd, o) => {
    const base = o.color || '#39474f';
    ctx.fillStyle = base; ctx.fillRect(0, 0, n, n);
    for (let i = 0; i < 2; i++) {
      const x = i * n / 2;
      ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(x, 0, 3, n);
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(x + 3, 0, 4, n);
    }
  }],
  hardwood: [512, [4, 8], (ctx, n, rnd, o) => {
    const base = o.color || '#a8784a';
    const pw = n / 9.6;
    for (let c = 0; c < 10; c++) {
      let y = -rnd() * n;
      while (y < n) {
        const L = n * (0.25 + rnd() * 0.5);
        ctx.fillStyle = jitter(base, rnd, 0.14);
        ctx.fillRect(c * pw, y, pw - 1.5, L - 1.5);
        ctx.strokeStyle = 'rgba(60,35,15,0.12)';
        for (let k = 0; k < 4; k++) { ctx.beginPath(); const gx = c * pw + rnd() * pw; ctx.moveTo(gx, y); ctx.bezierCurveTo(gx + 3, y + L / 3, gx - 3, y + 2 * L / 3, gx, y + L); ctx.stroke(); }
        y += L;
      }
    }
  }],
  tile: [256, [2, 2], (ctx, n, rnd, o) => {
    ctx.fillStyle = '#b8b4ac'; ctx.fillRect(0, 0, n, n);
    const t = n / 2;
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) { ctx.fillStyle = jitter(o.color || '#e7e3db', rnd, 0.04); ctx.fillRect(c * t + 2, r * t + 2, t - 4, t - 4); }
    noise(ctx, n, n, rnd, 3000, 0.05, 1);
  }],
  carpet: [256, [3, 3], (ctx, n, rnd, o) => {
    ctx.fillStyle = o.color || '#8d8a82'; ctx.fillRect(0, 0, n, n);
    noise(ctx, n, n, rnd, 30000, 0.14, 1);
  }],
  concrete: [512, [10, 10], (ctx, n, rnd, o) => {
    ctx.fillStyle = o.color || '#a9a8a2'; ctx.fillRect(0, 0, n, n);
    for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(0,0,0,${0.03 * rnd()})`; ctx.beginPath(); ctx.arc(rnd() * n, rnd() * n, 20 + rnd() * 80, 0, 7); ctx.fill(); }
    noise(ctx, n, n, rnd, 30000, 0.12, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, n, 2); ctx.fillRect(0, 0, 2, n);
  }],
  subfloor: [512, [8, 8], (ctx, n, rnd) => {
    ctx.fillStyle = '#c9a66b'; ctx.fillRect(0, 0, n, n);
    for (let i = 0; i < 1800; i++) { ctx.fillStyle = jitter('#b98f55', rnd, 0.25); ctx.save(); ctx.translate(rnd() * n, rnd() * n); ctx.rotate(rnd() * 3); ctx.fillRect(-8, -3, 16 + rnd() * 10, 5); ctx.restore(); }
    ctx.fillStyle = 'rgba(40,20,0,0.45)'; ctx.fillRect(0, 0, n, 2); ctx.fillRect(n / 2, 0, 2, n); ctx.fillRect(0, 0, 2, n);
  }],
  plywood: [256, [8, 4], (ctx, n, rnd) => {
    ctx.fillStyle = '#d6b37a'; ctx.fillRect(0, 0, n, n);
    ctx.strokeStyle = 'rgba(120,80,30,0.2)';
    for (let i = 0; i < 30; i++) { ctx.beginPath(); const y = rnd() * n; ctx.moveTo(0, y); ctx.bezierCurveTo(n / 3, y + 8 * rnd(), 2 * n / 3, y - 8 * rnd(), n, y); ctx.stroke(); }
    ctx.fillStyle = 'rgba(60,30,0,0.4)'; ctx.fillRect(0, 0, n, 2); ctx.fillRect(0, 0, 2, n);
  }],
  vinyl: [512, [4, 8], (ctx, n, rnd, o) => { GEN.hardwood[2](ctx, n, rnd, { color: o.color || '#8f8579' }); }],
  slate: [256, [2, 2], (ctx, n, rnd, o) => {
    ctx.fillStyle = '#2d2d2d'; ctx.fillRect(0, 0, n, n);
    const t = n / 2;
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) { ctx.fillStyle = jitter(o.color || '#5b5f63', rnd, 0.15); ctx.fillRect(c * t + 2, r * t + 2, t - 4, t - 4); }
    noise(ctx, n, n, rnd, 6000, 0.15, 2);
  }],
  deck: [256, [4, 4], (ctx, n, rnd, o) => {
    ctx.fillStyle = '#3a2a1c'; ctx.fillRect(0, 0, n, n);
    const bw = n / 8.7;
    for (let i = 0; i < 9; i++) { ctx.fillStyle = jitter(o.color || '#8a6a4a', rnd, 0.12); ctx.fillRect(0, i * bw + 1, n, bw - 3); }
    noise(ctx, n, n, rnd, 5000, 0.08, 1);
  }],
  grass: [256, [6, 6], (ctx, n, rnd, o) => {
    ctx.fillStyle = o.color || '#5b7f3a'; ctx.fillRect(0, 0, n, n);
    for (let i = 0; i < 9000; i++) {
      const g = 80 + rnd() * 90;
      ctx.fillStyle = `rgba(${(g * 0.55) | 0},${g | 0},${(g * 0.3) | 0},0.35)`;
      ctx.fillRect(rnd() * n, rnd() * n, 1, 2 + rnd() * 3);
    }
  }],
  meadow: [256, [6, 6], (ctx, n, rnd) => {
    GEN.grass[2](ctx, n, rnd, { color: '#7b8a45' });
    for (let i = 0; i < 400; i++) { ctx.fillStyle = ['#f1e05a', '#ffffff', '#b58bd6', '#e8a33d'][(rnd() * 4) | 0]; ctx.fillRect(rnd() * n, rnd() * n, 2, 2); }
  }],
  mulch: [256, [4, 4], (ctx, n, rnd, o) => {
    ctx.fillStyle = o.color || '#5e3f28'; ctx.fillRect(0, 0, n, n);
    for (let i = 0; i < 2600; i++) { ctx.fillStyle = jitter(o.color || '#7d5234', rnd, 0.35); ctx.save(); ctx.translate(rnd() * n, rnd() * n); ctx.rotate(rnd() * 3); ctx.fillRect(-4, -1, 8, 2.5); ctx.restore(); }
  }],
  gravel: [256, [3, 3], (ctx, n, rnd, o) => {
    ctx.fillStyle = '#8b877f'; ctx.fillRect(0, 0, n, n);
    for (let i = 0; i < 3500; i++) { ctx.fillStyle = jitter(o.color || '#aaa59a', rnd, 0.3); ctx.beginPath(); ctx.arc(rnd() * n, rnd() * n, 1 + rnd() * 2.2, 0, 7); ctx.fill(); }
  }],
  asphalt: [256, [8, 8], (ctx, n, rnd) => { ctx.fillStyle = '#3d3f42'; ctx.fillRect(0, 0, n, n); noise(ctx, n, n, rnd, 20000, 0.25, 1); }],
  pavers: [256, [4, 4], (ctx, n, rnd, o) => {
    ctx.fillStyle = '#6d655b'; ctx.fillRect(0, 0, n, n);
    const u = n / 8;
    for (let r = 0; r < 8; r++) for (let c = -1; c < 5; c++) { ctx.fillStyle = jitter(o.color || '#a58f78', rnd, 0.12); ctx.fillRect(c * 2 * u + (r % 2) * u + 1.5, r * u + 1.5, 2 * u - 3, u - 3); }
  }],
  flagstone: [512, [8, 8], (ctx, n, rnd, o) => {
    ctx.fillStyle = '#5b5a52'; ctx.fillRect(0, 0, n, n);
    const cells = 7, s = n / cells;
    for (let r = 0; r < cells; r++) for (let c = 0; c < cells; c++) {
      ctx.fillStyle = jitter(o.color || '#a39a86', rnd, 0.18);
      ctx.beginPath();
      const cx = c * s + s / 2, cy = r * s + s / 2;
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + rnd() * 0.5, rr = s * (0.36 + rnd() * 0.14); ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
      ctx.fill();
    }
  }],
  dirt: [256, [5, 5], (ctx, n, rnd) => { ctx.fillStyle = '#6e5337'; ctx.fillRect(0, 0, n, n); noise(ctx, n, n, rnd, 20000, 0.2, 2); }],
  flowers: [256, [4, 4], (ctx, n, rnd) => {
    GEN.mulch[2](ctx, n, rnd, {});
    for (let i = 0; i < 160; i++) {
      const x = rnd() * n, y = rnd() * n;
      ctx.fillStyle = '#4f7d34'; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill();
      ctx.fillStyle = ['#f5d142', '#e8457a', '#ffffff', '#9a6ad6', '#ff8a3d'][(rnd() * 5) | 0];
      for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(x + (rnd() - 0.5) * 9, y + (rnd() - 0.5) * 9, 2, 0, 7); ctx.fill(); }
    }
  }],
  water: [256, [8, 8], (ctx, n, rnd) => {
    ctx.fillStyle = '#2f6f86'; ctx.fillRect(0, 0, n, n);
    for (let i = 0; i < 120; i++) { ctx.strokeStyle = `rgba(255,255,255,${0.15 * rnd()})`; ctx.beginPath(); const x = rnd() * n, y = rnd() * n; ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 10, y - 3, x + 20, y); ctx.stroke(); }
  }],
  stucco: [256, [4, 4], (ctx, n, rnd, o) => { ctx.fillStyle = o.color || '#ddd6c8'; ctx.fillRect(0, 0, n, n); noise(ctx, n, n, rnd, 25000, 0.1, 2); }],
  stone: [512, [6, 6], (ctx, n, rnd, o) => {
    ctx.fillStyle = '#6b665c'; ctx.fillRect(0, 0, n, n);
    let y = 0;
    while (y < n) { const h = n / 10 * (0.7 + rnd() * 0.6); let x = -rnd() * 40; while (x < n) { const w = h * (1.2 + rnd() * 1.6); ctx.fillStyle = jitter(o.color || '#9b8f7b', rnd, 0.22); ctx.fillRect(x + 2, y + 2, w - 4, h - 4); x += w; } y += h; }
  }],
  garageDoor: [256, [9, 7], (ctx, n, rnd) => {
    ctx.fillStyle = '#e9e9e4'; ctx.fillRect(0, 0, n, n);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 3; ctx.strokeRect(c * n / 4 + 8, r * n / 4 + 8, n / 4 - 16, n / 4 - 16); }
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; for (let r = 1; r < 4; r++) ctx.fillRect(0, r * n / 4 - 1, n, 3);
  }],
  woodgrain: [256, [2, 2], (ctx, n, rnd, o) => {
    ctx.fillStyle = o.color || '#8a5a36'; ctx.fillRect(0, 0, n, n);
    ctx.strokeStyle = 'rgba(40,20,5,0.18)';
    for (let i = 0; i < 40; i++) { ctx.beginPath(); const y = rnd() * n; ctx.moveTo(0, y); ctx.bezierCurveTo(n / 3, y + 6 * rnd(), 2 * n / 3, y - 6 * rnd(), n, y); ctx.stroke(); }
  }],
};

export const TEX_TYPES = Object.keys(GEN);

export function texCanvas(name, opts = {}) {
  const key = name + JSON.stringify(opts);
  if (canvases.has(key)) return canvases.get(key);
  const [n, size, fn] = GEN[name];
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const ctx = cv.getContext('2d');
  fn(ctx, n, seeded(name.length * 97 + n), opts);
  const out = { canvas: cv, size };
  canvases.set(key, out);
  return out;
}

export function texture(name, opts = {}) {
  const key = name + JSON.stringify(opts);
  if (cache.has(key)) return cache.get(key);
  const { canvas, size } = texCanvas(name, opts);
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / size[0], 1 / size[1]);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  cache.set(key, t);
  return t;
}

// Pattern at a given px-per-foot scale for 2D ground canvas painting.
const patCache = new Map();
export function groundPattern(ctx, name, pxPerFt, opts = {}) {
  const key = name + pxPerFt + JSON.stringify(opts);
  if (patCache.has(key)) return patCache.get(key);
  const { canvas, size } = texCanvas(name, opts);
  const c2 = document.createElement('canvas');
  c2.width = Math.max(4, Math.round(size[0] * pxPerFt));
  c2.height = Math.max(4, Math.round(size[1] * pxPerFt));
  c2.getContext('2d').drawImage(canvas, 0, 0, c2.width, c2.height);
  const p = ctx.createPattern(c2, 'repeat');
  patCache.set(key, p);
  return p;
}
