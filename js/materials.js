import * as THREE from 'three';
import { texture } from './textures.js';

// Shared material registry. House + item materials honor the cutaway clipping planes.
const cache = new Map();
export const clipState = { planes: [] };
const clipped = new Set();

// Back faces of clipped solids render dark so cut walls read as filled (poché) in cutaway/plan views.
const poche = (sh) => {
  sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  if (!gl_FrontFacing) gl_FragColor = vec4(0.13, 0.14, 0.16, 1.0);');
};

export function mat(key, make, clip = true) {
  if (cache.has(key)) return cache.get(key);
  const m = make();
  if (clip) {
    clipped.add(m);
    m.clippingPlanes = clipState.planes;
    if (!m.transparent && m.side !== THREE.BackSide) { m.side = THREE.DoubleSide; m.shadowSide = THREE.FrontSide; m.onBeforeCompile = poche; }
  }
  cache.set(key, m);
  return m;
}
export function setClipPlanes(planes) {
  clipState.planes = planes;
  for (const m of clipped) { m.clippingPlanes = planes; m.needsUpdate = true; }
}
export const paint = (color, rough = 0.9) => mat('paint' + color + rough, () => new THREE.MeshStandardMaterial({ color, roughness: rough }));
export const solid = (color, opts = {}) => mat('solid' + color + JSON.stringify(opts), () => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...opts }));
export function texMat(name, opts = {}, extra = {}) {
  return mat('tex' + name + JSON.stringify(opts) + JSON.stringify(extra), () => new THREE.MeshStandardMaterial({ map: texture(name, opts), roughness: 0.85, ...extra }));
}
export const glassMat = () => mat('glass', () => new THREE.MeshStandardMaterial({ color: '#5d7c8f', roughness: 0.04, metalness: 0.35, transparent: true, opacity: 0.5, depthWrite: false, emissive: '#ffcf85', emissiveIntensity: 0 }));

// Materials outside the house shell (garage, porch, yard items) must ignore the cutaway plane.
const unclippedCache = new Map();
export function unclip(root) {
  const swap = (m) => {
    if (!m || !clipped.has(m)) return m;
    if (!unclippedCache.has(m)) { const c = m.clone(); c.clippingPlanes = null; unclippedCache.set(m, c); }
    return unclippedCache.get(m);
  };
  root.traverse((o) => { if (o.material) o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material); });
}
export const polyMat = () => mat('poly', () => new THREE.MeshStandardMaterial({ color: '#dfe8ea', roughness: 0.3, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));

export const FLOORS = {
  subfloor: { name: 'Subfloor (as-is)', tex: 'subfloor', cost: 0 },
  hardwood: { name: 'Oak hardwood', tex: 'hardwood', cost: 11 },
  walnut: { name: 'Walnut hardwood', tex: 'hardwood', opts: { color: '#5e3b24' }, cost: 14 },
  whiteoak: { name: 'White oak (light)', tex: 'hardwood', opts: { color: '#c9ab82' }, cost: 13 },
  vinyl: { name: 'Luxury vinyl plank', tex: 'vinyl', cost: 6 },
  tile: { name: 'Porcelain tile', tex: 'tile', cost: 12 },
  slate: { name: 'Slate tile', tex: 'slate', cost: 16 },
  carpet: { name: 'Carpet', tex: 'carpet', cost: 5 },
  concrete: { name: 'Concrete', tex: 'concrete', cost: 0 },
  polished: { name: 'Polished concrete', tex: 'concrete', opts: { color: '#8f8f8b' }, cost: 7 },
  plywood: { name: 'Plywood decking', tex: 'plywood', cost: 2 },
};
export const floorMat = (k) => {
  const f = FLOORS[k] || FLOORS.subfloor;
  return texMat(f.tex, f.opts || {}, { roughness: k === 'polished' || k === 'tile' ? 0.45 : 0.8 });
};

export const EXTERIORS = {
  brick: { name: 'Red brick (as-is)', tex: 'brick', cost: 0 },
  brickWhite: { name: 'Painted brick – white', tex: 'brick', opts: { color: '#ecebe6', mortar: '#dcdad3' }, cost: 4 },
  brickLime: { name: 'Limewash brick – greige', tex: 'brick', opts: { color: '#b9ada0', mortar: '#cfc8bd' }, cost: 5 },
  brickBlack: { name: 'Painted brick – black', tex: 'brick', opts: { color: '#2b2c2e', mortar: '#3a3b3d' }, cost: 4 },
  siding: { name: 'Lap siding – white', tex: 'siding', cost: 9 },
  sidingNavy: { name: 'Lap siding – navy', tex: 'siding', opts: { color: '#34475e' }, cost: 9 },
  sidingSage: { name: 'Lap siding – sage', tex: 'siding', opts: { color: '#8e9b84' }, cost: 9 },
  stucco: { name: 'Stucco', tex: 'stucco', cost: 10 },
  stone: { name: 'Stone veneer', tex: 'stone', cost: 28 },
  block: { name: 'CMU block', tex: 'block', cost: 0 },
};
export const extMat = (k) => {
  const e = EXTERIORS[k] || EXTERIORS.brick;
  return texMat(e.tex, e.opts || {});
};

export const ROOFS = {
  charcoal: { name: 'Asphalt shingle – charcoal', tex: 'shingle', opts: { color: '#474a4f' }, cost: 5.5 },
  brown: { name: 'Asphalt shingle – weathered wood', tex: 'shingle', opts: { color: '#5e5044' }, cost: 5.5 },
  black: { name: 'Asphalt shingle – black', tex: 'shingle', opts: { color: '#26272a' }, cost: 5.5 },
  metalBlack: { name: 'Standing seam – black', tex: 'metal', opts: { color: '#25292c' }, cost: 12 },
  metalGreen: { name: 'Standing seam – forest', tex: 'metal', opts: { color: '#2f4a3a' }, cost: 12 },
  metalGalv: { name: 'Standing seam – galvalume', tex: 'metal', opts: { color: '#9aa1a6' }, cost: 11 },
};
export const roofMat = (k) => {
  const r = ROOFS[k] || ROOFS.charcoal;
  return texMat(r.tex, r.opts, { roughness: r.tex === 'metal' ? 0.45 : 0.9, metalness: r.tex === 'metal' ? 0.5 : 0, side: THREE.DoubleSide });
};

export const PAINTS = ['#efeae0', '#f6f4ef', '#e4ddd0', '#d8d2c4', '#c9c2b2', '#b7c1b0', '#9fb0a2', '#c6d3d9', '#9fb3c4', '#56687a', '#2f3d4c', '#e7d3b8', '#d9b99b', '#b5835a', '#a35f4c', '#6e3c3c', '#3d3d3d', '#ffffff'];
