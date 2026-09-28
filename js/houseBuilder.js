import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { mat, paint, solid, texMat, glassMat, polyMat, floorMat, extMat, roofMat } from './materials.js';
import { pointInPoly, polyCentroid, polyArea, fmtArea } from './util.js';

export const levelById = (house, id) => house.levels.find((l) => l.id === id);
export function storeyTop(house, lv) {
  const i = house.levels.findIndex((l) => l.id === lv.id);
  const next = house.levels[i + 1];
  return next ? next.elev : lv.elev + lv.height;
}

// Box with UVs in feet so tiled textures keep constant scale. Faces: +x,-x,+y,-y,+z,-z.
export function ftBox(w, h, d, u0 = 0, v0 = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) {
    let sw, sh, ou = 0, ov = 0;
    if (f < 2) { sw = d; sh = h; ov = v0; }
    else if (f < 4) { sw = w; sh = d; ou = u0; }
    else { sw = w; sh = h; ou = u0; ov = v0; }
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * sw + ou, uv.getY(i) * sh + ov);
    }
  }
  return g;
}

function mesh(g, m, parent, pick) {
  const o = new THREE.Mesh(g, m);
  o.castShadow = true; o.receiveShadow = true;
  if (pick) o.userData.pick = pick;
  parent.add(o);
  return o;
}
function box(parent, w, h, d, x, y, z, m, pick) {
  const o = mesh(ftBox(w, h, d), m, parent, pick);
  o.position.set(x, y, z);
  return o;
}

export class HouseBuilder {
  constructor(state) {
    this.state = state;
    this.house = state.house;
    this.finish = state.finish;
  }

  extFace(type) {
    if (type === 'siding') return extMat(this.finish.siding);
    if (type === 'block') return extMat('block');
    return extMat(this.finish.brick);
  }
  trim() { return paint(this.finish.trim, 0.5); }

  roomAt(lvId, x, y) {
    for (const r of this.house.rooms) if (r.lv === lvId && pointInPoly(x, y, r.pts)) return r;
    return null;
  }
  sideMat(w, lv, sx, sy) {
    const r = this.roomAt(lv.id, sx, sy);
    if (r) {
      if (r.wallMat === 'brick') return this.extFace('brick');
      return paint(r.wallColor || (r.finished === false ? '#d6cfc1' : '#ece7dd'));
    }
    if (w.ext) return this.extFace(w.ext);
    return paint('#e2ddd2');
  }

  build() {
    const out = {
      levels: {}, roof: new THREE.Group(), site: new THREE.Group(), garage: new THREE.Group(),
      pick: [], walk: [], colliders: [], labels: [],
    };
    this.out = out;
    out.roof.name = 'roofs';
    for (const lv of this.house.levels) {
      const g = new THREE.Group();
      g.name = lv.id;
      g.userData.parts = { walls: new THREE.Group(), floors: new THREE.Group(), ceilings: new THREE.Group(), items: new THREE.Group(), labels: new THREE.Group() };
      for (const p of Object.values(g.userData.parts)) g.add(p);
      out.levels[lv.id] = g;
    }
    for (const w of this.house.walls) {
      const lv = levelById(this.house, w.lv);
      if (lv) this.buildWall(w, lv, out.levels[lv.id].userData.parts.walls);
    }
    for (const r of this.house.rooms) this.buildRoom(r);
    for (const s of this.house.stairs) this.buildStair(s);
    for (const r of this.house.roofs) this.buildRoof(r);
    for (const s of this.house.structs) this.buildStruct(s);
    return out;
  }

