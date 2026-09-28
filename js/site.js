import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { FRAME, planToWorld, planPolyToWorld } from './frame.js';
import { signedDistPoly, pointInPoly, distToPolyline, smoothstep, polyArea, polyCentroid, bearingStr, seeded, DEG } from './util.js';
import { groundPattern } from './textures.js';

export const NEAR = 200;          // near terrain half-size (ft)
const NSTEP = 2;                  // near terrain grid (ft)
export const NN = NEAR * 2 / NSTEP + 1;
const GC = 2048;                  // ground canvas px
export const PX_PER_FT = GC / (NEAR * 2);

// Grading pads (plan frame) keep patios/walkout level next to the house.
const PADS = [
  { pts: [[0, 0], [24, 0], [24, 11.8], [9.33, 11.8], [9.33, 30.5], [0, 30.5]], e: -0.6, fall: 0 },
  { pts: [[-14, -12], [0, -12], [0, 30.5], [9.33, 30.5], [9.33, 48.85], [9.6, 52], [3.3, 62], [-13, 66]], e: -0.45, fall: 14 },
  { pts: [[0, 0], [0, -4], [8, -12], [20, -15.5], [36, -17.5], [44, -12], [41, -2], [40.6, 9.3], [38.5, 11.8], [24, 11.8], [24, 0]], e: -0.45, fall: 10 },
  { pts: [[9.33, 48.85], [19.6, 48.85], [19.6, 56], [9.33, 56]], grad: [9.5, -0.45, 19.6, -8.35], fall: 5 },
  { pts: [[38.5, 11.8], [59.8, 11.8], [59.8, 44.4], [51.6, 57], [19.6, 57], [19.6, 48.85], [38.5, 48.85]], e: -8.35, fall: 14 },
];

export const MATERIALS_GROUND = {
  concrete: { name: 'Concrete', cost: 9 },
  pavers: { name: 'Pavers', cost: 18 },
  flagstone: { name: 'Flagstone', cost: 24 },
  gravel: { name: 'Gravel', cost: 3 },
  asphalt: { name: 'Asphalt', cost: 5 },
  mulch: { name: 'Mulch bed', cost: 2 },
  flowers: { name: 'Flower bed', cost: 8 },
  dirt: { name: 'Garden soil', cost: 1.5 },
  grass: { name: 'Lawn (sod)', cost: 1.2 },
  meadow: { name: 'Meadow / wildflowers', cost: 0.6 },
  deck: { name: 'Wood deck (ground)', cost: 35 },
  water: { name: 'Pond / water', cost: 30 },
};

function addWorldPosVarying(material, fragGlsl) {
  // distinct cache key per variant, otherwise three.js reuses the first compiled program
  material.customProgramCacheKey = () => 'wpos:' + fragGlsl;
  material.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('void main() {', 'void main() {\n' + fragGlsl);
  };
}

const c7 = Math.cos(FRAME.rotDeg * DEG), s7 = Math.sin(FRAME.rotDeg * DEG);
const CORE_DISCARD = `{
  vec2 d = vWPos.xz - vec2(${FRAME.tx.toFixed(3)}, ${FRAME.tz.toFixed(3)});
  vec2 p = vec2(${c7.toFixed(6)} * d.x + ${s7.toFixed(6)} * d.y, -${s7.toFixed(6)} * d.x + ${c7.toFixed(6)} * d.y);
  if (p.x > 9.45 && p.x < 38.4 && p.y > 11.9 && p.y < 48.75) discard;
}`;

export class Site {
  constructor(app) {
    this.app = app;
    this.group = new THREE.Group();
    this.group.name = 'site';
    this.layers = {};
    this.lineMats = [];
  }

