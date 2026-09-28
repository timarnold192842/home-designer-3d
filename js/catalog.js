import * as THREE from 'three';
import { mat, paint, solid, texMat, glassMat } from './materials.js';
import { seeded } from './util.js';

// ---------- primitive helpers (y is bottom-based; items face +z) ----------
const geoCache = new Map();
const geo = (k, f) => geoCache.get(k) || (geoCache.set(k, f()), geoCache.get(k));
const boxG = (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cylG = (rt, rb, h, s = 16) => geo(`c${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
const sphG = (r, s = 12) => geo(`s${r},${s}`, () => new THREE.SphereGeometry(r, s, Math.max(6, s * 0.75)));

function add(g, geometry, m, x, y, z, shadow = true) {
  const mesh = new THREE.Mesh(geometry, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow; mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
const B = (g, w, h, d, x, y, z, m) => add(g, boxG(w, h, d), m, x, y + h / 2, z);
const C = (g, r, h, x, y, z, m, rb = r, s = 16) => add(g, cylG(r, rb, h, s), m, x, y + h / 2, z);
const S = (g, r, x, y, z, m, s = 12) => add(g, sphG(r, s), m, x, y, z);

const wood = (c = '#8a5a36') => texMat('woodgrain', { color: c });
const metal = (c = '#8d9296') => solid(c, { metalness: 0.7, roughness: 0.35 });
const white = () => solid('#f4f3ef', { roughness: 0.25 });
const porcelain = () => solid('#fbfbf8', { roughness: 0.15 });
const fabric = (c) => paint(c, 0.95);
const dark = () => solid('#202225', { roughness: 0.4 });
const emissiveMat = (c) => mat('emis' + c, () => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.0, roughness: 0.5 }), false);
export const lampMats = new Set();
function lampShade(c = '#f3e7cf') { const m = emissiveMat(c); lampMats.add(m); return m; }

function legs4(g, w, d, h, m, inset = 0.15, r = 0.06) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) C(g, r, h, sx * (w / 2 - inset), 0, sz * (d / 2 - inset), m, r, 8);
}

// ---------- plants ----------
export const PLANT_STATE = { season: 'summer', years: 0 };
const crownGeos = [];
function crownGeo(i) {
  if (!crownGeos.length) {
    for (let v = 0; v < 4; v++) {
      const gg = new THREE.IcosahedronGeometry(1, 1);
      const rnd = seeded(31 + v * 7);
      const p = gg.attributes.position;
      const key = (x, y, z) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
      const disp = new Map();
      for (let k = 0; k < p.count; k++) {
        const kk = key(p.getX(k), p.getY(k), p.getZ(k));
        if (!disp.has(kk)) disp.set(kk, 0.82 + rnd() * 0.36);
        const s = disp.get(kk);
        p.setXYZ(k, p.getX(k) * s, p.getY(k) * s, p.getZ(k) * s);
      }
      gg.computeVertexNormals();
      crownGeos.push(gg);
    }
  }
  return crownGeos[i % 4];
}

export const TREES = {
  oak: { name: 'Red Oak', kind: 'decid', h: 60, spread: 50, start: 10, rate: 1.8, leaf: '#4c7a32', spring: '#79a84a', fall: '#9b4a24', cost: 380 },
  maple: { name: 'Sugar Maple', kind: 'decid', h: 55, spread: 42, start: 10, rate: 1.6, leaf: '#4f8a36', spring: '#86b653', fall: '#e0701f', cost: 350 },
  redMaple: { name: 'Japanese Maple', kind: 'decid', h: 18, spread: 18, start: 5, rate: 1, leaf: '#7e2622', spring: '#a8392c', fall: '#d0301f', cost: 260 },
  birch: { name: 'River Birch', kind: 'decid', h: 40, spread: 26, start: 8, rate: 2.2, leaf: '#6a9a3e', spring: '#94c05a', fall: '#e2bd3a', trunk: '#d8d0c0', shape: 'oval', cost: 240 },
  dogwood: { name: 'Flowering Dogwood', kind: 'decid', h: 22, spread: 24, start: 5, rate: 1, leaf: '#4f7d3a', spring: '#6c9a44', fall: '#a8322c', flower: '#fbf7f0', cost: 220 },
  cherry: { name: 'Kwanzan Cherry', kind: 'decid', h: 25, spread: 25, start: 6, rate: 1.5, leaf: '#4d7a36', spring: '#6f9d45', fall: '#c46a2a', flower: '#f3b4cb', cost: 240 },
  apple: { name: 'Apple (semi-dwarf)', kind: 'decid', h: 15, spread: 15, start: 5, rate: 1.2, leaf: '#4d8036', spring: '#77a54c', fall: '#b88b2e', flower: '#fff1f5', fruit: '#c0392b', cost: 120 },
  magnolia: { name: 'Saucer Magnolia', kind: 'decid', h: 25, spread: 25, start: 6, rate: 1.1, leaf: '#4f7e3c', spring: '#6e9a4c', fall: '#a58a3a', flower: '#f1d6e4', cost: 260 },
  willow: { name: 'Weeping Willow', kind: 'decid', h: 40, spread: 40, start: 8, rate: 3, leaf: '#8aa845', spring: '#a9c65a', fall: '#d6c14a', shape: 'weep', cost: 180 },
  spruce: { name: 'Colorado Blue Spruce', kind: 'conifer', h: 50, spread: 20, start: 6, rate: 1.2, leaf: '#5f7f86', cost: 280 },
  pine: { name: 'Eastern White Pine', kind: 'conifer', h: 70, spread: 32, start: 6, rate: 2, leaf: '#3f6a3a', cost: 200 },
  arborvitae: { name: 'Green Giant Arborvitae', kind: 'column', h: 30, spread: 10, start: 5, rate: 2.5, leaf: '#3b6a2d', cost: 90 },
};
export const SHRUBS = {
  boxwood: { name: 'Boxwood', h: 3, spread: 3, start: 1.2, rate: 0.3, leaf: '#3f6b2c', ever: true, cost: 45 },
  hydrangea: { name: 'Hydrangea', h: 4.5, spread: 5, start: 1.5, rate: 0.8, leaf: '#4a7a36', flower: '#9bb7e8', cost: 55 },
  rhododendron: { name: 'Rhododendron', h: 6, spread: 6, start: 2, rate: 0.6, leaf: '#2f5a2a', flower: '#c9468f', ever: true, cost: 65 },
  lilac: { name: 'Lilac', h: 10, spread: 7, start: 3, rate: 1, leaf: '#4c7b38', flower: '#b18ad3', cost: 50 },
  rose: { name: 'Shrub rose', h: 3.5, spread: 3.5, start: 1.2, rate: 0.8, leaf: '#3e6a2e', flower: '#d8203a', cost: 35 },
  lavender: { name: 'Lavender', h: 2, spread: 2.5, start: 0.8, rate: 0.6, leaf: '#8fa38a', flower: '#8a6bc9', ever: true, cost: 18 },
  grass: { name: 'Ornamental grass', h: 4, spread: 3, start: 1, rate: 1.5, leaf: '#9aa45a', fall: '#c7b26a', kind: 'grass', cost: 25 },
  hosta: { name: 'Hosta / perennials', h: 1.6, spread: 2.6, start: 0.8, rate: 0.5, leaf: '#5d8a4a', cost: 20 },
};

const plantMats = new Map();
function pmat(key, color) {
  if (!plantMats.has(key)) plantMats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true }));
  return plantMats.get(key);
}
export function applySeason(season) {
  PLANT_STATE.season = season;
  for (const [sp, t] of Object.entries({ ...TREES, ...SHRUBS })) {
    const leaf = plantMats.get('leaf_' + sp), flower = plantMats.get('flower_' + sp), fruit = plantMats.get('fruit_' + sp);
    const decid = !(t.kind === 'conifer' || t.kind === 'column' || t.ever);
    if (leaf) {
      leaf.color.set(season === 'spring' ? (t.spring || t.leaf) : season === 'fall' ? (t.fall || t.leaf) : t.leaf);
      leaf.visible = !(season === 'winter' && decid);
    }
    if (flower) flower.visible = season === 'spring' || (!TREES[sp] && season === 'summer');
    if (fruit) fruit.visible = season === 'fall' || season === 'summer';
  }
}

export function plantHeight(spec, age) {
  if (age === undefined || age === null) return spec.h;
  const a = Math.max(0, age);
  // logistic-ish approach to mature height
  const lin = spec.start + spec.rate * a;
  return Math.min(spec.h, spec.h - (spec.h - spec.start) * Math.exp(-(lin - spec.start) / (spec.h - spec.start) * 1.15));
}

function buildTree(sp, seed = 1) {
  const t = TREES[sp];
  const g = new THREE.Group();
  const rnd = seeded(seed * 13 + sp.length);
  const H = t.h, R = t.spread / 2;
  const bark = pmat('bark_' + (t.trunk || 'd'), t.trunk || '#4b3a2c');
  const leaf = pmat('leaf_' + sp, t.leaf);
  if (t.kind === 'conifer') {
    C(g, H * 0.018 + 0.2, H * 0.3, 0, 0, 0, bark, H * 0.025 + 0.3, 7);
    const tiers = 5;
    for (let i = 0; i < tiers; i++) {
      const f = i / tiers;
      const r = R * (1 - f * 0.8), h = H * 0.32;
      const m = add(g, geo('cone' + i, () => new THREE.ConeGeometry(1, 1, 9)), leaf, 0, H * 0.18 + f * H * 0.66 + h / 2, 0);
      m.scale.set(r, h, r);
    }
    return g;
  }
  if (t.kind === 'column') {
    C(g, 0.25, H * 0.1, 0, 0, 0, bark, 0.3, 6);
    const m = add(g, crownGeo(1), leaf, 0, H * 0.55, 0);
    m.scale.set(R, H * 0.5, R);
    return g;
  }
  const trunkH = t.shape === 'weep' ? H * 0.45 : H * 0.38;
  C(g, H * 0.014 + 0.15, trunkH + H * 0.15, 0, 0, 0, bark, H * 0.024 + 0.25, 8);
  // branches (visible in winter)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rnd();
    const br = add(g, cylG(0.05 * H / 20, 0.12 * H / 20, 1, 5), bark, 0, 0, 0);
    const len = R * (0.7 + rnd() * 0.3);
    br.scale.set(1, len, 1);
    br.position.set(Math.cos(a) * len * 0.35, trunkH + H * 0.1 + rnd() * H * 0.12, Math.sin(a) * len * 0.35);
    br.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
  }
  const blobs = t.shape === 'oval' ? 5 : 7;
  const cy = trunkH + (H - trunkH) * 0.5;
  const cr = (H - trunkH) * 0.5;
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2 + rnd();
    const d = i === 0 ? 0 : R * (0.35 + rnd() * 0.25);
    const s = i === 0 ? Math.max(R, cr) * 0.72 : R * (0.45 + rnd() * 0.2);
    const m = add(g, crownGeo(i), leaf, Math.cos(a) * d, cy + (rnd() - 0.4) * cr * 0.6, Math.sin(a) * d);
    m.scale.set(s, t.shape === 'oval' ? s * 1.4 : t.shape === 'weep' ? s * 1.1 : s * 0.85, s);
    m.rotation.y = rnd() * 6;
  }
  if (t.flower) {
    const fm = pmat('flower_' + sp, t.flower);
    for (let i = 0; i < 9; i++) {
      const a = rnd() * 6.28, d = R * (0.2 + rnd() * 0.55);
      const m = add(g, crownGeo(i + 1), fm, Math.cos(a) * d, cy + (rnd() - 0.2) * cr * 0.9, Math.sin(a) * d, false);
      m.scale.setScalar(R * 0.28);
    }
  }
  if (t.fruit) {
    const fr = pmat('fruit_' + sp, t.fruit);
    for (let i = 0; i < 14; i++) { const a = rnd() * 6.28, d = R * (0.5 + rnd() * 0.4); S(g, 0.28, Math.cos(a) * d, cy - cr * 0.2 + rnd() * cr * 0.7, Math.sin(a) * d, fr, 6).castShadow = false; }
  }
  return g;
}

function buildShrub(sp, seed = 1) {
  const t = SHRUBS[sp];
  const g = new THREE.Group();
  const rnd = seeded(seed * 17 + 3);
  const leaf = pmat('leaf_' + sp, t.leaf);
  if (t.kind === 'grass') {
    for (let i = 0; i < 9; i++) {
      const m = add(g, geo('grassBlade', () => new THREE.ConeGeometry(0.12, 1, 4)), leaf, (rnd() - 0.5) * t.spread * 0.4, t.h / 2, (rnd() - 0.5) * t.spread * 0.4);
      m.scale.set(t.spread * 0.8, t.h, t.spread * 0.8);
      m.rotation.set((rnd() - 0.5) * 0.4, 0, (rnd() - 0.5) * 0.4);
    }
    return g;
  }
  const n = 3;
  for (let i = 0; i < n; i++) {
    const r = t.spread / 2 * (i === 0 ? 0.85 : 0.6);
    const m = add(g, crownGeo(i + seed), leaf, i === 0 ? 0 : (rnd() - 0.5) * t.spread * 0.4, t.h * 0.5, i === 0 ? 0 : (rnd() - 0.5) * t.spread * 0.4);
    m.scale.set(r, t.h * 0.5, r);
  }
  if (t.flower) {
    const fm = pmat('flower_' + sp, t.flower);
    for (let i = 0; i < 8; i++) {
      const a = rnd() * 6.28, d = t.spread * 0.35;
      const m = add(g, crownGeo(i), fm, Math.cos(a) * d, t.h * (0.55 + rnd() * 0.35), Math.sin(a) * d, false);
      m.scale.setScalar(Math.max(0.2, t.spread * 0.1));
    }
  }
  return g;
}

// ---------- catalog ----------
// dims [w (x), d (z), h]; place: floor | wall | ceiling | ground; cost USD (rough, for the estimator)
export const CATALOG = {};
const def = (type, name, cat, dims, cost, build, extra = {}) => (CATALOG[type] = { type, name, cat, dims, cost, build, place: 'floor', ...extra });

// Living
def('sofa', 'Sofa', 'Living', [7, 3.1, 2.8], 1600, (o) => { const g = new THREE.Group(), f = fabric(o.color || '#7d8a93'); B(g, 7, 1.4, 3.1, 0, 0.35, 0, f); B(g, 7, 1.5, 0.6, 0, 1.4, -1.25, f); B(g, 0.6, 0.9, 3.1, -3.2, 1.4, 0, f); B(g, 0.6, 0.9, 3.1, 3.2, 1.4, 0, f); for (const x of [-1.6, 1.6]) B(g, 2.9, 0.35, 2.3, x, 1.75, 0.3, f); legs4(g, 6.8, 2.9, 0.35, wood('#3b2718'), 0.2, 0.08); return g; }, { colorable: true });
def('loveseat', 'Loveseat', 'Living', [5, 3, 2.8], 1100, (o) => { const g = CATALOG.sofa.build(o); g.scale.x = 5 / 7; return g; }, { colorable: true });
def('sectional', 'Sectional (L)', 'Living', [9.5, 7, 2.8], 2800, (o) => { const g = new THREE.Group(), f = fabric(o.color || '#a39c8f'); B(g, 9.5, 1.4, 3.2, 0, 0.3, -1.9, f); B(g, 9.5, 1.5, 0.6, 0, 1.4, -3.2, f); B(g, 3.2, 1.4, 3.8, 3.15, 0.3, 1.6, f); B(g, 0.6, 1.5, 7, 4.45, 1.4, 0, f); B(g, 0.6, 0.9, 3.2, -4.45, 1.4, -1.9, f); return g; }, { colorable: true });
def('armchair', 'Armchair', 'Living', [2.9, 3, 2.9], 700, (o) => { const g = new THREE.Group(), f = fabric(o.color || '#b5835a'); B(g, 2.9, 1.3, 3, 0, 0.4, 0, f); B(g, 2.9, 1.6, 0.5, 0, 1.4, -1.25, f); B(g, 0.45, 0.8, 3, -1.22, 1.4, 0, f); B(g, 0.45, 0.8, 3, 1.22, 1.4, 0, f); legs4(g, 2.7, 2.8, 0.4, wood('#3b2718'), 0.15, 0.07); return g; }, { colorable: true });
def('coffeeTable', 'Coffee table', 'Living', [4, 2, 1.4], 450, (o) => { const g = new THREE.Group(); B(g, 4, 0.15, 2, 0, 1.25, 0, wood(o.color || '#8a5a36')); legs4(g, 4, 2, 1.25, wood('#3b2718')); B(g, 3.7, 0.08, 1.7, 0, 0.35, 0, wood(o.color || '#8a5a36')); return g; }, { colorable: true });
def('sideTable', 'Side table', 'Living', [1.8, 1.8, 2], 180, (o) => { const g = new THREE.Group(); B(g, 1.8, 0.12, 1.8, 0, 1.88, 0, wood(o.color)); legs4(g, 1.8, 1.8, 1.88, wood('#3b2718'), 0.1, 0.05); return g; });
def('tvStand', 'Media console + TV', 'Living', [6, 1.6, 4.8], 1400, (o) => { const g = new THREE.Group(); B(g, 6, 1.8, 1.6, 0, 0.2, 0, wood(o.color || '#5a3b26')); B(g, 5.4, 3.1, 0.15, 0, 2.2, -0.2, dark()); B(g, 1.2, 0.08, 0.6, 0, 2.0, -0.2, dark()); return g; }, { colorable: true });
def('bookshelf', 'Bookshelf', 'Living', [3, 1.1, 6.5], 350, (o) => { const g = new THREE.Group(), w = wood(o.color || '#6d4a2f'); B(g, 0.1, 6.5, 1.1, -1.45, 0, 0, w); B(g, 0.1, 6.5, 1.1, 1.45, 0, 0, w); B(g, 3, 6.5, 0.08, 0, 0, -0.5, w); const rnd = seeded(5); for (let i = 0; i < 6; i++) { B(g, 2.8, 0.08, 1, 0, i * 1.28, 0, w); if (i < 5) for (let k = 0; k < 9; k++) B(g, 0.22, 0.75 + rnd() * 0.3, 0.75, -1.2 + k * 0.3, i * 1.28 + 0.08, 0.05, paint(['#7a2e2e', '#2f4a6b', '#c7a45a', '#3f5d3a', '#ded6c4'][(rnd() * 5) | 0])); } return g; }, { colorable: true });
def('floorLamp', 'Floor lamp', 'Lighting', [1.3, 1.3, 5.6], 160, () => { const g = new THREE.Group(); C(g, 0.5, 0.08, 0, 0, 0, metal('#2b2b2b')); C(g, 0.04, 4.6, 0, 0.08, 0, metal('#2b2b2b')); C(g, 0.45, 1, 0, 4.6, 0, lampShade(), 0.62); return g; }, { light: true });
def('tableLamp', 'Table lamp', 'Lighting', [1, 1, 2], 80, () => { const g = new THREE.Group(); C(g, 0.25, 1.1, 0, 0, 0, solid('#c9b79c')); C(g, 0.33, 0.8, 0, 1.1, 0, lampShade(), 0.45); return g; }, { light: true });
def('pendant', 'Pendant light', 'Lighting', [1.4, 1.4, 3], 220, () => { const g = new THREE.Group(); C(g, 0.02, 2.2, 0, 0.8, 0, dark()); C(g, 0.15, 0.8, 0, 0, 0, lampShade('#fff2d6'), 0.7); return g; }, { place: 'ceiling', light: true });
def('ceilingFan', 'Ceiling fan', 'Lighting', [4.4, 4.4, 1.2], 250, () => { const g = new THREE.Group(); C(g, 0.05, 0.8, 0, 0.4, 0, dark()); C(g, 0.35, 0.3, 0, 0.2, 0, solid('#d8d2c4')); for (let i = 0; i < 4; i++) { const b = B(g, 2.0, 0.04, 0.45, 0, 0.3, 0, wood('#6d4a2f')); b.position.set(Math.cos(i * 1.57) * 1.2, 0.32, Math.sin(i * 1.57) * 1.2); b.rotation.y = -i * 1.57; } C(g, 0.3, 0.25, 0, -0.05, 0, lampShade()); return g; }, { place: 'ceiling', light: true });
def('rug58', 'Area rug 5×8', 'Living', [8, 5, 0.04], 300, (o) => { const g = new THREE.Group(); B(g, 8, 0.04, 5, 0, 0, 0, fabric(o.color || '#9c6b53')); B(g, 7.2, 0.045, 4.2, 0, 0, 0, fabric('#d8ccb4')); return g; }, { colorable: true });
def('rug810', 'Area rug 8×10', 'Living', [10, 8, 0.04], 550, (o) => { const g = new THREE.Group(); B(g, 10, 0.04, 8, 0, 0, 0, fabric(o.color || '#55657a')); B(g, 9.2, 0.045, 7.2, 0, 0, 0, fabric('#c9c2b2')); return g; }, { colorable: true });
def('piano', 'Upright piano', 'Living', [5, 2.1, 4.2], 3500, () => { const g = new THREE.Group(); B(g, 5, 4.2, 1.2, 0, 0, -0.45, solid('#161312', { roughness: 0.2 })); B(g, 5, 0.25, 0.9, 0, 2.3, 0.55, solid('#161312', { roughness: 0.2 })); B(g, 4.6, 0.06, 0.5, 0, 2.55, 0.6, white()); return g; });
def('plant', 'House plant', 'Decor', [1.6, 1.6, 4.5], 90, () => { const g = new THREE.Group(); C(g, 0.55, 1.1, 0, 0, 0, solid('#c4b8a6'), 0.45); for (let i = 0; i < 5; i++) { const m = add(g, crownGeo(i), pmat('leaf_house', '#3f7a3a'), (i % 2 - 0.5) * 0.4, 2.2 + i * 0.4, ((i * 7) % 3 - 1) * 0.3); m.scale.setScalar(0.7); } return g; });
def('woodStove', 'Wood stove', 'Living', [2.3, 2, 3], 2200, () => { const g = new THREE.Group(); B(g, 2.3, 2.2, 2, 0, 0.5, 0, solid('#1d1e20', { roughness: 0.5 })); legs4(g, 2.1, 1.8, 0.5, dark()); B(g, 1.1, 0.8, 0.05, 0, 1.0, 1.0, mat('fireglow', () => new THREE.MeshStandardMaterial({ color: '#ff7a2a', emissive: '#ff5a10', emissiveIntensity: 1.2 }))); C(g, 0.3, 5, 0, 2.7, -0.3, dark()); return g; });
def('wallArt', 'Wall art', 'Decor', [3, 0.15, 2.2], 180, (o) => { const g = new THREE.Group(); B(g, 3, 2.2, 0.12, 0, 0, 0, wood('#2a2a2a')); B(g, 2.7, 1.9, 0.13, 0, 0.15, 0.01, paint(o.color || '#c98f5a')); return g; }, { place: 'wall', dy: 4.2, colorable: true });
def('mirror', 'Wall mirror', 'Decor', [2.5, 0.1, 3.4], 200, () => { const g = new THREE.Group(); B(g, 2.5, 3.4, 0.08, 0, 0, 0, wood('#b08d57')); B(g, 2.2, 3.1, 0.09, 0, 0.15, 0.01, solid('#cfd8dc', { metalness: 1, roughness: 0.02 })); return g; }, { place: 'wall', dy: 3.2 });
def('tvWall', 'Wall TV 65"', 'Living', [4.8, 0.2, 2.8], 1000, () => { const g = new THREE.Group(); B(g, 4.8, 2.8, 0.15, 0, 0, 0, dark()); return g; }, { place: 'wall', dy: 3.4 });

// Dining / Kitchen
def('diningTable', 'Dining table (6 seat)', 'Dining', [6.5, 3.4, 2.5], 1200, (o) => { const g = new THREE.Group(); B(g, 6.5, 0.15, 3.4, 0, 2.35, 0, wood(o.color || '#7a4f30')); legs4(g, 6.5, 3.4, 2.35, wood(o.color || '#7a4f30'), 0.3, 0.1); return g; }, { colorable: true });
def('diningSet', 'Dining set + 6 chairs', 'Dining', [7.5, 6.2, 3.1], 2400, (o) => { const g = CATALOG.diningTable.build(o); for (const [x, z, r] of [[-2, -2.4, 0], [0, -2.4, 0], [2, -2.4, 0], [-2, 2.4, Math.PI], [0, 2.4, Math.PI], [2, 2.4, Math.PI]]) { const c = CATALOG.chair.build(o); c.position.set(x, 0, z); c.rotation.y = r; g.add(c); } return g; }, { colorable: true });
def('roundTable', 'Round table 4 ft', 'Dining', [4, 4, 2.5], 800, (o) => { const g = new THREE.Group(); C(g, 2, 0.15, 0, 2.35, 0, wood(o.color || '#7a4f30'), 2, 32); C(g, 0.25, 2.35, 0, 0, 0, wood('#3b2718'), 0.5); return g; }, { colorable: true });
def('chair', 'Dining chair', 'Dining', [1.6, 1.8, 3.1], 180, (o) => { const g = new THREE.Group(), w = wood(o.color || '#7a4f30'); B(g, 1.6, 0.15, 1.6, 0, 1.45, 0.1, w); legs4(g, 1.6, 1.6, 1.45, w, 0.1, 0.05); B(g, 1.6, 1.5, 0.12, 0, 1.6, 0.85, w); g.children.forEach((m) => (m.position.z -= 0.1)); g.rotation.y = 0; return g; }, { colorable: true });
def('barStool', 'Bar stool', 'Dining', [1.4, 1.4, 2.6], 160, () => { const g = new THREE.Group(); C(g, 0.65, 0.2, 0, 2.4, 0, wood('#6d4a2f')); legs4(g, 1.2, 1.2, 2.4, metal('#222'), 0.1, 0.04); return g; });
function cabinet(g, w, color, top = '#e9e6df', sink = false, x = 0) {
  const body = paint(color, 0.6);
  B(g, w, 2.9, 2, x, 0.3, 0, body); B(g, w, 0.3, 1.8, x, 0, -0.05, dark());
  B(g, w + 0.05, 0.12, 2.1, x, 3.0, 0.03, solid(top, { roughness: 0.25 }));
  for (let i = 0; i < Math.round(w / 1.5); i++) B(g, w / Math.round(w / 1.5) - 0.1, 2.5, 0.05, x - w / 2 + (i + 0.5) * (w / Math.round(w / 1.5)), 0.45, 1.01, paint(color, 0.5));
  if (sink) { B(g, 1.9, 0.02, 1.3, x, 3.121, 0.1, metal('#b7bcc0')); C(g, 0.04, 1, x, 3.12, -0.6, metal('#c9cdd0')); }
}
def('baseCabinet', 'Base cabinet 3 ft', 'Kitchen', [3, 2, 3.1], 650, (o) => { const g = new THREE.Group(); cabinet(g, 3, o.color || '#f1efe9'); return g; }, { colorable: true });
def('sinkCabinet', 'Sink base + sink', 'Kitchen', [3, 2, 3.1], 1100, (o) => { const g = new THREE.Group(); cabinet(g, 3, o.color || '#f1efe9', '#e9e6df', true); return g; }, { colorable: true });
def('upperCabinet', 'Upper cabinet 3 ft', 'Kitchen', [3, 1.1, 2.5], 450, (o) => { const g = new THREE.Group(); B(g, 3, 2.5, 1.1, 0, 0, 0, paint(o.color || '#f1efe9', 0.6)); B(g, 1.45, 2.3, 0.05, -0.75, 0.1, 0.56, paint(o.color || '#f1efe9', 0.5)); B(g, 1.45, 2.3, 0.05, 0.75, 0.1, 0.56, paint(o.color || '#f1efe9', 0.5)); return g; }, { place: 'wall', dy: 4.6, colorable: true });
def('kitchenRun', 'Kitchen run 12 ft (cabinets+appliances)', 'Kitchen', [12, 2.1, 7.2], 16000, (o) => {
  const g = new THREE.Group(), c = o.color || '#f1efe9';
  cabinet(g, 3, c, '#e9e6df', false, -4.5); cabinet(g, 3, c, '#e9e6df', true, -1.5); cabinet(g, 3, c, '#e9e6df', false, 4.5);
  const r = CATALOG.range.build({}); r.position.x = 1.5; g.add(r);
  for (const x of [-4.5, -1.5, 4.5]) { const u = CATALOG.upperCabinet.build({ color: c }); u.position.set(x, 4.6, -0.5); g.add(u); }
  B(g, 3, 1.2, 1.6, 1.5, 5.4, -0.25, metal('#b7bcc0'));
  B(g, 12, 1.4, 0.05, 0, 3.12, -1.0, solid('#e3e1dc', { roughness: 0.2 }));
  return g;
}, { colorable: true });
def('island', 'Kitchen island', 'Kitchen', [7, 3.6, 3.1], 5200, (o) => { const g = new THREE.Group(); B(g, 6.6, 2.9, 2.6, 0, 0.2, -0.4, paint(o.color || '#34475e', 0.55)); B(g, 7, 0.14, 3.6, 0, 3.0, 0, solid('#eeebe4', { roughness: 0.2 })); return g; }, { colorable: true });
def('fridge', 'Refrigerator', 'Kitchen', [3, 2.6, 5.9], 2400, () => { const g = new THREE.Group(); B(g, 3, 5.9, 2.6, 0, 0, 0, metal('#c3c7ca')); B(g, 0.05, 5.5, 0.05, 0, 0.2, 1.31, dark()); for (const x of [-0.2, 0.2]) B(g, 0.06, 1.6, 0.12, x, 3.2, 1.36, metal('#8d9296')); return g; });
def('range', 'Range / stove', 'Kitchen', [2.5, 2.2, 3.1], 1400, () => { const g = new THREE.Group(); B(g, 2.5, 3.0, 2.2, 0, 0, 0, metal('#c3c7ca')); B(g, 2.5, 0.08, 2.2, 0, 3.0, 0, dark()); for (const [x, z] of [[-0.6, -0.5], [0.6, -0.5], [-0.6, 0.45], [0.6, 0.45]]) C(g, 0.33, 0.03, x, 3.08, z, solid('#3b3b3b')); B(g, 2.1, 1.4, 0.05, 0, 0.7, 1.11, solid('#15171a', { roughness: 0.1 })); B(g, 2.5, 0.6, 0.2, 0, 3.0, -1.0, metal('#b7bcc0')); return g; });
def('dishwasher', 'Dishwasher', 'Kitchen', [2, 2, 2.9], 900, () => { const g = new THREE.Group(); B(g, 2, 2.9, 2, 0, 0, 0, metal('#c3c7ca')); B(g, 1.6, 0.06, 0.1, 0, 2.5, 1.02, dark()); return g; });

// Bedroom / office
function bed(g, w, L, color, head = '#4e5d6c') { const f = fabric(color); B(g, w, 0.9, L, 0, 0.3, 0.15, wood('#5a3b26')); B(g, w - 0.2, 0.8, L - 0.3, 0, 1.2, 0.25, fabric('#f3f1ec')); B(g, w - 0.1, 0.25, L * 0.62, 0, 1.95, 0.25 + L * 0.19, f); B(g, w, 3.6 - 0.3, 0.3, 0, 0.3, -L / 2 + 0.15, fabric(head)); for (const x of [-w / 4, w / 4]) B(g, w / 2 - 0.35, 0.45, 1.2, x, 2.0, -L / 2 + 1.0, fabric('#ffffff')); }
def('kingBed', 'King bed', 'Bedroom', [6.8, 7.2, 3.9], 2200, (o) => { const g = new THREE.Group(); bed(g, 6.8, 7.2, o.color || '#8fa3b5'); return g; }, { colorable: true });
def('queenBed', 'Queen bed', 'Bedroom', [5.3, 7, 3.7], 1600, (o) => { const g = new THREE.Group(); bed(g, 5.3, 7, o.color || '#c9b39a'); return g; }, { colorable: true });
def('twinBed', 'Twin bed', 'Bedroom', [3.5, 6.8, 3.2], 700, (o) => { const g = new THREE.Group(); bed(g, 3.5, 6.8, o.color || '#9fb0a2'); return g; }, { colorable: true });
def('crib', 'Crib', 'Bedroom', [2.6, 4.6, 3.3], 450, () => { const g = new THREE.Group(), w = paint('#f4f3ef', 0.6); B(g, 2.5, 0.4, 4.5, 0, 1.2, 0, fabric('#ffffff')); for (let i = 0; i <= 12; i++) { C(g, 0.03, 2.4, -1.25, 0.9, -2.2 + i * 0.367, w, 0.03, 5); C(g, 0.03, 2.4, 1.25, 0.9, -2.2 + i * 0.367, w, 0.03, 5); } legs4(g, 2.6, 4.6, 3.3, w, 0.05, 0.08); return g; });
def('nightstand', 'Nightstand', 'Bedroom', [2, 1.6, 2.2], 250, (o) => { const g = new THREE.Group(); B(g, 2, 2.2, 1.6, 0, 0, 0, wood(o.color || '#5a3b26')); B(g, 1.8, 0.05, 0.05, 0, 1.4, 0.81, metal('#b08d57')); return g; }, { colorable: true });
def('dresser', 'Dresser', 'Bedroom', [5, 1.7, 3], 900, (o) => { const g = new THREE.Group(); B(g, 5, 3, 1.7, 0, 0, 0, wood(o.color || '#5a3b26')); for (let r = 0; r < 3; r++) for (const x of [-1.25, 1.25]) B(g, 2.3, 0.8, 0.05, x, 0.2 + r * 0.92, 0.86, wood(o.color || '#6d4a2f')); return g; }, { colorable: true });
def('wardrobe', 'Wardrobe', 'Bedroom', [4, 2, 6.8], 900, (o) => { const g = new THREE.Group(); B(g, 4, 6.8, 2, 0, 0, 0, wood(o.color || '#5a3b26')); B(g, 0.03, 6.4, 0.05, 0, 0.2, 1.01, dark()); return g; }, { colorable: true });
def('desk', 'Desk', 'Office', [5, 2.5, 2.5], 600, (o) => { const g = new THREE.Group(); B(g, 5, 0.12, 2.5, 0, 2.38, 0, wood(o.color || '#8a5a36')); legs4(g, 5, 2.5, 2.38, metal('#2a2a2a'), 0.15, 0.06); B(g, 1.9, 1.2, 0.08, 0, 2.6, -0.8, dark()); return g; }, { colorable: true });
def('officeChair', 'Office chair', 'Office', [2.2, 2.2, 3.6], 350, () => { const g = new THREE.Group(); C(g, 1, 0.12, 0, 0.2, 0, dark(), 1, 5); C(g, 0.08, 1.4, 0, 0.3, 0, metal()); B(g, 1.7, 0.3, 1.7, 0, 1.6, 0, fabric('#333')); B(g, 1.6, 1.8, 0.25, 0, 1.9, -0.8, fabric('#333')); return g; });

// Bath / laundry / mechanical
def('toilet', 'Toilet', 'Bath', [1.6, 2.4, 2.6], 450, () => { const g = new THREE.Group(), p = porcelain(); B(g, 1.6, 1.3, 0.7, 0, 1.3, -0.85, p); C(g, 0.5, 1.2, 0, 0, 0.15, p, 0.6); S(g, 0.62, 0, 1.2, 0.25, p).scale.set(1, 0.35, 1.3); return g; });
def('vanity', 'Vanity + mirror', 'Bath', [3, 1.8, 6], 1100, (o) => { const g = new THREE.Group(); B(g, 3, 2.7, 1.8, 0, 0, 0, paint(o.color || '#56687a', 0.6)); B(g, 3.05, 0.12, 1.9, 0, 2.7, 0.02, solid('#f1efe9', { roughness: 0.2 })); C(g, 0.55, 0.05, 0, 2.83, 0.1, porcelain()); B(g, 2.2, 2.4, 0.06, 0, 3.6, -0.88, solid('#cfd8dc', { metalness: 1, roughness: 0.03 })); return g; }, { colorable: true });
def('vanityDouble', 'Double vanity', 'Bath', [5, 1.9, 6], 2200, (o) => { const g = new THREE.Group(); B(g, 5, 2.7, 1.9, 0, 0, 0, paint(o.color || '#f1efe9', 0.6)); B(g, 5.05, 0.12, 2, 0, 2.7, 0.02, solid('#e7e3db', { roughness: 0.2 })); for (const x of [-1.25, 1.25]) { C(g, 0.5, 0.05, x, 2.83, 0.1, porcelain()); B(g, 1.8, 2.4, 0.06, x, 3.6, -0.93, solid('#cfd8dc', { metalness: 1, roughness: 0.03 })); } return g; }, { colorable: true });
def('tub', 'Bathtub 5 ft', 'Bath', [5, 2.6, 1.8], 1500, () => { const g = new THREE.Group(), p = porcelain(); B(g, 5, 1.8, 2.6, 0, 0, 0, p); B(g, 4.4, 0.05, 2.0, 0, 1.76, 0, solid('#b9d4de', { roughness: 0.1 })); return g; });
def('clawTub', 'Clawfoot tub', 'Bath', [5.4, 2.6, 2.4], 2800, () => { const g = new THREE.Group(), p = porcelain(); const m = S(g, 1, 0, 1.6, 0, p, 20); m.scale.set(2.7, 0.9, 1.3); legs4(g, 4.4, 1.8, 0.5, metal('#b08d57'), 0.2, 0.1); return g; });
def('shower', 'Shower 3×3', 'Bath', [3, 3, 7], 2500, () => { const g = new THREE.Group(); B(g, 3, 0.3, 3, 0, 0, 0, porcelain()); B(g, 3, 6.7, 0.05, 0, 0.3, 1.47, glassMat()); B(g, 0.05, 6.7, 3, 1.47, 0.3, 0, glassMat()); C(g, 0.25, 0.05, 0, 6.4, -1.2, metal()); return g; });
def('washer', 'Washer', 'Laundry', [2.3, 2.4, 3.2], 900, () => { const g = new THREE.Group(); B(g, 2.3, 3.2, 2.4, 0, 0, 0, white()); C(g, 0.7, 0.08, 0, 1.4, 1.2, solid('#2c3e50', { roughness: 0.1 })).rotation.x = Math.PI / 2; return g; });
def('dryer', 'Dryer', 'Laundry', [2.3, 2.4, 3.2], 850, () => { const g = CATALOG.washer.build({}); return g; });
def('utilitySink', 'Utility sink', 'Laundry', [2, 1.8, 3], 250, () => { const g = new THREE.Group(); B(g, 2, 1.2, 1.8, 0, 1.8, 0, white()); legs4(g, 1.9, 1.7, 1.8, white(), 0.05, 0.06); return g; });
def('furnace', 'Furnace', 'Mechanical', [2, 2.4, 4.3], 4500, () => { const g = new THREE.Group(); B(g, 2, 4.3, 2.4, 0, 0, 0, solid('#b8b9b4')); B(g, 1.6, 2.5, 1.6, 0, 4.3, 0, metal('#9ca0a3')); return g; });
def('waterHeater', 'Water heater', 'Mechanical', [1.9, 1.9, 5], 1500, () => { const g = new THREE.Group(); C(g, 0.95, 5, 0, 0, 0, solid('#d9d9d4')); C(g, 0.15, 1.2, 0, 5, 0, metal()); return g; });
def('sumpPump', 'Sump pump', 'Mechanical', [1.4, 1.4, 1.2], 400, () => { const g = new THREE.Group(); C(g, 0.7, 0.2, 0, 0, 0, solid('#303030')); C(g, 0.1, 1, 0.2, 0.2, 0, solid('#e3e3e0')); return g; });

// Rec
def('poolTable', 'Pool table', 'Rec', [8.4, 4.8, 2.6], 3500, (o) => { const g = new THREE.Group(); B(g, 8.4, 0.5, 4.8, 0, 2.1, 0, wood('#4a2c1a')); B(g, 7.6, 0.05, 4.0, 0, 2.6, 0, paint(o.color || '#1f6b3a', 0.95)); legs4(g, 8, 4.4, 2.1, wood('#4a2c1a'), 0.3, 0.25); return g; }, { colorable: true });
def('pingPong', 'Ping-pong table', 'Rec', [9, 5, 2.5], 500, () => { const g = new THREE.Group(); B(g, 9, 0.1, 5, 0, 2.4, 0, paint('#1e4f8a', 0.5)); B(g, 0.05, 0.5, 5.3, 0, 2.5, 0, paint('#ffffff')); legs4(g, 8, 4, 2.4, metal('#333'), 0.2, 0.08); return g; });
def('treadmill', 'Treadmill', 'Rec', [3, 6.5, 5], 1400, () => { const g = new THREE.Group(); B(g, 2.6, 0.6, 6, 0, 0, 0.2, dark()); C(g, 0.08, 4.4, -1.1, 0.6, -2.6, metal()); C(g, 0.08, 4.4, 1.1, 0.6, -2.6, metal()); B(g, 2.6, 0.5, 0.8, 0, 4.4, -2.6, dark()); return g; });
def('barCounter', 'Wet bar 8 ft', 'Rec', [8, 2.2, 3.5], 5000, (o) => { const g = new THREE.Group(); cabinet(g, 8, o.color || '#2f3d4c', '#1c1c1c', true); return g; }, { colorable: true });

// Outdoor furniture & structures
def('patioSet', 'Patio dining set', 'Outdoor', [7, 7, 3], 1500, () => { const g = new THREE.Group(); C(g, 2.3, 0.1, 0, 2.4, 0, solid('#2b2d30'), 2.3, 24); C(g, 0.15, 2.4, 0, 0, 0, metal('#2b2d30')); for (let i = 0; i < 6; i++) { const c = CATALOG.chair.build({ color: '#2b2d30' }); c.position.set(Math.sin(i * 1.047) * 3.1, 0, Math.cos(i * 1.047) * 3.1); c.rotation.y = i * 1.047 + Math.PI; g.add(c); } return g; }, { outdoor: true });
def('adirondack', 'Adirondack chair', 'Outdoor', [2.7, 3.2, 3.2], 280, (o) => { const g = new THREE.Group(), w = paint(o.color || '#2f6f86', 0.7); B(g, 2.2, 0.12, 2, 0, 1.2, 0.3, w); const back = B(g, 2.2, 2.6, 0.12, 0, 1.1, -0.9, w); back.rotation.x = -0.35; B(g, 0.35, 0.1, 2.8, -1.25, 2.0, 0.1, w); B(g, 0.35, 0.1, 2.8, 1.25, 2.0, 0.1, w); legs4(g, 2.4, 2.6, 1.2, w, 0.1, 0.06); return g; }, { outdoor: true, colorable: true });
def('bench', 'Garden bench', 'Outdoor', [5, 1.9, 2.9], 400, () => { const g = new THREE.Group(), w = wood('#7a5a3a'); B(g, 5, 0.15, 1.6, 0, 1.4, 0.1, w); B(g, 5, 1.3, 0.15, 0, 1.6, -0.75, w); legs4(g, 4.8, 1.6, 1.4, metal('#2a2a2a'), 0.15, 0.07); return g; }, { outdoor: true });
def('picnicTable', 'Picnic table', 'Outdoor', [6, 5.2, 2.5], 450, () => { const g = new THREE.Group(), w = wood('#8a6a4a'); B(g, 6, 0.15, 2.4, 0, 2.35, 0, w); for (const z of [-1.9, 1.9]) B(g, 6, 0.12, 1, 0, 1.45, z, w); for (const x of [-2.4, 2.4]) { const l = B(g, 0.3, 2.6, 0.2, x, 0, 0, w); l.rotation.z = 0; B(g, 0.25, 0.2, 5, x, 1.3, 0, w); } return g; }, { outdoor: true });
def('grill', 'Grill', 'Outdoor', [4.6, 2.1, 3.9], 900, () => { const g = new THREE.Group(); B(g, 2.8, 2.6, 2, 0, 0, 0, metal('#2b2b2b')); B(g, 2.8, 1.2, 2, 0, 2.6, 0, metal('#9aa0a6')); B(g, 0.9, 0.1, 1.8, -1.9, 2.7, 0, metal('#2b2b2b')); B(g, 0.9, 0.1, 1.8, 1.9, 2.7, 0, metal('#2b2b2b')); return g; }, { outdoor: true });
def('umbrella', 'Patio umbrella', 'Outdoor', [9, 9, 8], 300, (o) => { const g = new THREE.Group(); C(g, 0.06, 7.7, 0, 0, 0, metal('#dddddd')); const m = add(g, geo('umb', () => new THREE.ConeGeometry(4.5, 1.2, 8, 1, true)), mat('umb' + (o.color || '#b7472a'), () => new THREE.MeshStandardMaterial({ color: o.color || '#b7472a', side: THREE.DoubleSide, roughness: 0.9 }), false), 0, 7.4, 0); m.castShadow = true; C(g, 0.8, 0.3, 0, 0, 0, solid('#333')); return g; }, { outdoor: true, colorable: true });
def('lounger', 'Chaise lounger', 'Outdoor', [2.4, 6.4, 2.6], 450, () => { const g = new THREE.Group(); B(g, 2.2, 0.35, 4.5, 0, 1.0, 0.9, fabric('#e9e3d5')); const b = B(g, 2.2, 0.35, 2.2, 0, 1.2, -2.1, fabric('#e9e3d5')); b.rotation.x = 0.8; legs4(g, 2.2, 6, 1, metal('#333'), 0.2, 0.06); return g; }, { outdoor: true });
def('hotTub', 'Hot tub', 'Outdoor', [7.5, 7.5, 3.1], 9000, () => { const g = new THREE.Group(); B(g, 7.5, 3, 7.5, 0, 0, 0, wood('#5a3b26')); B(g, 6.8, 0.1, 6.8, 0, 2.95, 0, solid('#57a7c6', { roughness: 0.05, emissive: '#0b3a4a', emissiveIntensity: 0.4 })); return g; }, { outdoor: true });
def('firePit', 'Fire pit + seating', 'Outdoor', [16, 16, 3], 3500, () => { const g = new THREE.Group(); C(g, 2.1, 1.2, 0, 0, 0, texMat('stone', {}), 2.3, 20); C(g, 1.6, 0.1, 0, 1.15, 0, mat('fireglow2', () => new THREE.MeshStandardMaterial({ color: '#ff8a30', emissive: '#ff5a10', emissiveIntensity: 1.5 })), 1.6, 20); for (let i = 0; i < 5; i++) { const c = CATALOG.adirondack.build({ color: ['#2f6f86', '#c9a13a', '#b7472a', '#6b8f3a', '#ededed'][i] }); const a = i * 1.257; c.position.set(Math.sin(a) * 6.5, 0, Math.cos(a) * 6.5); c.rotation.y = a + Math.PI; g.add(c); } return g; }, { outdoor: true });
def('pergola', 'Pergola 12×12', 'Structures', [12, 12, 9.5], 7500, (o) => { const g = new THREE.Group(), w = wood(o.color || '#7a5a3a'); for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(g, 0.5, 9, 0.5, sx * 5.6, 0, sz * 5.6, w); for (const sz of [-1, 1]) B(g, 13, 0.8, 0.35, 0, 8.6, sz * 5.6, w); for (let i = 0; i < 9; i++) B(g, 0.2, 0.55, 13, -5.6 + i * 1.4, 9.1, 0, w); return g; }, { outdoor: true, colorable: true });
def('gazebo', 'Gazebo 12 ft', 'Structures', [12, 12, 12], 12000, () => { const g = new THREE.Group(), w = paint('#f1efe9', 0.7); C(g, 6, 0.6, 0, 0, 0, texMat('deck'), 6, 8); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8; C(g, 0.18, 8, Math.cos(a) * 5.6, 0.6, Math.sin(a) * 5.6, w, 0.18, 6); } const r = add(g, geo('gzr', () => new THREE.ConeGeometry(7, 3.6, 8)), texMat('shingle', { color: '#474a4f' }), 0, 10.4, 0); r.rotation.y = Math.PI / 8; return g; }, { outdoor: true });
def('shed', 'Garden shed 10×12', 'Structures', [10, 12, 10], 6000, (o) => { const g = new THREE.Group(); B(g, 10, 7.5, 12, 0, 0, 0, texMat('siding', { color: o.color || '#8e9b84' })); const r1 = B(g, 6.2, 0.3, 13, -2.6, 8.9, 0, texMat('shingle', {})); r1.rotation.z = 0.55; const r2 = B(g, 6.2, 0.3, 13, 2.6, 8.9, 0, texMat('shingle', {})); r2.rotation.z = -0.55; const gab = add(g, geo('shedgab', () => { const s = new THREE.Shape([new THREE.Vector2(-5, 0), new THREE.Vector2(5, 0), new THREE.Vector2(0, 3)]); return new THREE.ExtrudeGeometry(s, { depth: 11.9, bevelEnabled: false }).translate(0, 0, -5.95); }), texMat('siding', { color: o.color || '#8e9b84' }), 0, 7.5, 0); gab.castShadow = true; B(g, 4, 6.5, 0.1, 0, 0, 6.01, paint('#f1efe9', 0.6)); return g; }, { outdoor: true, colorable: true });
def('raisedBed', 'Raised garden bed 4×8', 'Garden', [4, 8, 1.2], 250, () => { const g = new THREE.Group(), w = wood('#8a6a4a'); B(g, 4, 1.2, 0.18, 0, 0, 3.91, w); B(g, 4, 1.2, 0.18, 0, 0, -3.91, w); B(g, 0.18, 1.2, 8, 1.91, 0, 0, w); B(g, 0.18, 1.2, 8, -1.91, 0, 0, w); B(g, 3.64, 1.05, 7.64, 0, 0, 0, texMat('dirt')); const rnd = seeded(9); for (let i = 0; i < 12; i++) { const m = add(g, crownGeo(i), pmat('leaf_veg', '#4f9a3a'), -1.2 + (i % 3) * 1.2, 1.35, -3 + Math.floor(i / 3) * 2); m.scale.set(0.5, 0.35 + rnd() * 0.3, 0.5); } return g; }, { outdoor: true });
def('chickenCoop', 'Chicken coop + run', 'Garden', [10, 5, 6], 1400, () => { const g = new THREE.Group(); B(g, 4, 3, 4, -3, 2, 0, texMat('siding', { color: '#a35f4c' })); legs4(g, 4, 4, 2, wood('#5a3b26')); g.children.slice(-4).forEach((m) => (m.position.x -= 3)); const r = B(g, 4.6, 0.25, 4.6, -3, 5, 0, texMat('shingle', {})); r.rotation.z = 0.2; const mesh = mat('mesh', () => new THREE.MeshStandardMaterial({ color: '#9aa0a6', wireframe: true }), false); B(g, 6, 4, 4.5, 2, 0, 0, mesh); return g; }, { outdoor: true });
def('beehive', 'Beehive', 'Garden', [1.8, 1.6, 3.2], 300, () => { const g = new THREE.Group(); for (let i = 0; i < 3; i++) B(g, 1.7, 0.8, 1.4, 0, 0.8 + i * 0.8, 0, paint(['#f1d36b', '#f1efe9', '#9fb0a2'][i], 0.7)); B(g, 1.9, 0.15, 1.6, 0, 3.2, 0, metal()); legs4(g, 1.6, 1.3, 0.8, wood('#5a3b26')); return g; }, { outdoor: true });
def('playset', 'Playset / swing', 'Outdoor', [14, 9, 10], 3500, () => { const g = new THREE.Group(), w = wood('#9a7650'); for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(g, 0.35, 9, 0.35, -3 + sx * 2.3, 0, sz * 2.3, w); B(g, 5, 0.3, 5, -3, 4.5, 0, w); const s = B(g, 2.5, 0.2, 7, -3, 1, 5, paint('#2e7d32', 0.5)); s.rotation.x = 0.6; s.position.set(-3, 2.6, 5.4); B(g, 9, 0.4, 0.4, 3, 8.6, 0, w); for (const x of [-1, 7]) { const l = B(g, 0.35, 9, 0.35, x, 0, 0, w); } for (const x of [2, 4.5]) { C(g, 0.02, 6, x - 0.6, 2.4, 0, metal(), 0.02, 4); C(g, 0.02, 6, x + 0.6, 2.4, 0, metal(), 0.02, 4); B(g, 1.5, 0.1, 0.6, x, 2.3, 0, dark()); } return g; }, { outdoor: true });
def('trampoline', 'Trampoline 14 ft', 'Outdoor', [14, 14, 9], 600, () => { const g = new THREE.Group(); C(g, 7, 0.15, 0, 3, 0, dark(), 7, 32); const net = mat('net', () => new THREE.MeshStandardMaterial({ color: '#222', wireframe: true, transparent: true, opacity: 0.4 }), false); C(g, 7, 6, 0, 3, 0, net, 7, 24); for (let i = 0; i < 6; i++) C(g, 0.08, 3, Math.cos(i) * 6.8, 0, Math.sin(i) * 6.8, metal('#333')); return g; }, { outdoor: true });
def('pool', 'Pool 16×32 (in-ground look)', 'Structures', [20, 36, 0.4], 65000, () => { const g = new THREE.Group(); B(g, 20, 0.35, 36, 0, 0, 0, texMat('pavers', { color: '#cfc6b6' })); B(g, 16, 0.37, 32, 0, 0, 0, mat('poolwater', () => new THREE.MeshStandardMaterial({ color: '#3aa6c9', roughness: 0.05, metalness: 0.1, emissive: '#0d3d52', emissiveIntensity: 0.5 }))); return g; }, { outdoor: true });
def('lampPost', 'Lamp post', 'Outdoor', [1, 1, 8], 450, () => { const g = new THREE.Group(); C(g, 0.12, 7, 0, 0, 0, dark()); B(g, 0.8, 1.1, 0.8, 0, 7, 0, lampShade('#ffe7b0')); return g; }, { outdoor: true, light: true });
def('birdbath', 'Bird bath', 'Garden', [2, 2, 3], 150, () => { const g = new THREE.Group(), s = texMat('concrete', {}); C(g, 0.3, 2.6, 0, 0, 0, s, 0.5); C(g, 1, 0.3, 0, 2.6, 0, s, 0.6); C(g, 0.85, 0.02, 0, 2.89, 0, solid('#5aa7c6', { roughness: 0.05 })); return g; }, { outdoor: true });
def('boulder', 'Boulder', 'Garden', [4, 3, 2.5], 350, () => { const g = new THREE.Group(); const m = add(g, crownGeo(2), texMat('concrete', { color: '#8a857b' }), 0, 0.9, 0); m.scale.set(2, 1.3, 1.5); return g; }, { outdoor: true });
def('solarArray', 'Ground-mount solar (8 kW)', 'Structures', [20, 10, 7], 22000, () => { const g = new THREE.Group(); const p = B(g, 20, 0.15, 10, 0, 4, 0, mat('solar', () => new THREE.MeshStandardMaterial({ color: '#1b2a4a', roughness: 0.15, metalness: 0.6 }))); p.rotation.x = -0.6; for (const x of [-8, 0, 8]) { C(g, 0.12, 2.2, x, 0, 3, metal()); C(g, 0.12, 6, x, 0, -3, metal()); } return g; }, { outdoor: true });
def('flagpole', 'Flagpole 20 ft', 'Outdoor', [1, 1, 20], 600, () => { const g = new THREE.Group(); C(g, 0.1, 20, 0, 0, 0, metal('#d0d3d6'), 0.14); const f = B(g, 5, 3, 0.03, 2.6, 16.5, 0, mat('flag', () => new THREE.MeshStandardMaterial({ color: '#b22234', side: THREE.DoubleSide }), false)); f.castShadow = true; return g; }, { outdoor: true });
def('mailbox', 'Mailbox', 'Outdoor', [1, 2, 4], 120, () => { const g = new THREE.Group(); C(g, 0.1, 3.5, 0, 0, 0, wood('#5a3b26')); B(g, 0.8, 0.8, 1.8, 0, 3.4, 0, dark()); return g; }, { outdoor: true });
def('hammock', 'Hammock', 'Outdoor', [12, 4, 4], 250, () => { const g = new THREE.Group(); for (const x of [-5.6, 5.6]) { const p = C(g, 0.12, 4, x, 0, 0, metal('#333')); } const m = add(g, geo('ham', () => new THREE.CylinderGeometry(1.4, 1.4, 9, 12, 1, true, 0, Math.PI)), mat('hamm', () => new THREE.MeshStandardMaterial({ color: '#d9c8a0', side: THREE.DoubleSide }), false), 0, 3.3, 0); m.rotation.z = Math.PI / 2; m.rotation.x = Math.PI; m.scale.set(1, 1, 0.8); return g; }, { outdoor: true });

// Plants
for (const [k, t] of Object.entries(TREES)) def('tree_' + k, t.name, 'Trees', [t.spread, t.spread, t.h], t.cost, (o) => buildTree(k, o.seed || 1), { outdoor: true, plant: k, tree: true });
for (const [k, t] of Object.entries(SHRUBS)) def('shrub_' + k, t.name, 'Shrubs & Perennials', [t.spread, t.spread, t.h], t.cost, (o) => buildShrub(k, o.seed || 1), { outdoor: true, plant: k });
def('flowerBed', 'Flower bed (round 6 ft)', 'Shrubs & Perennials', [6, 6, 1.4], 180, () => { const g = new THREE.Group(); C(g, 3, 0.3, 0, 0, 0, texMat('mulch', {}), 3.1, 24); const rnd = seeded(4); for (let i = 0; i < 16; i++) { const a = rnd() * 6.28, d = rnd() * 2.4; const m = add(g, crownGeo(i), pmat('flower_bed' + (i % 4), ['#e8457a', '#f5d142', '#9a6ad6', '#ffffff'][i % 4]), Math.cos(a) * d, 0.6, Math.sin(a) * d, false); m.scale.set(0.45, 0.35, 0.45); } return g; }, { outdoor: true });

export const CATEGORIES_INTERIOR = ['Living', 'Dining', 'Kitchen', 'Bedroom', 'Office', 'Bath', 'Laundry', 'Rec', 'Lighting', 'Decor', 'Mechanical'];
export const CATEGORIES_EXTERIOR = ['Trees', 'Shrubs & Perennials', 'Garden', 'Outdoor', 'Structures'];

export function isPlant(type) { return !!(CATALOG[type] && CATALOG[type].plant); }
export function plantSpec(type) { const c = CATALOG[type]; return c && c.plant ? (TREES[c.plant] || SHRUBS[c.plant]) : null; }

export function buildItem(item) {
  const c = CATALOG[item.type];
  if (!c) return new THREE.Group();
  const g = c.build(item);
  g.userData.catalog = c;
  return g;
}

export function setLampsOn(on) {
  for (const m of lampMats) m.emissiveIntensity = on ? 1.6 : 0;
}