  // ---------------------------------------------------------------- walls
  buildWall(w, lv, parent, opts = {}) {
    const [ax, ay] = w.a, [bx, by] = w.b;
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    if (L < 0.05) return;
    const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    const isExt = !!w.ext;
    const top = lv.elev + (w.h ?? (isExt ? (opts.storeyH ?? storeyTop(this.house, lv) - lv.elev) : lv.height));
    // base sits just above the floor so the dark inside of a cut wall shows over room floors in plan view
    const base = lv.elev + (w.base ?? (lv.id === 'bsmt' && isExt ? -0.7 : 0.02));
    const ext = isExt ? w.t / 2 : 0;
    const openings = (opts.openings || this.house.openings).filter((o) => o.wall === w.id).sort((a, b) => a.t - b.t);
    const mx = (ax + bx) / 2, my = (ay + by) / 2, off = w.t / 2 + 0.35;
    const mL = opts.matL || this.sideMat(w, lv, mx + nx * off, my + ny * off);
    const mR = opts.matR || this.sideMat(w, lv, mx - nx * off, my - ny * off);
    const edge = isExt ? this.extFace(w.ext) : paint('#e6e1d6');
    const mats = [edge, edge, edge, edge, mL, mR];
    const pick = { kind: opts.pickKind || 'wall', id: w.id };
    const pieces = [];
    let u = -ext;
    for (const o of openings) {
      const u0 = Math.max(-ext, o.t - o.w / 2), u1 = Math.min(L + ext, o.t + o.w / 2);
      const s = lv.elev + o.sill, t2 = Math.min(top, s + o.h);
      if (u0 > u) pieces.push([u, u0, base, top]);
      if (s - base > 0.03) pieces.push([Math.max(u, u0), u1, base, s]);
      if (top - t2 > 0.03) pieces.push([Math.max(u, u0), u1, t2, top]);
      u = Math.max(u, u1);
    }
    if (L + ext > u) pieces.push([u, L + ext, base, top]);
    const rotY = -Math.atan2(uy, ux);
    for (const [p0, p1, v0, v1] of pieces) {
      const len = p1 - p0, h = v1 - v0;
      if (len < 0.02 || h < 0.02) continue;
      const m = mesh(ftBox(len, h, w.t, p0, v0), mats, parent, pick);
      const um = (p0 + p1) / 2;
      m.position.set(ax + ux * um, v0 + h / 2, ay + uy * um);
      m.rotation.y = rotY;
      m.userData.wallId = w.id;
      this.out.pick.push(m);
      this.out.colliders.push(m);
    }
    for (const o of openings) this.buildOpening(o, w, lv, parent, { ax, ay, ux, uy, rotY, top });
  }

  buildOpening(o, w, lv, parent, g0) {
    const g = new THREE.Group();
    g.position.set(g0.ax + g0.ux * o.t, lv.elev + o.sill, g0.ay + g0.uy * o.t);
    g.rotation.y = g0.rotY;
    parent.add(g);
    const pick = { kind: 'opening', id: o.id };
    const T = this.trim(), tw = 0.22, dep = w.t + 0.08;
    const h = Math.min(o.h, g0.top - (lv.elev + o.sill));
    const add = (m) => { m.userData.pick = pick; this.out.pick.push(m); return m; };
    add(box(g, tw, h, dep, -o.w / 2 - tw / 2 + 0.02, h / 2, 0, T));
    add(box(g, tw, h, dep, o.w / 2 + tw / 2 - 0.02, h / 2, 0, T));
    add(box(g, o.w + tw * 2, tw, dep, 0, h + tw / 2 - 0.02, 0, T));
    if (o.kind === 'window' || o.kind === 'slider') {
      add(box(g, o.w + 0.4, 0.14, dep + 0.25, 0, -0.05, 0, T));
      const gl = add(box(g, o.w, h, 0.06, 0, h / 2, 0, glassMat()));
      gl.castShadow = false;
      const mull = o.kind === 'slider' ? 1 : Math.max(0, Math.round(o.w / 3.2) - 1);
      for (let i = 1; i <= mull; i++) add(box(g, 0.12, h, 0.14, -o.w / 2 + (o.w * i) / (mull + 1), h / 2, 0, T));
      if (o.kind === 'window' && h > 2.6) add(box(g, o.w, 0.12, 0.14, 0, h / 2, 0, T));
    } else if (o.kind === 'door' || o.kind === 'extdoor') {
      const hinge = new THREE.Group();
      const flip = o.flip ? -1 : 1;
      hinge.position.set(-o.w / 2 * flip, 0, (w.t / 2) * (o.swing === 'out' ? -1 : 1));
      hinge.rotation.y = flip * (o.swing === 'out' ? 1.2 : -1.2) * (o.open ?? 1);
      g.add(hinge);
      const leafM = o.kind === 'extdoor' ? paint(this.finish.door || '#34475e', 0.5) : paint(this.finish.trim, 0.55);
      add(box(hinge, o.w - 0.08, h - 0.05, 0.14, (o.w / 2) * flip, h / 2, 0, leafM));
      if (o.kind === 'extdoor') add(box(hinge, o.w * 0.6, h * 0.38, 0.16, (o.w / 2) * flip, h * 0.68, 0, glassMat()));
    } else if (o.kind === 'garage') {
      add(box(g, o.w, h, 0.18, 0, h / 2, 0, texMat('garageDoor', {}, { roughness: 0.5 })));
    }
  }