  async load() {
    const get = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u); return r; });
    const [site, bin, canopy] = await Promise.all([
      get('data/site.json').then((r) => r.json()),
      get('data/terrain.bin').then((r) => r.arrayBuffer()),
      get('data/canopy.json').then((r) => r.json()),
    ]);
    this.data = site;
    this.T = site.terrain;
    this.grid = new Uint16Array(bin);
    this.canopyPts = canopy;
    const img = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    [this.aerialFar, this.aerialNear] = await Promise.all([img('data/aerial_far.jpg'), img('data/aerial_near.jpg')]);
    this.pads = PADS.map((p) => ({ ...p, w: planPolyToWorld(p.pts) }));
    const G = app_garage(this.app);
    const ge = this.natural(G.cx, G.cz);
    this.garageFloor = ge;
    this.pads.push({ w: [[G.cx - G.w / 2 - 2, G.cz - G.d / 2 - 2], [G.cx + G.w / 2 + 2, G.cz - G.d / 2 - 2], [G.cx + G.w / 2 + 2, G.cz + G.d / 2 + 2], [G.cx - G.w / 2 - 2, G.cz + G.d / 2 + 2]], e: ge, fall: 12 });
    this.parcel = site.parcel.pts;
    this.parcelAcres = Math.abs(polyArea(this.parcel)) / 43560;
  }

  // ---------------------------------------------------------------- heights
  natural(x, z) {
    const T = this.T;
    let i = (x - T.x0) / T.step, j = (z - T.z0) / T.step;
    i = Math.min(Math.max(i, 0), T.nx - 1.001); j = Math.min(Math.max(j, 0), T.nz - 1.001);
    const i0 = i | 0, j0 = j | 0, fi = i - i0, fj = j - j0, n = T.nx, g = this.grid;
    const h = (g[j0 * n + i0] * (1 - fi) + g[j0 * n + i0 + 1] * fi) * (1 - fj) + (g[(j0 + 1) * n + i0] * (1 - fi) + g[(j0 + 1) * n + i0 + 1] * fi) * fj;
    return h * T.scale + T.min - FRAME.mainFloorASL;
  }
  graded(x, z) {
    const h0 = this.natural(x, z);
    let inside = null, sw = 0, st = 0, maxW = 0;
    for (const p of this.pads) {
      const d = signedDistPoly(x, z, p.w);
      const target = p.grad ? this.padGrad(p, x, z) : p.e;
      if (d <= 0) { inside = target; continue; }
      if (!p.fall || d >= p.fall) continue;
      const w = 1 - smoothstep(0, p.fall, d);
      sw += w; st += w * target; maxW = Math.max(maxW, w);
    }
    if (inside !== null) return inside;
    if (sw === 0) return h0;
    return h0 + (st / sw - h0) * maxW;
  }
  padGrad(p, x, z) {
    const [x0, e0, x1, e1] = p.grad;
    const c = Math.cos(FRAME.rotDeg * DEG), s = Math.sin(FRAME.rotDeg * DEG);
    const px = c * (x - FRAME.tx) + s * (z - FRAME.tz);
    const t = Math.min(1, Math.max(0, (px - x0) / (x1 - x0)));
    return e0 + (e1 - e0) * t;
  }
  height(x, z) {
    if (Math.abs(x) < NEAR && Math.abs(z) < NEAR && this.nearH) {
      let i = (x + NEAR) / NSTEP, j = (z + NEAR) / NSTEP;
      const i0 = Math.min(NN - 2, i | 0), j0 = Math.min(NN - 2, j | 0), fi = i - i0, fj = j - j0, H = this.nearH;
      return (H[j0 * NN + i0] * (1 - fi) + H[j0 * NN + i0 + 1] * fi) * (1 - fj) + (H[(j0 + 1) * NN + i0] * (1 - fi) + H[(j0 + 1) * NN + i0 + 1] * fi) * fj;
    }
    return this.natural(x, z);
  }
  slopeAt(x, z) {
    const e = 1.5;
    const gx = (this.height(x + e, z) - this.height(x - e, z)) / (2 * e);
    const gz = (this.height(x, z + e) - this.height(x, z - e)) / (2 * e);
    return Math.hypot(gx, gz) * 100;
  }

  // ---------------------------------------------------------------- build
  build(state) {
    this.state = state;
    this.sculpt = state.sculpt ? Float32Array.from(state.sculpt) : new Float32Array(NN * NN);
    this.nearBase = new Float32Array(NN * NN);
    for (let j = 0; j < NN; j++) for (let i = 0; i < NN; i++) this.nearBase[j * NN + i] = this.graded(-NEAR + i * NSTEP, -NEAR + j * NSTEP);
    this.nearH = new Float32Array(NN * NN);
    for (let k = 0; k < this.nearH.length; k++) this.nearH[k] = this.nearBase[k] + this.sculpt[k];

    // far terrain (aerial)
    const T = this.T;
    const fg = new THREE.PlaneGeometry((T.nx - 1) * T.step, (T.nz - 1) * T.step, T.nx - 1, T.nz - 1);
    fg.rotateX(-Math.PI / 2);
    const fp = fg.attributes.position;
    for (let k = 0; k < fp.count; k++) {
      const i = k % T.nx, j = (k / T.nx) | 0;
      fp.setY(k, this.grid[j * T.nx + i] * T.scale + T.min - FRAME.mainFloorASL);
    }
    fg.computeVertexNormals();
    const farTex = new THREE.Texture(this.aerialFar);
    farTex.colorSpace = THREE.SRGBColorSpace; farTex.anisotropy = 8; farTex.needsUpdate = true;
    const farMat = new THREE.MeshStandardMaterial({ map: farTex, roughness: 1 });
    addWorldPosVarying(farMat, `if (abs(vWPos.x) < ${(NEAR - 0.4).toFixed(2)} && abs(vWPos.z) < ${(NEAR - 0.4).toFixed(2)}) discard;`);
    this.far = new THREE.Mesh(fg, farMat);
    this.far.receiveShadow = true;
    this.far.name = 'farTerrain';
    this.group.add(this.far);

    // near terrain (designed ground canvas)
    const ng = new THREE.PlaneGeometry(NEAR * 2, NEAR * 2, NN - 1, NN - 1);
    ng.rotateX(-Math.PI / 2);
    this.nearGeo = ng;
    this.applyNearHeights();
    this.gcanvas = document.createElement('canvas');
    this.gcanvas.width = this.gcanvas.height = GC;
    this.gctx = this.gcanvas.getContext('2d');
    this.paintCanvas = document.createElement('canvas');
    this.paintCanvas.width = this.paintCanvas.height = GC;
    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.width = this.overlayCanvas.height = NN;
    this.gtex = new THREE.CanvasTexture(this.gcanvas);
    this.gtex.colorSpace = THREE.SRGBColorSpace;
    this.gtex.anisotropy = 16;
    const nearMat = new THREE.MeshStandardMaterial({ map: this.gtex, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    addWorldPosVarying(nearMat, CORE_DISCARD);
    this.near = new THREE.Mesh(ng, nearMat);
    this.near.receiveShadow = true;
    this.near.name = 'nearTerrain';
    this.group.add(this.near);

    this.buildContext();
    this.buildCanopy();
    this.buildParcel();
    this.buildContours();
    this.buildEasements();
    this.redrawGround();
    return this.group;
  }

  applyNearHeights(rowsFrom = 0, rowsTo = NN - 1) {
    const p = this.nearGeo.attributes.position;
    for (let j = rowsFrom; j <= rowsTo; j++) for (let i = 0; i < NN; i++) p.setY(j * NN + i, this.nearH[j * NN + i]);
    p.needsUpdate = true;
    this.nearGeo.computeVertexNormals();
    this.nearGeo.computeBoundingSphere();
  }

  // ---------------------------------------------------------------- ground canvas
  worldToCanvas(x, z) { return [(x + NEAR) * PX_PER_FT, (z + NEAR) * PX_PER_FT]; }

  redrawGround() {
    const ctx = this.gctx, st = this.state;
    const aerial = st.view?.groundMode === 'aerial';
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(this.aerialNear, 0, 0, GC, GC);
    if (!aerial) {
      if (!this.grassLayer) {
        const c = document.createElement('canvas');
        c.width = c.height = GC;
        const g = c.getContext('2d');
        g.fillStyle = groundPattern(g, 'grass', PX_PER_FT, { color: '#5f8540' });
        g.fillRect(0, 0, GC, GC);
        const rnd = seeded(11);
        for (let i = 0; i < 260; i++) {
          g.fillStyle = `rgba(${rnd() > 0.5 ? '30,50,10' : '160,180,90'},${0.05 + rnd() * 0.06})`;
          g.beginPath(); g.arc(rnd() * GC, rnd() * GC, 40 + rnd() * 160, 0, 7); g.fill();
        }
        g.globalCompositeOperation = 'destination-in';
        const rg = g.createRadialGradient(GC / 2, GC / 2, GC * 0.36, GC / 2, GC / 2, GC * 0.5);
        rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = rg; g.fillRect(0, 0, GC, GC);
        this.grassLayer = c;
      }
      ctx.drawImage(this.grassLayer, 0, 0);
    }
    for (const h of st.hardscape) this.drawHardscape(ctx, h, aerial);
    ctx.drawImage(this.paintCanvas, 0, 0);
    if (this.overlayMode && this.overlayMode !== 'none') {
      ctx.globalAlpha = 0.62;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.overlayCanvas, 0, 0, GC, GC);
      ctx.globalAlpha = 1;
    }
    this.gtex.needsUpdate = true;
  }

  drawHardscape(ctx, h, aerial) {
    if (!h.pts || h.pts.length < 2) return;
    ctx.save();
    ctx.globalAlpha = aerial ? 0.55 : 1;
    const pat = groundPattern(ctx, h.mat, PX_PER_FT);
    ctx.beginPath();
    h.pts.forEach(([x, z], i) => { const [cx, cy] = this.worldToCanvas(x, z); i ? ctx.lineTo(cx, cy) : ctx.moveTo(cx, cy); });
    if (h.kind === 'path') {
      ctx.lineJoin = ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(40,35,25,0.45)';
      ctx.lineWidth = (h.width + 0.6) * PX_PER_FT;
      ctx.stroke();
      ctx.strokeStyle = pat;
      ctx.lineWidth = h.width * PX_PER_FT;
      ctx.stroke();
    } else {
      ctx.closePath();
      ctx.fillStyle = pat;
      ctx.fill();
      ctx.strokeStyle = h.mat === 'mulch' || h.mat === 'flowers' ? 'rgba(60,40,20,0.7)' : 'rgba(40,35,25,0.45)';
      ctx.lineWidth = 0.5 * PX_PER_FT;
      ctx.stroke();
    }
    if (h.id === this.app.selectedHardscapeId) {
      ctx.globalAlpha = 1;
      ctx.setLineDash([12, 8]);
      ctx.strokeStyle = '#ffd24a';
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    ctx.restore();
  }

  paintAt(x, z, radius, matName, erase = false) {
    const ctx = this.paintCanvas.getContext('2d');
    const [cx, cy] = this.worldToCanvas(x, z);
    ctx.save();
    ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    ctx.fillStyle = erase ? '#000' : groundPattern(ctx, matName, PX_PER_FT);
    ctx.beginPath();
    ctx.arc(cx, cy, radius * PX_PER_FT, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  clearPaint() { this.paintCanvas.getContext('2d').clearRect(0, 0, GC, GC); this.redrawGround(); }
  paintDataURL() { return this.paintCanvas.toDataURL('image/png'); }
  async loadPaint(url) {
    const ctx = this.paintCanvas.getContext('2d');
    ctx.clearRect(0, 0, GC, GC);
    if (!url) return;
    await new Promise((res) => { const i = new Image(); i.onload = () => { ctx.drawImage(i, 0, 0); res(); }; i.onerror = res; i.src = url; });
  }

  // ---------------------------------------------------------------- sculpt
  sculptAt(x, z, radius, strength, mode, target) {
    const i0 = Math.max(0, Math.floor((x - radius + NEAR) / NSTEP)), i1 = Math.min(NN - 1, Math.ceil((x + radius + NEAR) / NSTEP));
    const j0 = Math.max(0, Math.floor((z - radius + NEAR) / NSTEP)), j1 = Math.min(NN - 1, Math.ceil((z + radius + NEAR) / NSTEP));
    if (i0 > i1 || j0 > j1) return;
    const H = this.nearH, S = this.sculpt, B = this.nearBase;
    const snapshot = mode === 'smooth' ? H.slice() : null;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = -NEAR + i * NSTEP, pz = -NEAR + j * NSTEP;
      const d = Math.hypot(px - x, pz - z);
      if (d > radius) continue;
      const f = (1 - smoothstep(0, radius, d)) * strength;
      const k = j * NN + i;
      if (i === 0 || j === 0 || i === NN - 1 || j === NN - 1) continue;
      let nh = H[k];
      if (mode === 'raise') nh += f;
      else if (mode === 'lower') nh -= f;
      else if (mode === 'flatten') nh += (target - nh) * Math.min(1, f * 0.5);
      else if (mode === 'smooth') {
        const avg = (snapshot[k - 1] + snapshot[k + 1] + snapshot[k - NN] + snapshot[k + NN] + snapshot[k]) / 5;
        nh += (avg - nh) * Math.min(1, f * 0.6);
      }
      H[k] = nh; S[k] = nh - B[k];
    }
    this.applyNearHeights(j0, j1);
  }
  resetSculpt() { this.sculpt.fill(0); this.nearH.set(this.nearBase); this.applyNearHeights(); }
  cutFillVolume() {
    let cut = 0, fill = 0;
    for (const v of this.sculpt) { if (v > 0) fill += v; else cut -= v; }
    const a = NSTEP * NSTEP / 27;
    return { cut: cut * a, fill: fill * a };
  }

  // ---------------------------------------------------------------- overlays
  setOverlay(mode) {
    this.overlayMode = mode;
    if (mode === 'slope' || mode === 'elevation') {
      const ctx = this.overlayCanvas.getContext('2d');
      const img = ctx.createImageData(NN, NN);
      let lo = Infinity, hi = -Infinity;
      for (const v of this.nearH) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      for (let j = 0; j < NN; j++) for (let i = 0; i < NN; i++) {
        const k = j * NN + i;
        let r, g, b;
        if (mode === 'slope') {
          const ii = Math.min(NN - 2, Math.max(1, i)), jj = Math.min(NN - 2, Math.max(1, j));
          const gx = (this.nearH[jj * NN + ii + 1] - this.nearH[jj * NN + ii - 1]) / (2 * NSTEP);
          const gz = (this.nearH[(jj + 1) * NN + ii] - this.nearH[(jj - 1) * NN + ii]) / (2 * NSTEP);
          const s = Math.hypot(gx, gz) * 100;
          [r, g, b] = s < 5 ? [60, 170, 80] : s < 10 ? [170, 210, 70] : s < 15 ? [245, 200, 60] : s < 25 ? [240, 130, 40] : [210, 50, 40];
        } else {
          const t = (this.nearH[k] - lo) / (hi - lo || 1);
          const c = new THREE.Color().setHSL(0.66 - t * 0.66, 0.75, 0.5);
          [r, g, b] = [c.r * 255, c.g * 255, c.b * 255];
        }
        img.data.set([r, g, b, 255], k * 4);
      }
      ctx.putImageData(img, 0, 0);
      this.overlayRange = [lo, hi];
    }
    this.redrawGround();
  }

  // ---------------------------------------------------------------- context: neighbors, roads, buildings
  drapeLine(pts, lift = 0.6, step = 4) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
      for (let k = 0; k < n; k++) { const t = k / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t; out.push(x, this.height(x, z) + lift, z); }
    }
    const [lx, lz] = pts[pts.length - 1];
    out.push(lx, this.height(lx, lz) + lift, lz);
    return out;
  }
  fatLine(pts, color, width, lift = 0.6, dashed = false) {
    const g = new LineGeometry();
    g.setPositions(this.drapeLine(pts, lift));
    const m = new LineMaterial({ color, linewidth: width, dashed, dashSize: 6, gapSize: 4, transparent: true, opacity: 0.95, depthTest: true });
    m.resolution.set(innerWidth, innerHeight);
    this.lineMats.push(m);
    const l = new Line2(g, m);
    l.computeLineDistances();
    return l;
  }
  label(text, x, z, cls = 'site-label', lift = 3) {
    const d = document.createElement('div');
    d.className = cls;
    d.innerHTML = text;
    const o = new CSS2DObject(d);
    o.position.set(x, this.height(x, z) + lift, z);
    return o;
  }

  buildContext() {
    const nb = new THREE.Group(); nb.name = 'neighbors';
    const pos = [];
    for (const p of this.data.neighbors) {
      const d = this.drapeLine(p.pts, 0.5, 10);
      for (let k = 0; k < d.length - 3; k += 3) pos.push(d[k], d[k + 1], d[k + 2], d[k + 3], d[k + 4], d[k + 5]);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    nb.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45 })));
    this.group.add(nb);
    this.layers.neighbors = nb;

    const bg = new THREE.Group(); bg.name = 'buildings';
    const wallM = new THREE.MeshStandardMaterial({ color: '#d8d0c2', roughness: 0.9 });
    const roofM = new THREE.MeshStandardMaterial({ color: '#5b5752', roughness: 0.9 });
    this.buildingPolys = [];
    for (const b of this.data.buildings) {
      const pts = b.pts.slice(0, -1);
      if (pts.length < 3) continue;
      this.buildingPolys.push(pts);
      const H = b.type === 'house' ? 17 : b.type === 'garage' ? 10 : b.type === 'shed' ? 8 : 20;
      const base = Math.min(...pts.map(([x, z]) => this.height(x, z))) - 1;
      const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
      const eg = new THREE.ExtrudeGeometry(shape, { depth: H + 1, bevelEnabled: false });
      eg.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(eg, [roofM, wallM]);
      m.position.y = base;
      m.castShadow = m.receiveShadow = true;
      m.userData.pick = { kind: 'neighbor', addr: b.addr, type: b.type };
      bg.add(m);
    }
    this.group.add(bg);
    this.layers.buildings = bg;

    const rl = new THREE.Group(); rl.name = 'roadLabels';
    const seen = new Set();
    for (const r of this.data.roads) {
      if (!r.name || seen.has(r.name)) continue;
      const m = r.pts[(r.pts.length / 2) | 0];
      if (Math.hypot(m[0], m[1]) > 800) continue;
      seen.add(r.name);
      rl.add(this.label(r.name, m[0], m[1], 'road-label', 4));
    }
    this.group.add(rl);
    this.layers.roadLabels = rl;
  }

  buildCanopy() {
    const rnd = seeded(3);
    const keep = [];
    for (const [x, z, r] of this.canopyPts) {
      let ok = true;
      for (const b of this.buildingPolys) { if (Math.abs(b[0][0] - x) < 90 && Math.abs(b[0][1] - z) < 90 && signedDistPoly(x, z, b) < 10) { ok = false; break; } }
      if (ok) for (const rd of this.data.roads) { if (rd.type !== 'service' && distToPolyline(x, z, rd.pts).d < 16) { ok = false; break; } }
      if (ok) keep.push([x, z, r, rnd()]);
    }
    this.canopy = keep;
    const n = keep.length;
    const crownG = new THREE.IcosahedronGeometry(1, 1);
    const p = crownG.attributes.position;
    for (let k = 0; k < p.count; k++) { const s = 0.85 + Math.abs(Math.sin(k * 12.9898) * 43758.5453 % 0.3); p.setXYZ(k, p.getX(k) * s, p.getY(k) * s, p.getZ(k) * s); }
    crownG.computeVertexNormals();
    const coneG = new THREE.ConeGeometry(1, 1, 8);
    const trunkG = new THREE.CylinderGeometry(0.5, 0.8, 1, 6);
    this.canopyMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true });
    const crowns = new THREE.InstancedMesh(crownG, this.canopyMat, n);
    const cones = new THREE.InstancedMesh(coneG, new THREE.MeshStandardMaterial({ color: '#35553a', roughness: 0.9, flatShading: true }), n);
    const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: '#4b3a2c', roughness: 1 }), n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this.canopyInfo = [];
    keep.forEach(([x, z, r, u], i) => {
      const y = this.height(x, z);
      const conifer = u < 0.14;
      const H = 38 + u * 40;
      const cr = r * (0.9 + u * 0.3);
      trunks.setMatrixAt(i, m4.compose(ps.set(x, y + H * 0.3, z), q.identity(), sc.set(H * 0.012 + 0.4, H * 0.6, H * 0.012 + 0.4)));
      if (conifer) {
        cones.setMatrixAt(i, m4.compose(ps.set(x, y + H * 0.55, z), q, sc.set(cr * 0.65, H * 0.85, cr * 0.65)));
        crowns.setMatrixAt(i, zero);
      } else {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), u * 6.28);
        crowns.setMatrixAt(i, m4.compose(ps.set(x, y + H * 0.66, z), q, sc.set(cr, H * 0.34, cr)));
        cones.setMatrixAt(i, zero);
        q.identity();
      }
      this.canopyInfo.push({ x, z, conifer, u });
    });
    for (const im of [crowns, cones, trunks]) { im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; }
    const g = new THREE.Group(); g.name = 'canopy';
    g.add(crowns, cones, trunks);
    this.canopyMeshes = { crowns, cones, trunks };
    this.group.add(g);
    this.layers.canopy = g;
    this.applyCanopySeason('summer');
    this.applyCanopyClearing();
  }
  applyCanopySeason(season) {
    const { crowns } = this.canopyMeshes;
    const pal = {
      spring: ['#7fae4d', '#8dbb57', '#6e9f45', '#a7c86a'],
      summer: ['#4b7433', '#577f3a', '#3f6a2e', '#5f8a42'],
      fall: ['#c8662a', '#d99a2b', '#a8412a', '#b7862f', '#6f7a34'],
      winter: ['#6a5a4a', '#75644f', '#5f5245'],
    }[season];
    const c = new THREE.Color();
    this.canopyInfo.forEach((t, i) => crowns.setColorAt(i, c.set(pal[Math.floor(t.u * 97) % pal.length])));
    crowns.instanceColor.needsUpdate = true;
    this.canopyMat.opacity = 1;
    crowns.visible = true;
    crowns.material.transparent = season === 'winter';
    crowns.material.opacity = season === 'winter' ? 0.35 : 1;
    crowns.material.needsUpdate = true;
  }
  applyCanopyClearing() {
    const cleared = new Set(this.state.clearedCanopy || []);
    const { crowns, cones, trunks } = this.canopyMeshes;
    const m4 = new THREE.Matrix4(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
    if (!this._orig) this._orig = [crowns, cones, trunks].map((im) => im.instanceMatrix.array.slice());
    [crowns, cones, trunks].forEach((im, k) => {
      im.instanceMatrix.array.set(this._orig[k]);
      for (const i of cleared) im.setMatrixAt(i, zero);
      im.instanceMatrix.needsUpdate = true;
    });
    void m4;
  }
  canopyWithin(x, z, r) {
    const out = [];
    this.canopyInfo.forEach((t, i) => { if (Math.hypot(t.x - x, t.z - z) < r) out.push(i); });
    return out;
  }

  buildParcel() {
    const g = new THREE.Group(); g.name = 'parcel';
    const pts = this.parcel;
    g.add(this.fatLine(pts, '#ffcc33', 3.5, 0.9));
    const labels = new THREE.Group();
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 20) continue;
      labels.add(this.label(`${L.toFixed(1)}'<br><small>${bearingStr(bx - ax, bz - az)}</small>`, (ax + bx) / 2, (az + bz) / 2, 'parcel-label', 2));
    }
    const [cx, cz] = polyCentroid(pts);
    g.add(this.label(`<b>Parcel 0110-M-00207</b><br>${this.parcelAcres.toFixed(2)} ac · ${Math.round(Math.abs(polyArea(pts))).toLocaleString()} sf`, cx, cz + 120, 'parcel-label big', 6));
    labels.visible = false;
    this.parcelEdgeLabels = labels;
    g.add(labels);
    this.group.add(g);
    this.layers.parcel = g;
  }

  buildContours() {
    const pos = [], col = [];
    const c1 = new THREE.Color('#fff4c2'), c2 = new THREE.Color('#e8d27a');
    for (const c of this.data.contours) {
      const major = c.e % 10 === 0;
      const col0 = major ? c1 : c2;
      for (let k = 0; k < c.pts.length - 1; k++) {
        const [ax, az] = c.pts[k], [bx, bz] = c.pts[k + 1];
        pos.push(ax, this.height(ax, az) + 0.45, az, bx, this.height(bx, bz) + 0.45, bz);
        col.push(col0.r, col0.g, col0.b, col0.r, col0.g, col0.b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7 }));
    l.name = 'contours';
    l.visible = false;
    this.group.add(l);
    this.layers.contours = l;
  }

  // Approximate easements digitized from the annotated survey (verify before relying on them).
  buildEasements() {
    const g = new THREE.Group(); g.name = 'easements';
    const E0 = [-28.94, -459.39], E1 = [62.06, -136.19], E2 = [243.18, 482.71];
    const dir = [(E1[0] - E0[0]) / 335.8, (E1[1] - E0[1]) / 335.8];
    const west = [-dir[1], dir[0]];
    const at = (t, off) => {
      const base = t <= 335.8 ? [E0[0] + dir[0] * t, E0[1] + dir[1] * t] : [E1[0] + (E2[0] - E1[0]) * (t - 335.8) / 644.9, E1[1] + (E2[1] - E1[1]) * (t - 335.8) / 644.9];
      return [base[0] - west[0] * off, base[1] - west[1] * off];
    };
    const band = (t0, t1, o0, o1, color, text) => {
      const pts = [];
      for (let t = t0; t <= t1; t += 20) pts.push(at(t, o0));
      for (let t = t1; t >= t0; t -= 20) pts.push(at(t, o1));
      pts.push(pts[0]);
      g.add(this.fatLine(pts, color, 2, 0.8, true));
      const [lx, lz] = at((t0 + t1) / 2, (o0 + o1) / 2);
      g.add(this.label(text, lx, lz, 'easement-label', 2));
    };
    band(0, 400, -90, -110, '#ff8a3d', 'Duquesne Light R/W<br><small>approx. from survey</small>');
    band(20, 420, 0, -10, '#f5d142', "10' Equitable Gas R/W<br><small>approx.</small>");
    band(480, 980, 0, 30, '#5ab0ff', "30' Private R/W (access)<br><small>approx.</small>");
    const gas = [];
    for (let o = 20; o >= -300; o -= 20) gas.push(at(250, o));
    g.add(this.fatLine(gas, '#f5d142', 2, 0.8, true));
    const [gx, gz] = at(250, -150);
    g.add(this.label('Columbia Gas pipeline<br><small>approx.</small>', gx, gz, 'easement-label', 2));
    g.visible = false;
    this.group.add(g);
    this.layers.easements = g;
  }

  setLineResolution(w, h) { for (const m of this.lineMats) m.resolution.set(w, h); }

  inParcel(x, z) { return pointInPoly(x, z, this.parcel); }
}

