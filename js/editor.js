import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { FRAME, planToWorld, worldToPlan, worldToLatLon } from './frame.js';
import { CATALOG, buildItem, isPlant } from './catalog.js';
import { levelById } from './houseBuilder.js';
import { uid, ftIn, distToSeg, pointInPoly, distToPolyline, DEG } from './util.js';

const CORE = [9.4, 11.9, 38.4, 48.75];
const OPENING_DEFAULTS = { door: { w: 2.8, h: 6.7, sill: 0 }, window: { w: 3, h: 4, sill: 3 }, opening: { w: 4, h: 7, sill: 0 }, extdoor: { w: 3, h: 6.8, sill: 0 }, slider: { w: 6, h: 6.7, sill: 0.1 } };

function shown(o) { for (let p = o; p; p = p.parent) if (p.visible === false) return false; return true; }

export class Editor {
  constructor(app) {
    this.app = app;
    this.tool = 'select';
    this.activeLevel = 'main';
    this.snap = 0.25;
    this.wallT = 0.4;
    this.wallExt = false;
    this.brush = { r: 6, strength: 0.5, mat: 'mulch', mode: 'raise', erase: false };
    this.hsMat = 'pavers';
    this.pathW = 4;
    this.fenceType = 'privacy';
    this.placeType = null;
    this.placeRot = 0;
    this.openingKind = 'door';
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.draft = [];
    this.handles = [];
    this.preview = new THREE.Group();
    app.scene.add(this.preview);
    this.planPreview = new THREE.Group();
    app.planGroup.add(this.planPreview);
    this.handleGroup = new THREE.Group();
    app.scene.add(this.handleGroup);
    this.planHandleGroup = new THREE.Group();
    app.planGroup.add(this.planHandleGroup);
    this.selBox = new THREE.Box3Helper(new THREE.Box3(), 0xffd24a);
    this.selBox.visible = false;
    app.scene.add(this.selBox);
    const cur = new THREE.RingGeometry(0.96, 1, 64);
    cur.rotateX(-Math.PI / 2);
    this.cursor = new THREE.Mesh(cur, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthTest: false }));
    this.cursor.renderOrder = 10;
    this.cursor.visible = false;
    app.scene.add(this.cursor);
    const el = app.vp;
    el.addEventListener('pointerdown', (e) => this.down(e), { capture: true });
    el.addEventListener('pointermove', (e) => this.move(e));
    addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('dblclick', (e) => this.dbl(e));
    el.addEventListener('contextmenu', (e) => { if (this.draft.length) { e.preventDefault(); this.finishDraft(); } });
    addEventListener('keydown', (e) => this.key(e));
  }

  // ------------------------------------------------------------------ tools
  setTool(tool, opts = {}) {
    this.cancelDraft();
    this.tool = tool;
    Object.assign(this, opts);
    this.clearGhost();
    if (tool === 'place' && this.placeType) this.makeGhost();
    if (['wall', 'room', 'door', 'window', 'opening'].includes(tool) && this.app.view.level === 'all') this.app.setLevel(this.activeLevel);
    this.cursor.visible = false;
    this.app.ui.syncTool?.();
    this.app.ui.hint(this.hintFor(tool));
    this.app.vp.style.cursor = tool === 'select' ? 'default' : 'crosshair';
  }
  hintFor(t) {
    return {
      select: 'Click to select · drag items to move · Q/E rotate · Del delete · Shift+D duplicate',
      place: 'Click to place · Q/E rotate 15° (Shift: 1°) · R +90° · Esc to finish',
      wall: 'Click to start/continue a wall · Shift = orthogonal · snaps to wall ends · Enter/right-click/double-click to finish',
      room: 'Click room corners · click the first corner or press Enter to close',
      door: 'Click on a wall to add a door', window: 'Click on a wall to add a window', opening: 'Click on a wall to add a cased opening',
      hardscape: 'Click corners of the patio/bed · click first point or Enter to finish',
      path: 'Click points along the path · Enter/double-click to finish',
      fence: 'Click points along the fence line · Enter/double-click to finish',
      paint: 'Drag to paint ground material · Alt = erase', sculpt: 'Drag to sculpt terrain (raise/lower/flatten/smooth)',
      clear: 'Drag over woods to clear trees (click Restore in panel to undo all)',
      measure: 'Click two points to measure distance, elevation change and slope',
    }[t] || '';
  }

  // ------------------------------------------------------------------ picking
  setRay(e) {
    const r = this.app.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.app.camera);
  }
  groundHit(ray) {
    const site = this.app.site, o = ray.origin, d = ray.direction;
    let t = 0, h = o.y - site.height(o.x, o.z);
    if (h < 0) return null;
    for (let i = 0; i < 3000 && t < 8000; i++) {
      const step = Math.min(30, Math.max(0.4, h * 0.45));
      const t2 = t + step;
      const x = o.x + d.x * t2, y = o.y + d.y * t2, z = o.z + d.z * t2;
      const h2 = y - site.height(x, z);
      if (h2 < 0) {
        let a = t, b = t2;
        for (let k = 0; k < 24; k++) { const m = (a + b) / 2; const hm = o.y + d.y * m - site.height(o.x + d.x * m, o.z + d.z * m); if (hm > 0) a = m; else b = m; }
        const p = new THREE.Vector3(o.x + d.x * b, 0, o.z + d.z * b);
        p.y = site.height(p.x, p.z);
        const [px, py] = worldToPlan(p.x, p.z);
        if (px > CORE[0] && px < CORE[2] && py > CORE[1] && py < CORE[3]) return null;
        return { point: p, distance: b };
      }
      t = t2; h = h2;
    }
    return null;
  }
  pick(e, { exclude = null, groundOnly = false, handles = true } = {}) {
    this.setRay(e);
    let best = null;
    if (handles && this.handles.length) {
      const hh = this.ray.intersectObjects(this.handles, false);
      if (hh.length) return { kind: 'handle', ...hh[0].object.userData.handle, point: hh[0].point, object: hh[0].object };
    }
    if (!groundOnly) {
      const clip = this.app.view.level !== 'all' ? this.app.clipPlane?.constant : null;
      const hits = this.ray.intersectObjects(this.app.pickables, false);
      for (const h of hits) {
        const pk = h.object.userData.pick;
        if (!pk || !shown(h.object)) continue;
        if (exclude && pk.kind === 'item' && pk.id === exclude) continue;
        if (clip !== null && clip !== undefined && h.point.y > clip + 0.01 && pk.kind !== 'neighbor') {
          // the dark cut face of a clipped wall is what the user sees; count it as the wall
          if (pk.kind === 'wall' || pk.kind === 'opening') {
            const p = this.planeHit(clip);
            if (p) { best = { ...pk, point: p, object: h.object, distance: this.ray.ray.origin.distanceTo(p) }; break; }
          }
          continue;
        }
        best = { ...pk, point: h.point, object: h.object, distance: h.distance, face: h.face };
        break;
      }
    }
    const g = this.groundHit(this.ray.ray);
    if (g && (!best || g.distance < best.distance - 0.05)) return { kind: 'terrain', point: g.point, distance: g.distance };
    return best;
  }
  planeHit(y) {
    const p = new THREE.Vector3();
    return this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), p) ? p : null;
  }

  // ------------------------------------------------------------------ snapping
  snapPlan([x, y], lvId, from, shift, excl = null) {
    let best = null, bd = 0.8;
    for (const w of this.app.state.house.walls) {
      if (w.lv !== lvId) continue;
      for (const e of [w.a, w.b]) {
        if (excl && Math.hypot(e[0] - excl[0], e[1] - excl[1]) < 0.05) continue;
        const d = Math.hypot(e[0] - x, e[1] - y);
        if (d < bd) { bd = d; best = e; }
      }
    }
    if (best) return [best[0], best[1]];
    if (shift && from) { if (Math.abs(x - from[0]) > Math.abs(y - from[1])) y = from[1]; else x = from[0]; }
    const s = this.snap || 0.01;
    return [Math.round(x / s) * s, Math.round(y / s) * s];
  }

  // ------------------------------------------------------------------ pointer
  down(e) {
    if (e.button !== 0 || this.app.walker.active) return;
    this.downAt = [e.clientX, e.clientY];
    const t = this.tool;
    const app = this.app;
    if (t === 'select') {
      const h = this.pick(e);
      if (!h) { app.select(null); return; }
      if (h.kind === 'handle') { this.startHandleDrag(h, e); return; }
      if (h.kind === 'item') {
        app.select({ kind: 'item', id: h.id });
        this.drag = { id: h.id, started: false };
        app.controls.enabled = false; app.controls2D.enabled = false;
        return;
      }
      if (h.kind === 'terrain') {
        const hs = this.hardscapeAt(h.point.x, h.point.z);
        if (hs) { app.select({ kind: 'hardscape', id: hs.id }); return; }
        app.select({ kind: 'terrain', point: h.point.clone() });
        return;
      }
      if (h.kind === 'wall' || h.kind === 'opening' || h.kind === 'room' || h.kind === 'fence') { app.select({ kind: h.kind, id: h.id, point: h.point.clone() }); return; }
      if (h.kind === 'neighbor') { app.select({ kind: 'neighbor', addr: h.addr, type: h.type, point: h.point.clone() }); return; }
      app.select({ kind: h.kind, id: h.id, point: h.point.clone() });
      return;
    }
    if (t === 'place') { this.commitPlace(); return; }
    if (t === 'wall' || t === 'room') {
      const lv = levelById(app.state.house, this.activeLevel);
      this.setRay(e);
      const p = this.planeHit(lv.elev);
      if (!p) return;
      const prev = this.draft[this.draft.length - 1];
      const q = this.snapPlan(worldToPlan(p.x, p.z), lv.id, prev, e.shiftKey);
      if (t === 'room' && this.draft.length >= 3 && Math.hypot(q[0] - this.draft[0][0], q[1] - this.draft[0][1]) < 0.8) { this.finishDraft(); return; }
      if (t === 'wall' && prev) {
        if (Math.hypot(q[0] - prev[0], q[1] - prev[1]) < 0.3) return;
        const w = { id: uid('w'), lv: lv.id, a: prev.slice(), b: q.slice(), t: this.wallT, ext: this.wallExt || false };
        app.mutate((st) => st.house.walls.push(w), 'house');
      }
      this.draft.push(q);
      this.updatePreview(q);
      return;
    }
    if (t === 'door' || t === 'window' || t === 'opening') {
      const h = this.pick(e);
      if (!h || (h.kind !== 'wall' && h.kind !== 'opening')) { app.ui.toast('Click on a wall'); return; }
      const wallId = h.kind === 'wall' ? h.id : app.findOpening(h.id)?.wall;
      const w = app.findWall(wallId);
      if (!w) return;
      const [px, py] = worldToPlan(h.point.x, h.point.z);
      const r = distToSeg(px, py, w.a[0], w.a[1], w.b[0], w.b[1]);
      const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
      const kind = t === 'door' ? (w.ext ? 'extdoor' : 'door') : t === 'window' ? 'window' : 'opening';
      const d = { ...OPENING_DEFAULTS[kind] };
      if (L < d.w + 0.4) { app.ui.toast('Wall too short'); return; }
      const tt = Math.min(L - d.w / 2 - 0.2, Math.max(d.w / 2 + 0.2, r.t * L));
      const o = { id: uid('op'), wall: w.id, t: +tt.toFixed(2), ...d, kind };
      app.mutate((st) => st.house.openings.push(o), 'house');
      app.select({ kind: 'opening', id: o.id });
      return;
    }
    if (['hardscape', 'path', 'fence', 'measure'].includes(t)) {
      const h = t === 'measure' ? this.pick(e, { handles: false }) : this.pick(e, { groundOnly: true });
      if (!h) return;
      const p = [h.point.x, h.point.z];
      if (t === 'measure') { this.draft.push(h.point.clone()); if (this.draft.length === 2) { this.addMeasure(this.draft[0], this.draft[1]); this.draft = []; } this.updatePreview(); return; }
      if (t === 'hardscape' && this.draft.length >= 3 && Math.hypot(p[0] - this.draft[0][0], p[1] - this.draft[0][1]) < 1.5) { this.finishDraft(); return; }
      this.draft.push(p);
      this.updatePreview();
      return;
    }
    if (['paint', 'sculpt', 'clear'].includes(t)) {
      const h = this.pick(e, { groundOnly: true });
      if (!h) return;
      app.controls.enabled = false; app.controls2D.enabled = false;
      if (t !== 'paint') app.pushUndo();
      this.brushing = true;
      this.flattenTarget = h.point.y;
      this.applyBrush(h.point, e);
    }
  }

  move(e) {
    if (this.app.walker.active) return;
    const app = this.app;
    if (this.handleDrag) { this.dragHandle(e); return; }
    if (this.drag) { this.dragItem(e); return; }
    const t = this.tool;
    if (this.brushing) {
      const h = this.pick(e, { groundOnly: true });
      if (h) { this.placeCursor(h.point); this.applyBrush(h.point, e); }
      return;
    }
    clearTimeout(this._hoverT);
    if (t === 'place' && this.ghost) { this.moveGhost(e); return; }
    if (t === 'wall' || t === 'room') {
      const lv = levelById(app.state.house, this.activeLevel);
      this.setRay(e);
      const p = this.planeHit(lv.elev);
      if (p) { const q = this.snapPlan(worldToPlan(p.x, p.z), lv.id, this.draft[this.draft.length - 1], e.shiftKey); this.updatePreview(q); this.readout(p, q); }
      return;
    }
    if (['paint', 'sculpt', 'clear'].includes(t)) {
      const h = this.pick(e, { groundOnly: true });
      if (h) { this.placeCursor(h.point); this.readout(h.point); }
      return;
    }
    if (['hardscape', 'path', 'fence', 'measure'].includes(t)) {
      const h = t === 'measure' ? this.pick(e, { handles: false }) : this.pick(e, { groundOnly: true });
      if (h) { this.updatePreview(null, h.point); this.readout(h.point); }
      return;
    }
    this._hoverT = setTimeout(() => {
      const h = this.pick(e);
      if (h?.point) this.readout(h.point);
      app.vp.style.cursor = h && (h.kind === 'item' || h.kind === 'handle') ? 'grab' : 'default';
    }, 16);
  }

  up() {
    const app = this.app;
    if (this.handleDrag) {
      const hd = this.handleDrag;
      this.handleDrag = null;
      app.controls.enabled = !app.view.plan2D; app.controls2D.enabled = app.view.plan2D;
      if (hd.moved) { app.rebuild(hd.what); app.changed(); }
      return;
    }
    if (this.drag) {
      const d = this.drag;
      this.drag = null;
      app.controls.enabled = !app.view.plan2D; app.controls2D.enabled = app.view.plan2D;
      if (d.started) { app.rebuild('items'); app.changed(); app.select({ kind: 'item', id: d.id }); }
      return;
    }
    if (this.brushing) {
      this.brushing = false;
      app.controls.enabled = !app.view.plan2D; app.controls2D.enabled = app.view.plan2D;
      if (this.tool === 'sculpt') { app.state.sculpt = null; app.rebuild('terrain'); if (app.site.overlayMode === 'slope' || app.site.overlayMode === 'elevation') app.site.setOverlay(app.site.overlayMode); }
      app.changed();
    }
  }

  dbl() {
    if (!this.draft.length) return;
    if (this.draft.length >= 2) {
      const a = this.draft[this.draft.length - 1], b = this.draft[this.draft.length - 2];
      const ax = a.x ?? a[0], ay = a.z ?? a[1], bx = b.x ?? b[0], by = b.z ?? b[1];
      if (Math.hypot(ax - bx, ay - by) < 0.5) this.draft.pop();
    }
    this.finishDraft();
  }

  key(e) {
    if (e.target.closest && e.target.closest('input,textarea,select,[contenteditable]')) return;
    const app = this.app;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? app.redo() : app.undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); app.redo(); return; }
    if (app.walker.active) return;
    if (e.key === 'Escape') { if (this.draft.length) this.cancelDraft(); else if (this.tool !== 'select') this.setTool('select'); else app.select(null); return; }
    if (e.key === 'Enter') { this.finishDraft(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && app.selection) { e.preventDefault(); app.deleteSelection(); return; }
    if (e.key === 'D' && e.shiftKey) { app.duplicateSelection(); return; }
    const rotKeys = { q: -15, e: 15, Q: -1, E: 1, r: 90, R: 90 };
    if (rotKeys[e.key] !== undefined) {
      const dr = rotKeys[e.key];
      if (this.tool === 'place' && this.ghost) { this.placeRot = (this.placeRot + dr + 360) % 360; this.ghost.rotation.y = -this.placeRot * DEG; return; }
      if (app.selection?.kind === 'item') {
        const it = app.findItem(app.selection.id);
        app.mutate(() => { it.rot = ((it.rot || 0) + dr + 360) % 360; }, 'items');
        app.select(app.selection);
      }
      return;
    }
    if (e.key === 'p') app.setPlan2D(!app.view.plan2D);
    if (e.key === 'l') { app.view.labels = !app.view.labels; app.applyView(); app.ui.syncToggles?.(); }
  }

  // ------------------------------------------------------------------ items
  surfaceFor(h, c) {
    if (!h) return null;
    const [px, py] = worldToPlan(h.point.x, h.point.z);
    if (c.place === 'wall' && h.kind === 'wall') {
      const w = this.app.findWall(h.id);
      const r = distToSeg(px, py, w.a[0], w.a[1], w.b[0], w.b[1]);
      const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
      let nx = -(w.b[1] - w.a[1]) / L, ny = (w.b[0] - w.a[0]) / L;
      if ((px - r.x) * nx + (py - r.y) * ny < 0) { nx = -nx; ny = -ny; }
      const off = w.t / 2 + c.dims[1] / 2 + 0.02;
      return { lv: w.lv, x: r.x + nx * off, y: r.y + ny * off, rot: (Math.atan2(-nx, ny) / DEG + 360) % 360, ground: false };
    }
    if (h.kind === 'room') { const rm = this.app.findRoom(h.id); return { lv: rm.lv, x: px, y: py, ground: false }; }
    if (h.kind === 'terrain') return { lv: null, x: px, y: py, ground: true };
    return { lv: null, x: px, y: py, ground: false, elev: h.point.y };
  }
  makeGhost() {
    const c = CATALOG[this.placeType];
    if (!c) return;
    this.ghost = buildItem({ type: this.placeType, seed: 1 });
    this.ghost.rotation.y = -this.placeRot * DEG;
    this.ghost.visible = false;
    this.app.planGroup.add(this.ghost);
  }
  clearGhost() { if (this.ghost) { this.app.planGroup.remove(this.ghost); this.ghost = null; } }
  moveGhost(e) {
    const c = CATALOG[this.placeType];
    const h = this.pick(e, { handles: false });
    const s = this.surfaceFor(h, c);
    if (!s) { this.ghost.visible = false; return; }
    const sn = c.outdoor ? 0.5 : this.snap;
    if (!e.altKey && !(c.place === 'wall' && h.kind === 'wall')) { s.x = Math.round(s.x / sn) * sn; s.y = Math.round(s.y / sn) * sn; }
    if (s.rot !== undefined) { this.placeRot = s.rot; this.ghost.rotation.y = -s.rot * DEG; }
    this.ghostPos = s;
    const tmp = { type: this.placeType, ...s, dy: c.place === 'wall' ? c.dy : undefined };
    this.ghost.position.set(s.x, this.app.itemBaseY(tmp), s.y);
    this.ghost.visible = true;
    this.readout(h.point);
  }
  commitPlace() {
    const s = this.ghostPos, c = CATALOG[this.placeType];
    if (!s || !this.ghost?.visible || !c) return;
    const it = { id: uid('it'), type: this.placeType, x: +s.x.toFixed(2), y: +s.y.toFixed(2), rot: this.placeRot, lv: s.lv || null, ground: s.ground, seed: Math.floor(Math.random() * 1000) };
    if (!s.lv && !s.ground) it.elev = s.elev;
    if (c.place === 'wall') it.dy = c.dy;
    if (isPlant(this.placeType)) it.age = 0;
    this.app.mutate((st) => st.items.push(it), 'items');
    this.app.select({ kind: 'item', id: it.id });
    if (c.plant) this.placeRot = Math.floor(Math.random() * 360);
  }
  dragItem(e) {
    const app = this.app, d = this.drag;
    if (!d.started) {
      if (Math.hypot(e.clientX - this.downAt[0], e.clientY - this.downAt[1]) < 4) return;
      d.started = true;
      app.pushUndo();
    }
    const it = app.findItem(d.id), c = CATALOG[it.type];
    const h = this.pick(e, { exclude: it.id, handles: false });
    const s = this.surfaceFor(h, c);
    if (!s) return;
    const sn = c.outdoor ? 0.5 : this.snap;
    if (!e.altKey && !(c.place === 'wall' && h.kind === 'wall')) { s.x = Math.round(s.x / sn) * sn; s.y = Math.round(s.y / sn) * sn; }
    Object.assign(it, { x: +s.x.toFixed(2), y: +s.y.toFixed(2), lv: s.lv, ground: s.ground });
    if (s.rot !== undefined) it.rot = Math.round(s.rot);
    if (!s.lv && !s.ground) it.elev = s.elev; else delete it.elev;
    const g = app.itemMeshes.get(it.id);
    if (g) {
      if (g.parent) g.parent.remove(g);
      app.planGroup.add(g);
      g.position.set(it.x, app.itemBaseY(it), it.y);
      g.rotation.y = -(it.rot || 0) * DEG;
    }
    this.updateSelectionBox();
    if (h?.point) this.readout(h.point);
  }

  // ------------------------------------------------------------------ handles
  refreshHandles() {
    for (const h of this.handles) h.parent?.remove(h);
    this.handles = [];
    const s = this.app.selection;
    if (!s) return;
    const mk = (parent, x, y, z, data) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffd24a', depthTest: false, transparent: true, opacity: 0.95 }));
      m.renderOrder = 20;
      m.position.set(x, y, z);
      m.userData.handle = data;
      parent.add(m);
      this.handles.push(m);
    };
    if (s.kind === 'wall') {
      const w = this.app.findWall(s.id);
      if (!w) return;
      const lv = levelById(this.app.state.house, w.lv);
      mk(this.planHandleGroup, w.a[0], lv.elev + 0.4, w.a[1], { target: 'wall', id: w.id, which: 'a' });
      mk(this.planHandleGroup, w.b[0], lv.elev + 0.4, w.b[1], { target: 'wall', id: w.id, which: 'b' });
    } else if (s.kind === 'hardscape' || s.kind === 'fence') {
      const o = s.kind === 'hardscape' ? this.app.findHardscape(s.id) : this.app.findFence(s.id);
      if (!o) return;
      o.pts.forEach(([x, z], i) => mk(this.handleGroup, x, this.app.site.height(x, z) + 0.6, z, { target: s.kind, id: s.id, idx: i }));
    } else if (s.kind === 'room') {
      const r = this.app.findRoom(s.id);
      if (!r) return;
      const lv = levelById(this.app.state.house, r.lv);
      r.pts.forEach(([x, y], i) => mk(this.planHandleGroup, x, lv.elev + 0.4, y, { target: 'room', id: r.id, idx: i }));
    }
  }
  startHandleDrag(h, e) {
    this.handleDrag = { ...h, moved: false, what: h.target === 'hardscape' ? 'ground' : h.target === 'fence' ? 'fences' : 'house' };
    this.app.controls.enabled = false; this.app.controls2D.enabled = false;
    if (h.target === 'wall') {
      const w = this.app.findWall(h.id);
      this.handleDrag.orig = w[h.which].slice();
    }
    void e;
  }
  dragHandle(e) {
    const app = this.app, hd = this.handleDrag;
    if (!hd.moved) { app.pushUndo(); hd.moved = true; }
    if (hd.target === 'wall' || hd.target === 'room') {
      const obj = hd.target === 'wall' ? app.findWall(hd.id) : app.findRoom(hd.id);
      const lv = levelById(app.state.house, obj.lv);
      this.setRay(e);
      const p = this.planeHit(lv.elev);
      if (!p) return;
      if (hd.target === 'wall') {
        const other = hd.which === 'a' ? obj.b : obj.a;
        const q = this.snapPlan(worldToPlan(p.x, p.z), lv.id, other, e.shiftKey, hd.orig);
        for (const w of app.state.house.walls) {
          if (w.lv !== obj.lv) continue;
          for (const k of ['a', 'b']) if (Math.hypot(w[k][0] - hd.orig[0], w[k][1] - hd.orig[1]) < 0.05) w[k] = q.slice();
        }
        hd.orig = q.slice();
        this.readout(p, q);
      } else {
        const [x, y] = worldToPlan(p.x, p.z);
        obj.pts[hd.idx] = [Math.round(x / this.snap) * this.snap, Math.round(y / this.snap) * this.snap];
      }
      if (!this._raf) this._raf = requestAnimationFrame(() => { this._raf = null; app.buildHouse(); app.buildItems(); app.collectPickables(); app.applyView(); this.refreshHandles(); this.updateSelectionBox(); });
    } else {
      const h = this.pick(e, { groundOnly: true });
      if (!h) return;
      const o = hd.target === 'hardscape' ? app.findHardscape(hd.id) : app.findFence(hd.id);
      o.pts[hd.idx] = [+h.point.x.toFixed(2), +h.point.z.toFixed(2)];
      const hm = this.handles.find((m) => m.userData.handle.idx === hd.idx);
      if (hm) hm.position.set(h.point.x, h.point.y + 0.6, h.point.z);
      if (!this._raf) this._raf = requestAnimationFrame(() => { this._raf = null; if (hd.target === 'hardscape') app.site.redrawGround(); else app.buildFences(); });
    }
  }

  updateSelectionBox() {
    const s = this.app.selection;
    const box = new THREE.Box3();
    let any = false;
    const addObj = (o) => { o.updateWorldMatrix(true, true); box.expandByObject(o); any = true; };
    if (s?.kind === 'item') { const g = this.app.itemMeshes?.get(s.id); if (g) addObj(g); }
    else if (s && ['wall', 'opening', 'room', 'fence', 'stair', 'struct', 'garage'].includes(s.kind)) {
      for (const m of this.app.pickables) { const pk = m.userData.pick; if (pk && pk.kind === s.kind && (pk.id === s.id || s.kind === 'garage')) addObj(m); }
    }
    this.selBox.box.copy(box);
    this.selBox.visible = any;
  }

  // ------------------------------------------------------------------ brushes
  placeCursor(p) {
    const r = this.tool === 'clear' ? this.brush.r * 3 : this.brush.r;
    this.cursor.position.set(p.x, p.y + 0.3, p.z);
    this.cursor.scale.setScalar(r);
    this.cursor.visible = true;
  }
  applyBrush(p, e) {
    const app = this.app, b = this.brush;
    if (this.tool === 'paint') {
      app.site.paintAt(p.x, p.z, b.r, b.mat, b.erase || e.altKey);
      if (!this._praf) this._praf = requestAnimationFrame(() => { this._praf = null; app.site.redrawGround(); });
    } else if (this.tool === 'sculpt') {
      app.site.sculptAt(p.x, p.z, b.r, b.strength * 0.35, e.altKey && b.mode === 'raise' ? 'lower' : b.mode, this.flattenTarget);
    } else if (this.tool === 'clear') {
      const ids = app.site.canopyWithin(p.x, p.z, b.r * 3);
      const set = new Set(app.state.clearedCanopy || []);
      let added = 0;
      for (const i of ids) if (!set.has(i)) { set.add(i); added++; }
      if (added) { app.state.clearedCanopy = [...set]; app.site.applyCanopyClearing(); }
    }
  }

  // ------------------------------------------------------------------ drafts / previews
  cancelDraft() {
    this.draft = [];
    this.preview.clear();
    this.planPreview.clear();
    this.clearLabel();
  }
  clearLabel() { if (this.lenLabel) { this.lenLabel.parent?.remove(this.lenLabel); this.lenLabel = null; } }
  showLabel(parent, pos, html) {
    if (!this.lenLabel) { const d = document.createElement('div'); d.className = 'len-label'; this.lenLabel = new CSS2DObject(d); }
    this.lenLabel.element.innerHTML = html;
    this.lenLabel.position.copy(pos);
    parent.add(this.lenLabel);
  }
  updatePreview(planQ, worldP) {
    const app = this.app, t = this.tool;
    this.preview.clear();
    this.planPreview.clear();
    const lineMat = new THREE.LineBasicMaterial({ color: '#ffd24a', depthTest: false });
    if (t === 'wall' || t === 'room') {
      const lv = levelById(app.state.house, this.activeLevel);
      const y = lv.elev + 0.25;
      const pts = [...this.draft, ...(planQ ? [planQ] : [])];
      if (t === 'room' && pts.length > 2) pts.push(pts[0]);
      if (pts.length >= 2) {
        const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(([x, z]) => new THREE.Vector3(x, y, z))), lineMat);
        l.renderOrder = 15;
        this.planPreview.add(l);
      }
      for (const [x, z] of pts) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffd24a', depthTest: false })); d.position.set(x, y, z); d.renderOrder = 16; this.planPreview.add(d); }
      const last = this.draft[this.draft.length - 1];
      if (last && planQ) {
        const L = Math.hypot(planQ[0] - last[0], planQ[1] - last[1]);
        this.showLabel(this.planPreview, new THREE.Vector3((planQ[0] + last[0]) / 2, y + 1, (planQ[1] + last[1]) / 2), ftIn(L));
      } else this.clearLabel();
      return;
    }
    if (t === 'measure') {
      if (this.draft.length === 1 && worldP) {
        const a = this.draft[0];
        this.preview.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, worldP]), lineMat));
        this.showLabel(this.preview, a.clone().lerp(worldP, 0.5), this.measureText(a, worldP));
      }
      return;
    }
    if (['hardscape', 'path', 'fence'].includes(t)) {
      const pts = [...this.draft, ...(worldP ? [[worldP.x, worldP.z]] : [])];
      if (t === 'hardscape' && pts.length > 2) pts.push(pts[0]);
      if (pts.length >= 2) {
        const arr = app.site.drapeLine(pts, 0.5, 3);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
        const l = new THREE.Line(g, lineMat);
        l.renderOrder = 15;
        this.preview.add(l);
      }
      const last = this.draft[this.draft.length - 1];
      if (last && worldP) {
        const L = Math.hypot(worldP.x - last[0], worldP.z - last[1]);
        this.showLabel(this.preview, new THREE.Vector3((worldP.x + last[0]) / 2, worldP.y + 2, (worldP.z + last[1]) / 2), ftIn(L));
      }
    }
  }
  finishDraft() {
    const app = this.app, t = this.tool, pts = this.draft;
    if (t === 'room' && pts.length >= 3) {
      const r = { id: uid('rm'), lv: this.activeLevel, name: 'New room', pts: pts.map((p) => p.slice()), floor: 'hardwood', finished: true };
      app.mutate((st) => st.house.rooms.push(r), 'house');
      app.select({ kind: 'room', id: r.id });
    } else if (t === 'hardscape' && pts.length >= 3) {
      const h = { id: uid('hs'), kind: 'poly', name: 'New ' + this.hsMat, mat: this.hsMat, pts: pts.map(([x, z]) => [+x.toFixed(2), +z.toFixed(2)]) };
      app.mutate((st) => st.hardscape.push(h), 'ground');
      app.select({ kind: 'hardscape', id: h.id });
    } else if (t === 'path' && pts.length >= 2) {
      const h = { id: uid('hs'), kind: 'path', name: 'New path', mat: this.hsMat, width: this.pathW, pts: pts.map(([x, z]) => [+x.toFixed(2), +z.toFixed(2)]) };
      app.mutate((st) => st.hardscape.push(h), 'ground');
      app.select({ kind: 'hardscape', id: h.id });
    } else if (t === 'fence' && pts.length >= 2) {
      const f = { id: uid('fn'), type: this.fenceType, pts: pts.map(([x, z]) => [+x.toFixed(2), +z.toFixed(2)]) };
      app.mutate((st) => st.fences.push(f), 'fences');
      app.select({ kind: 'fence', id: f.id });
    }
    this.cancelDraft();
  }

  // ------------------------------------------------------------------ measure
  measureText(a, b) {
    const dh = Math.hypot(b.x - a.x, b.z - a.z), dv = b.y - a.y;
    return `<b>${ftIn(dh)}</b> horiz · ${ftIn(Math.hypot(dh, dv))} true<br>Δ elev ${dv >= 0 ? '+' : ''}${dv.toFixed(1)} ft · ${dh > 0.01 ? ((dv / dh) * 100).toFixed(1) : '—'}% slope`;
  }
  addMeasure(a, b) {
    const g = new THREE.Group();
    const m = new THREE.LineBasicMaterial({ color: '#4ad9ff', depthTest: false });
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), m);
    l.renderOrder = 15;
    g.add(l);
    for (const p of [a, b]) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: '#4ad9ff', depthTest: false })); s.position.copy(p); s.renderOrder = 16; g.add(s); }
    const d = document.createElement('div');
    d.className = 'len-label measure';
    d.innerHTML = this.measureText(a, b);
    const lab = new CSS2DObject(d);
    lab.position.copy(a.clone().lerp(b, 0.5));
    g.add(lab);
    this.app.scene.add(g);
    this.app.measures.push(g);
    this.clearLabel();
  }
  clearMeasures() { for (const g of this.app.measures) { g.traverse((o) => { if (o.isCSS2DObject) o.element.remove(); }); this.app.scene.remove(g); } this.app.measures = []; }

  // ------------------------------------------------------------------ misc
  hardscapeAt(x, z) {
    const list = this.app.state.hardscape;
    for (let i = list.length - 1; i >= 0; i--) {
      const h = list[i];
      if (h.kind === 'path') { if (distToPolyline(x, z, h.pts).d < h.width / 2) return h; }
      else if (pointInPoly(x, z, h.pts)) return h;
    }
    return null;
  }
  readout(p, plan) {
    const site = this.app.site;
    const [lat, lon] = worldToLatLon(p.x, p.z);
    const [px, py] = plan || worldToPlan(p.x, p.z);
    const elev = p.y + FRAME.mainFloorASL;
    const sunH = this.app.heat.sample(p.x, p.z);
    const parts = [
      `Elev <b>${elev.toFixed(1)}′</b> ASL (${p.y >= 0 ? '+' : ''}${p.y.toFixed(1)}′ vs main floor)`,
      `Slope ${Math.abs(p.y - site.height(p.x, p.z)) < 0.6 ? site.slopeAt(p.x, p.z).toFixed(0) + '%' : '—'}`,
      `Plan ${px.toFixed(1)}, ${py.toFixed(1)}`,
      `${lat.toFixed(6)}, ${lon.toFixed(6)}`,
      site.inParcel(p.x, p.z) ? '<span class="ok">in parcel</span>' : '<span class="muted">outside parcel</span>',
      sunH !== null ? `Sun ${sunH.toFixed(1)} h/day` : '',
    ];
    this.app.ui.readout(parts.filter(Boolean).join(' · '));
  }
}