  // ---------------------------------------------------------------- rooms
  buildRoom(r) {
    const lv = levelById(this.house, r.lv);
    if (!lv) return;
    const parts = this.out.levels[lv.id].userData.parts;
    const shape = new THREE.Shape(r.pts.map(([x, y]) => new THREE.Vector2(x, -y)));
    const geoF = new THREE.ShapeGeometry(shape);
    geoF.rotateX(-Math.PI / 2);
    const f = new THREE.Mesh(geoF, floorMat(r.floor));
    f.position.y = lv.elev + 0.01;
    f.receiveShadow = true;
    f.userData.pick = { kind: 'room', id: r.id };
    parts.floors.add(f);
    this.out.pick.push(f);
    this.out.walk.push(f);
    if (!r.noCeiling) {
      const c = new THREE.Mesh(geoF, mat('ceiling', () => new THREE.MeshStandardMaterial({ color: '#f3f1ec', roughness: 1, side: THREE.BackSide })));
      c.position.y = lv.elev + (r.ceiling ?? lv.height);
      parts.ceilings.add(c);
    }
    const [cx, cy] = polyCentroid(r.pts);
    const div = document.createElement('div');
    div.className = 'room-label';
    div.innerHTML = `<b>${r.name}</b><span>${fmtArea(Math.abs(polyArea(r.pts)))}</span>`;
    const lab = new CSS2DObject(div);
    lab.position.set(cx, lv.elev + 0.5, cy);
    lab.userData.level = lv.id;
    parts.labels.add(lab);
    this.out.labels.push(lab);
  }