function app_garage(app) { return app.state.house.garage; }

export function hardscapeArea(h) {
  if (h.kind === 'path') { let L = 0; for (let i = 0; i < h.pts.length - 1; i++) L += Math.hypot(h.pts[i + 1][0] - h.pts[i][0], h.pts[i + 1][1] - h.pts[i][1]); return L * h.width; }
  return Math.abs(polyArea(h.pts));
}

// Default hardscape digitized from NAIP imagery + iGUIDE site plan (world frame).
export function defaultHardscape() {
  const P = (pts) => pts.map(([x, y]) => planToWorld(x, y).map((v) => +v.toFixed(2)));
  return [
    { id: 'hs_court', kind: 'poly', name: 'Parking court', mat: 'gravel', pts: [[-32, -77], [7, -75], [38.3, -71.1], [59.8, -61.3], [61.7, -34], [44.1, -30.1], [5.1, -28.1], [-24.2, -28.1], [-28.1, -43.8], [-30.1, -61.3]] },
    { id: 'hs_drive_n', kind: 'path', name: 'North drive', mat: 'gravel', width: 13, pts: [[-54.5, -200], [-54.5, -160.9], [-53.1, -133.6], [-48.6, -108.2], [-39.8, -92.6], [-24.2, -80.9], [-8.6, -74]] },
    { id: 'hs_drive_e', kind: 'path', name: 'East drive (to Al Smith Dr)', mat: 'gravel', width: 12, pts: [[57.8, -43.8], [83.2, -40.8], [112.5, -38.9], [141.8, -39.8], [171, -41.8], [200, -40.8]] },
    { id: 'hs_drive_ne', kind: 'path', name: 'NE lane', mat: 'gravel', width: 10, pts: [[104.7, -46.7], [94.9, -61.3], [87.1, -78.9], [79.3, -98.4], [75, -130], [72, -200]] },
    { id: 'hs_loop', kind: 'path', name: 'Loop lane', mat: 'gravel', width: 9, pts: [[-28.1, -76], [-47.7, -80.9], [-71.1, -80.5], [-88.7, -73], [-98.4, -61.3], [-102.3, -51.6]] },
    { id: 'hs_walk', kind: 'path', name: 'Garden walk', mat: 'flagstone', width: 4, pts: [[-116, -35.9], [-90.6, -30.1], [-63.3, -25.2], [-35.9, -23.2]] },
    { id: 'hs_npatio', kind: 'poly', name: 'North patio', mat: 'concrete', pts: P([[0, 0], [0, -4], [8, -12], [20, -15.5], [36, -17.5], [44, -12], [41, -2], [40.6, 9.3], [38.5, 11.8], [24, 11.8], [24, 0]]) },
    { id: 'hs_wpatio', kind: 'poly', name: 'West patio', mat: 'concrete', pts: P([[-13.4, -11.2], [0, -11.2], [0, 30.5], [9.33, 30.5], [9.33, 48.85], [9.6, 52], [3.3, 62], [-13, 65.5]]) },
    { id: 'hs_lpatio', kind: 'poly', name: 'Lower (walkout) patio', mat: 'concrete', pts: P([[38.5, 11.8], [59.8, 11.8], [59.8, 44.4], [51.6, 57], [19.6, 57], [19.6, 48.85], [38.5, 48.85]]) },
    { id: 'hs_bed_sw', kind: 'poly', name: 'SW planting bed', mat: 'flowers', pts: P([[-12, 67], [3, 63.5], [12, 58.5], [18, 60], [10, 70], [-10, 79], [-32, 84], [-44, 81], [-30, 74]]) },
    { id: 'hs_bed_g', kind: 'poly', name: 'Garage bed', mat: 'mulch', pts: [[10, -42.8], [30, -42.8], [30, -38.5], [22, -36.5], [10, -38.5]] },
    { id: 'hs_pond', kind: 'poly', name: 'Pond', mat: 'water', pts: [[-55, -37], [-50.5, -38], [-48.5, -34.5], [-51, -31.5], [-55.5, -32.5]] },
  ];
}

