import * as THREE from 'three';
import { paint, texMat, solid, mat } from './materials.js';

export const FENCES = {
  privacy: { name: 'Privacy – wood 6 ft', h: 6, cost: 45 },
  picket: { name: 'Picket – white 4 ft', h: 4, cost: 32 },
  horizontal: { name: 'Modern horizontal slat 5 ft', h: 5, cost: 55 },
  splitrail: { name: 'Split rail 3.5 ft', h: 3.5, cost: 18 },
  chainlink: { name: 'Chain link 4 ft', h: 4, cost: 20 },
  deerNet: { name: 'Garden / deer fence 7 ft', h: 7, cost: 14 },
  stonewall: { name: 'Dry-stack stone wall 3 ft', h: 3, cost: 95 },
  retaining: { name: 'Block retaining wall 3 ft', h: 3, cost: 70 },
  hedge: { name: 'Hedge row (boxwood/privet)', h: 4, cost: 28 },
};

export function buildFence(f, site) {
  const spec = FENCES[f.type] || FENCES.privacy;
  const H = f.h ?? spec.h;
  const g = new THREE.Group();
  const pick = { kind: 'fence', id: f.id };
  const wood = texMat('woodgrain', { color: f.type === 'horizontal' ? '#6b4a33' : '#9a7650' });
  const white = paint('#f4f3ef', 0.6);
  const add = (geo, m, x, y, z, ry = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = o.receiveShadow = true; o.userData.pick = pick; g.add(o); return o; };
  for (let s = 0; s < f.pts.length - 1; s++) {
    const [ax, az] = f.pts[s], [bx, bz] = f.pts[s + 1];
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(L / (f.type === 'stonewall' || f.type === 'retaining' || f.type === 'hedge' ? 4 : 8)));
    const ry = -Math.atan2(bz - az, bx - ax);
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
      const y0 = site.height(x0, z0), y1 = site.height(x1, z1), base = Math.min(y0, y1) - 0.3, top = Math.max(y0, y1) + H;
      const len = L / n, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const post = (x, z, y, h, m, w = 0.4) => add(new THREE.BoxGeometry(w, h, w), m, x, y + h / 2, z, ry);
      switch (f.type) {
        case 'stonewall':
          add(new THREE.BoxGeometry(len + 0.1, top - base, 1.6), texMat('stone', {}), cx, (top + base) / 2, cz, ry);
          break;
        case 'retaining':
          add(new THREE.BoxGeometry(len + 0.05, top - base + 1, 1), texMat('block', {}), cx, (top + base - 1) / 2, cz, ry);
          add(new THREE.BoxGeometry(len + 0.05, 0.25, 1.3), texMat('concrete', {}), cx, top + 0.12, cz, ry);
          break;
        case 'hedge': {
          const o = add(new THREE.IcosahedronGeometry(1, 1), mat('hedge', () => new THREE.MeshStandardMaterial({ color: '#3d6a2c', roughness: 0.9, flatShading: true }), false), cx, (y0 + y1) / 2 + H * 0.5, cz, ry);
          o.scale.set(len * 0.62, H * 0.55, 1.6);
          break;
        }
        case 'privacy':
          post(x0, z0, y0 - 0.3, H + 0.6, wood);
          add(new THREE.BoxGeometry(len, top - base - 0.3, 0.12), wood, cx, (top - 0.1 + base + 0.3) / 2, cz, ry);
          break;
        case 'horizontal':
          post(x0, z0, y0 - 0.3, H + 0.5, solid('#2a2a2a'));
          for (let k = 0; k < Math.round(H / 0.5); k++) add(new THREE.BoxGeometry(len, 0.4, 0.1), wood, cx, Math.max(y0, y1) + 0.3 + k * 0.5, cz, ry);
          break;
        case 'picket': {
          post(x0, z0, y0 - 0.3, H + 0.5, white);
          for (const hh of [1, H - 0.8]) add(new THREE.BoxGeometry(len, 0.25, 0.12), white, cx, Math.max(y0, y1) + hh, cz, ry);
          const np = Math.floor(len / 0.45);
          for (let k = 0; k < np; k++) { const t = (k + 0.5) / np; const px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t; add(new THREE.BoxGeometry(0.28, H, 0.07), white, px, site.height(px, pz) + H / 2 + 0.1, pz, ry); }
          break;
        }
        case 'splitrail':
          post(x0, z0, y0 - 0.3, H + 0.3, wood, 0.55);
          for (const hh of [1.4, 2.9]) { const r = add(new THREE.CylinderGeometry(0.22, 0.22, len, 6), wood, cx, (y0 + y1) / 2 + hh, cz, ry); r.rotation.set(0, ry, Math.PI / 2, 'YXZ'); }
          break;
        case 'chainlink':
        case 'deerNet': {
          const m = f.type === 'chainlink' ? solid('#9aa0a6', { metalness: 0.7 }) : solid('#222', { metalness: 0.2 });
          add(new THREE.CylinderGeometry(0.1, 0.1, H + 0.4, 8), m, x0, y0 + H / 2, z0);
          const net = mat('fnet' + f.type, () => new THREE.MeshStandardMaterial({ color: f.type === 'chainlink' ? '#b0b5b9' : '#1e1e1e', transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }), false);
          add(new THREE.PlaneGeometry(len, top - base - 0.3), net, cx, (top + base + 0.3) / 2, cz, ry).castShadow = false;
          break;
        }
      }
    }
    if (s === f.pts.length - 2 && !['stonewall', 'retaining', 'hedge'].includes(f.type)) {
      const y = site.height(bx, bz);
      add(new THREE.BoxGeometry(0.4, H + 0.6, 0.4), f.type === 'picket' ? white : wood, bx, y + H / 2, bz, ry);
    }
  }
  return g;
}