  // ---------------------------------------------------------------- stairs
  buildStair(s) {
    const lv = s.lv === 'site' ? null : levelById(this.house, s.lv);
    const parent = lv ? this.out.levels[lv.id].userData.parts.floors : this.out.site;
    const alongX = s.dir[1] === 'x';
    const sign = s.dir[0] === '-' ? -1 : 1;
    const run = alongX ? s.x1 - s.x0 : s.y1 - s.y0;
    const width = alongX ? s.y1 - s.y0 : s.x1 - s.x0;
    const low = alongX ? (sign > 0 ? s.x0 : s.x1) : (sign > 0 ? s.y0 : s.y1);
    const mid = alongX ? (s.y0 + s.y1) / 2 : (s.x0 + s.x1) / 2;
    const rise = (s.to - s.from) / s.n, tread = run / s.n;
    const slope = (s.to - s.from) / run, ang = Math.atan(slope), Ls = Math.hypot(run, s.to - s.from);
    const P = (d, h, side = 0) => alongX ? [low + sign * d, h, mid + side] : [mid + side, h, low + sign * d];
    const tm = s.mat === 'concrete' ? texMat('concrete', {}) : texMat('hardwood', { color: '#8a5d38' });
    const rm = s.mat === 'concrete' ? texMat('concrete', {}) : paint('#f1efe9', 0.6);
    const pick = { kind: 'stair', id: s.id };
    for (let i = 0; i < s.n; i++) {
      const top = s.from + rise * (i + 1);
      const [x, y, z] = P((i + 0.5) * tread, top - 0.06);
      const t = alongX ? box(parent, tread + 0.08, 0.12, width, x, y, z, tm, pick) : box(parent, width, 0.12, tread + 0.08, x, y, z, tm, pick);
      this.out.pick.push(t);
      const [rx, ry, rz] = P(i * tread + 0.03, top - rise / 2);
      if (alongX) box(parent, 0.06, rise, width, rx, ry, rz, rm); else box(parent, width, rise, 0.06, rx, ry, rz, rm);
    }
    const strM = s.mat === 'concrete' ? texMat('concrete', {}) : paint('#e6e1d6', 0.7);
    for (const side of [-1, 1]) {
      const [x, y, z] = P(run / 2, (s.from + s.to) / 2 - 0.35, side * (width / 2 - 0.08));
      const st = alongX ? box(parent, Ls, 0.8, 0.16, x, y, z, strM) : box(parent, 0.16, 0.8, Ls, x, y, z, strM);
      if (alongX) st.rotation.z = sign * ang; else st.rotation.x = -sign * ang;
    }
    // invisible ramp for walking
    const rg = alongX ? new THREE.PlaneGeometry(Ls, width) : new THREE.PlaneGeometry(width, Ls);
    rg.rotateX(-Math.PI / 2);
    const ramp = new THREE.Mesh(rg, mat('invisible', () => new THREE.MeshBasicMaterial({ visible: false }), false));
    const [x, y, z] = P(run / 2, (s.from + s.to) / 2);
    ramp.position.set(x, y + 0.02, z);
    if (alongX) ramp.rotation.z = sign * ang; else ramp.rotation.x = -sign * ang;
    parent.add(ramp);
    this.out.walk.push(ramp);
    for (const r of s.rails || []) {
      const side = r.endsWith('1') ? 1 : -1;
      const off = side * (width / 2 - 0.1);
      const [hx, hy, hz] = P(run / 2, (s.from + s.to) / 2 + 3, off);
      const hr = alongX ? box(parent, Ls, 0.16, 0.16, hx, hy, hz, this.trim()) : box(parent, 0.16, 0.16, Ls, hx, hy, hz, this.trim());
      if (alongX) hr.rotation.z = sign * ang; else hr.rotation.x = -sign * ang;
      const nPosts = Math.max(2, Math.round(run / 0.6));
      for (let i = 0; i <= nPosts; i++) {
        const d = (i / nPosts) * run, h0 = s.from + d * slope;
        const [px, py, pz] = P(d, h0 + 1.5, off);
        box(parent, 0.08, 3, 0.08, px, py, pz, this.trim());
      }
      this.out.colliders.push(hr);
    }
  }