// Existing trees digitized from NAIP imagery near the house (world frame -> stored as plan items).
export function defaultTrees() {
  const T = [
    ['oak', -71, -51.6, 1], ['maple', -86, -58, 2], ['redMaple', -47.7, -35.9, 3], ['maple', 16.8, -26.2, 4],
    ['oak', 83, -16.4, 5], ['maple', 100.8, -26.2, 6], ['oak', 112.5, -4.7, 7], ['pine', -166.8, -24.2, 8],
    ['oak', -174.6, -88.7, 9], ['maple', -133.6, 34.4, 10], ['oak', -135.5, 57.8, 11], ['maple', -90.6, 67.6, 12],
    ['oak', -73, 53.9, 13], ['spruce', -63.3, 120.3, 14], ['spruce', -95, 30, 15], ['dogwood', -40, 40, 16],
  ];
  // shrubs: [species, x, y|z, 'p' plan frame | 'w' world frame]
  const S = [['boxwood', 12.7, -15, 'p'], ['hydrangea', 41, -17, 'p'], ['rhododendron', 48, -16.4, 'p'], ['boxwood', 60.7, 45.8, 'p'], ['hydrangea', 46.6, 61.3, 'p'], ['grass', 48, 71, 'p'], ['rhododendron', 25, -40, 'w'], ['lilac', 14, -40, 'w']];
  return { T, S };
}