  // ---------------------------------------------------------------- roofs
  slab(parent, len, Ls, m, x, y, z, tilt, yaw = 0) {
    const o = mesh(ftBox(len, 0.35, Ls), m, parent, { kind: 'roof' });
    o.rotation.order = 'YXZ';
    o.rotation.set(tilt, yaw, 0);
    o.position.set(x, y, z);
    this.out.pick.push(o);
    return o;
  }
  gableTri(parent, pts2, m, thick, axis, at) {
    const shape = new THREE.Shape(pts2.map(([u, v]) => new THREE.Vector2(u, v)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
    if (axis === 'x') g.rotateY(-Math.PI / 2);
    const o = mesh(g, m, parent, { kind: 'roof' });
    if (axis === 'x') o.position.x = at; else o.position.z = at;
    return o;
  }
  buildRoof(r) {
    const parent = this.out.roof;
    const rm = roofMat(this.finish.roof);
    const T = this.trim();
    const oh = { n: 0, s: 0, e: 0, w: 0, ...(r.oh || {}) };
    const [x0, y0, x1, y1] = r.rect;
    const p = r.pitch, ang = Math.atan(p), k = Math.sqrt(1 + p * p);
    const gm = r.gableMat === 'siding' ? this.extFace('siding') : this.extFace('brick');
    if (r.kind === 'gable' && r.ridge === 'x') {
      const ym = (y0 + y1) / 2, half = (y1 - y0) / 2, rh = r.base + half * p;
      const len = x1 - x0 + oh.e + oh.w, cx = (x0 - oh.w + x1 + oh.e) / 2;
      for (const side of ['n', 's']) {
        const run = half + oh[side], eaveZ = side === 'n' ? y0 - oh.n : y1 + oh.s, eaveH = r.base - oh[side] * p;
        const cz = (eaveZ + ym) / 2, cy = (eaveH + rh) / 2 + 0.18;
        this.slab(parent, len, run * k, rm, cx, cy, cz, side === 'n' ? -ang : ang);
        if (oh[side] > 0) box(parent, len, 0.45, 0.25, cx, eaveH - 0.1, eaveZ, T);
      }
      box(parent, len, 0.22, 0.6, cx, rh + 0.3, ym, rm);
      for (const gside of r.gables || []) {
        if (gside === 'e') this.gableTri(parent, [[y0, r.base], [y1, r.base], [ym, rh]], gm, 0.8, 'x', x1);
        if (gside === 'w') this.gableTri(parent, [[y0, r.base], [y1, r.base], [ym, rh]], gm, 0.8, 'x', x0 + 0.8);
      }
    } else if (r.kind === 'gable' && r.ridge === 'y') {
      const xm = (x0 + x1) / 2, half = (x1 - x0) / 2, rh = r.base + half * p;
      const len = y1 - y0 + oh.n + oh.s, cz = (y0 - oh.n + y1 + oh.s) / 2;
      for (const side of ['w', 'e']) {
        const run = half + oh[side], eaveX = side === 'w' ? x0 - oh.w : x1 + oh.e, eaveH = r.base - oh[side] * p;
        const cx = (eaveX + xm) / 2, cy = (eaveH + rh) / 2 + 0.18;
        this.slab(parent, len, run * k, rm, cx, cy, cz, side === 'w' ? -ang : ang, Math.PI / 2);
        if (oh[side] > 0) box(parent, 0.25, 0.45, len, eaveX, eaveH - 0.1, cz, T);
      }
      box(parent, 0.6, 0.22, len, xm, rh + 0.3, cz, rm);
      for (const gside of r.gables || []) {
        if (gside === 's') this.gableTri(parent, [[x0, r.base], [x1, r.base], [xm, rh]], gm, 0.6, 'z', y1 - 0.6);
        if (gside === 'n') this.gableTri(parent, [[x0, r.base], [x1, r.base], [xm, rh]], gm, 0.6, 'z', y0);
      }
    } else if (r.kind === 'shed') {
      const span = y1 - y0, low = r.high - span * p;
      const run = span + oh.n + oh.s, eaveH = low - oh.n * p, topH = r.high + oh.s * p;
      const len = x1 - x0 + oh.e + oh.w, cx = (x0 - oh.w + x1 + oh.e) / 2;
      this.slab(parent, len, run * k, rm, cx, (eaveH + topH) / 2 + 0.18, (y0 - oh.n + y1 + oh.s) / 2, -ang);
      box(parent, len, 0.45, 0.25, cx, eaveH - 0.1, y0 - oh.n, T);
      const sm = r.sideMat === 'siding' ? this.extFace('siding') : this.extFace('brick');
      const pts = [[y0, r.wallTop], [y1, r.wallTop], [y1, r.high], [y0, low]];
      this.gableTri(parent, pts, sm, 0.5, 'x', x0 + 0.5);
      this.gableTri(parent, pts, sm, 0.5, 'x', x1);
      if (r.wallTop < low - 0.05) {
        const fm = this.extFace(r.sideMat || 'siding');
        box(parent, x1 - x0, low - r.wallTop, 0.5, (x0 + x1) / 2, (low + r.wallTop) / 2, y0 + 0.25, fm);
      }
    }
  }

  // ---------------------------------------------------------------- structures
  buildStruct(s) {
    const brick = this.extFace('brick');
    const T = this.trim();
    const lvG = (id) => this.out.levels[id].userData.parts.walls;
    if (s.kind === 'chimney') {
      const [x0, y0, x1, y1] = s.rect;
      const segs = [['bsmt', -8, 0], ['main', 0, 9.583]];
      for (const [lv, a, b] of segs) {
        const o = box(lvG(lv), x1 - x0, b - a, y1 - y0, (x0 + x1) / 2, (a + b) / 2, (y0 + y1) / 2, brick, { kind: 'struct', id: s.id });
        this.out.colliders.push(o); this.out.pick.push(o);
      }
      const [fx0, fy0, fx1, fy1] = s.flue;
      box(lvG('upper'), fx1 - fx0, 9.17, fy1 - fy0, (fx0 + fx1) / 2, 9.583 + 4.585, (fy0 + fy1) / 2, brick);
      const hTop = s.top - 18.75;
      box(this.out.roof, fx1 - fx0 + 0.4, hTop, fy1 - fy0 + 0.4, (fx0 + fx1) / 2, 18.75 + hTop / 2, (fy0 + fy1) / 2, brick);
      box(this.out.roof, fx1 - fx0 + 0.7, 0.3, fy1 - fy0 + 0.7, (fx0 + fx1) / 2, s.top + 0.1, (fy0 + fy1) / 2, texMat('concrete', {}));
      for (const fp of s.fireplaces || []) {
        const ym = (y0 + y1) / 2, x = fp.side === 'w' ? x0 : x1, dir = fp.side === 'w' ? -1 : 1;
        box(lvG(fp.lv), 0.12, 2.4, 3, x + dir * 0.02, 0.3 + 1.2, ym, solid('#141414', { roughness: 1 }));
        box(lvG(fp.lv), 1.8, 0.25, 4.6, x + dir * 0.9, 0.125, ym, texMat('slate', {}));
        box(lvG(fp.lv), 0.6, 0.35, 5, x + dir * 0.3, 4.2, ym, texMat('woodgrain', { color: '#6d4a2f' }));
      }
    } else if (s.kind === 'fireplace') {
      const lv = levelById(this.house, s.lv);
      const g = lvG(s.lv), d = s.face === 'e' ? 1 : -1;
      box(g, 1.6, 4.6, 4.2, s.x - d * 0.2, lv.elev + 2.3, s.y, brick, { kind: 'struct', id: s.id });
      box(g, 0.1, 2.2, 2.6, s.x + d * 0.62, lv.elev + 1.4, s.y, solid('#141414', { roughness: 1 }));
      box(g, 1.2, 0.2, 5, s.x + d * 1.1, lv.elev + 0.1, s.y, texMat('slate', {}));
    } else if (s.kind === 'beam') {
      const lv = levelById(this.house, s.lv), g = lvG(s.lv);
      const [ax, ay] = s.a, [bx] = s.b;
      const topH = lv.elev + lv.height;
      box(g, bx - ax, 0.9, 0.6, (ax + bx) / 2, topH - 0.45, ay, texMat('woodgrain', { color: '#9a7650' }));
      for (const px of s.posts) {
        const c = mesh(new THREE.CylinderGeometry(0.15, 0.15, lv.height - 0.9, 12), solid('#6f7478', { metalness: 0.6, roughness: 0.4 }), g, { kind: 'struct', id: s.id });
        c.position.set(px, lv.elev + (lv.height - 0.9) / 2, ay);
        this.out.colliders.push(c);
      }
    } else if (s.kind === 'soffit') {
      const lv = levelById(this.house, s.lv), [x0, y0, x1, y1] = s.rect;
      const top = lv.elev + lv.height;
      box(lvG(s.lv), x1 - x0, s.drop, y1 - y0, (x0 + x1) / 2, top - s.drop / 2, (y0 + y1) / 2, paint('#e6e1d6'));
    } else if (s.kind === 'deck') {
      this.buildDeck(s);
    } else if (s.kind === 'cover') {
      const [x0, y0, x1, y1] = s.rect, g = this.out.roof;
      const panel = box(g, x1 - x0 + 0.6, 0.12, y1 - y0 + 0.6, (x0 + x1) / 2, s.h + 0.3, (y0 + y1) / 2, polyMat(), { kind: 'struct', id: s.id });
      panel.castShadow = true;
      const wood = texMat('woodgrain', { color: '#8a6a4a' });
      for (const [px, py] of s.posts) { const p = box(this.out.site, 0.45, s.h + 0.45, 0.45, px, -0.45 + (s.h + 0.45) / 2, py, wood, { kind: 'struct', id: s.id }); this.out.colliders.push(p); }
      box(g, 0.5, 0.7, y1 - y0, x0 + 0.5, s.h, (y0 + y1) / 2, wood);
      for (let x = x0 + 1; x < x1; x += 2.2) box(g, 0.2, 0.5, y1 - y0, x, s.h + 0.1, (y0 + y1) / 2, wood);
    } else if (s.kind === 'retaining') {
      const m = texMat('block', {});
      for (let i = 0; i < s.pts.length - 1; i++) {
        const [ax, ay] = s.pts[i], [bx, by] = s.pts[i + 1];
        const L = Math.hypot(bx - ax, by - ay), h = s.top - s.bottom;
        const o = box(this.out.site, L, h, s.t, (ax + bx) / 2, s.bottom + h / 2, (ay + by) / 2, m, { kind: 'struct', id: s.id });
        o.rotation.y = -Math.atan2(by - ay, bx - ax);
        box(this.out.site, L, 0.2, s.t + 0.3, (ax + bx) / 2, s.top + 0.1, (ay + by) / 2, texMat('concrete', {})).rotation.y = o.rotation.y;
        this.out.colliders.push(o);
      }
    } else if (s.kind === 'ac') {
      box(this.out.site, 3, 2.8, 3, s.x, s.elev + 1.4, s.y, solid('#b9bcbc', { metalness: 0.3 }), { kind: 'struct', id: s.id });
      const f = mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.1, 20), solid('#2a2a2a'), this.out.site);
      f.position.set(s.x, s.elev + 2.85, s.y);
    }
  }

  buildDeck(s) {
    const g = this.out.site;
    const shape = new THREE.Shape(s.pts.map(([x, y]) => new THREE.Vector2(x, -y)));
    const d = 0.7;
    const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    const deck = mesh(geo, texMat('deck', {}), g, { kind: 'struct', id: s.id });
    deck.position.y = s.top - d;
    this.out.walk.push(deck);
    this.out.pick.push(deck);
    const wood = texMat('woodgrain', { color: '#8a6a4a' });
    const rail = paint(this.finish.trim, 0.6);
    const n = s.pts.length;
    const balG = new THREE.BoxGeometry(0.12, 2.6, 0.12);
    const bals = [];
    for (let i = 0; i < n; i++) {
      const [ax, ay] = s.pts[i], [bx, by] = s.pts[(i + 1) % n];
      const L = Math.hypot(bx - ax, by - ay);
      const pH = s.top - s.bottom;
      box(g, 0.55, pH, 0.55, ax, s.bottom + pH / 2, ay, wood);
      if ((s.houseEdges || []).includes(i)) continue;
      const rot = -Math.atan2(by - ay, bx - ax);
      const tr = box(g, L, 0.2, 0.4, (ax + bx) / 2, s.top + 3.0, (ay + by) / 2, rail);
      tr.rotation.y = rot;
      this.out.colliders.push(tr);
      box(g, L, 0.12, 0.2, (ax + bx) / 2, s.top + 0.35, (ay + by) / 2, rail).rotation.y = rot;
      const nb = Math.floor(L / 0.45);
      for (let k = 1; k < nb; k++) bals.push([ax + ((bx - ax) * k) / nb, ay + ((by - ay) * k) / nb]);
      box(g, 0.4, 3.2, 0.4, ax, s.top + 1.6, ay, rail);
    }
    const inst = new THREE.InstancedMesh(balG, rail, bals.length);
    const m4 = new THREE.Matrix4();
    bals.forEach(([x, y], i) => inst.setMatrixAt(i, m4.makeTranslation(x, s.top + 1.7, y)));
    inst.castShadow = true;
    g.add(inst);
    if (s.roof) {
      const rs = new THREE.Shape(s.pts.map(([x, y]) => new THREE.Vector2(x, -y)));
      const rg = new THREE.ExtrudeGeometry(rs, { depth: 0.12, bevelEnabled: false });
      rg.rotateX(-Math.PI / 2);
      const roof = mesh(rg, polyMat(), this.out.roof, { kind: 'struct', id: s.id });
      roof.position.y = s.roof.h;
      for (let i = 0; i < n; i++) {
        if ((s.houseEdges || []).includes(i)) continue;
        const [ax, ay] = s.pts[i], [bx, by] = s.pts[(i + 1) % n];
        const L = Math.hypot(bx - ax, by - ay);
        box(this.out.roof, L, 0.6, 0.35, (ax + bx) / 2, s.roof.h - 0.3, (ay + by) / 2, rail).rotation.y = -Math.atan2(by - ay, bx - ax);
        box(g, 0.45, s.roof.h - s.top, 0.45, ax, (s.top + s.roof.h) / 2, ay, rail);
      }
    }
  }

  // ---------------------------------------------------------------- garage (world frame group)
  buildGarage(floorY) {
    const G = this.house.garage;
    const grp = this.out.garage;
    grp.position.set(G.cx, floorY, G.cz);
    grp.rotation.y = -G.rotDeg * Math.PI / 180;
    const hw = G.w / 2, hd = G.d / 2, t = G.t;
    const lv = { id: 'garage', elev: 0, height: G.wallH };
    const walls = [
      { id: 'g_n', a: [-hw + t / 2, -hd + t / 2], b: [hw - t / 2, -hd + t / 2], side: 'n' },
      { id: 'g_s', a: [-hw + t / 2, hd - t / 2], b: [hw - t / 2, hd - t / 2], side: 's' },
      { id: 'g_e', a: [hw - t / 2, -hd + t / 2], b: [hw - t / 2, hd - t / 2], side: 'e' },
      { id: 'g_w', a: [-hw + t / 2, -hd + t / 2], b: [-hw + t / 2, hd - t / 2], side: 'w' },
    ];
    const ops = G.openings.map((o, i) => ({ ...o, id: 'g_o' + i, wall: 'g_' + o.side }));
    const blk = this.extFace('block');
    for (const w of walls) this.buildWall({ ...w, t, ext: 'block', h: G.wallH }, lv, grp, { openings: ops, matL: blk, matR: blk, pickKind: 'garage' });
    const slab = box(grp, G.w, 0.5, G.d, 0, -0.24, 0, texMat('concrete', {}), { kind: 'garage' });
    this.out.walk.push(slab);
    const rm = roofMat(this.finish.roof), p = G.pitch, ang = Math.atan(p), k = Math.sqrt(1 + p * p), oh = 1;
    const rh = G.wallH + hw * p;
    for (const side of [-1, 1]) {
      const run = hw + oh;
      const o = mesh(ftBox(G.d + 2 * oh, 0.35, run * k), rm, grp, { kind: 'garage' });
      o.rotation.order = 'YXZ';
      o.rotation.set(side < 0 ? -ang : ang, Math.PI / 2, 0);
      o.position.set(side * run / 2, (G.wallH - oh * p + rh) / 2 + 0.18, 0);
    }
    const sid = this.extFace('siding');
    for (const z of [-hd, hd - 0.5]) {
      const shape = new THREE.Shape([new THREE.Vector2(-hw, G.wallH), new THREE.Vector2(hw, G.wallH), new THREE.Vector2(0, rh)]);
      const gg = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false });
      mesh(gg, sid, grp).position.z = z;
    }
    return grp;
  }
}
