import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { FRAME, planToWorld, worldToPlan, PLAN_ROT_Y } from './frame.js';
import { defaultHouse, defaultFixtures } from './houseData.js';
import { HouseBuilder, levelById } from './houseBuilder.js';
import { Site, defaultHardscape, defaultTrees, hardscapeArea, NEAR, MATERIALS_GROUND } from './site.js';
import { CATALOG, buildItem, applySeason, PLANT_STATE, plantSpec, plantHeight, setLampsOn } from './catalog.js';
import { setClipPlanes, glassMat, mat, FLOORS, EXTERIORS, ROOFS, unclip } from './materials.js';
import { sunPosition, sunVector, localToUTC } from './sun.js';
import { Walker } from './walk.js';
import { SunHeat } from './sunHeat.js';
import { Editor } from './editor.js';
import { UI } from './ui.js';
import { Store } from './store.js';
import { buildFence, FENCES } from './fences.js';
import { uid, deepClone, polyArea, polylineLength, DEG } from './util.js';

export const HOUSE_CENTER_PLAN = [24, 30];

export function defaultState() {
  const items = defaultFixtures().map((f) => ({ id: uid('it'), ...f, existing: true }));
  const { T, S } = defaultTrees();
  for (const [sp, x, z, seed] of T) {
    const [px, py] = worldToPlan(x, z);
    items.push({ id: uid('it'), type: 'tree_' + sp, x: px, y: py, ground: true, rot: (seed * 37) % 360, seed, existing: true, age: null });
  }
  for (const [sp, a, b, fr] of S) {
    const [px, py] = fr === 'w' ? worldToPlan(a, b) : [a, b];
    items.push({ id: uid('it'), type: 'shrub_' + sp, x: px, y: py, ground: true, rot: 0, seed: Math.round(a * 7) % 17, existing: true, age: null });
  }
  return {
    version: 1,
    name: 'As-built (May 2026 scan)',
    house: defaultHouse(),
    finish: { brick: 'brick', siding: 'siding', roof: 'charcoal', trim: '#f4f3ef', door: '#34475e' },
    items,
    hardscape: defaultHardscape(),
    fences: [],
    clearedCanopy: [],
    sculpt: null,
    view: { groundMode: 'designed' },
  };
}

class App {
  constructor() {
    this.view = { level: 'all', roof: true, ceilings: false, labels: true, xray: false, furniture: true, cutH: 4.6, shadows: true, plan2D: false };
    this.sunState = (() => { const d = new Date(); return { month: d.getMonth(), day: d.getDate(), hour: 15, animate: false, speed: 1, seasonAuto: true, season: null }; })();
    this.undoStack = [];
    this.redoStack = [];
    this.measures = [];
    this.selection = null;
    this.walkables = [];
    this.colliders = [];
    this.pickables = [];
  }

  async init() {
    const vp = document.getElementById('viewport');
    this.vp = vp;
    const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, logarithmicDepthBuffer: false });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.setSize(vp.clientWidth, vp.clientHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.62;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.localClippingEnabled = true;
    vp.appendChild(r.domElement);
    this.renderer = r;
    this.labels = new CSS2DRenderer();
    this.labels.setSize(vp.clientWidth, vp.clientHeight);
    this.labels.domElement.className = 'label-layer';
    vp.appendChild(this.labels.domElement);

    this.scene = new THREE.Scene();
    this.camera3D = new THREE.PerspectiveCamera(50, vp.clientWidth / vp.clientHeight, 0.5, 20000);
    this.camera = this.camera3D;
    const a = vp.clientWidth / vp.clientHeight;
    this.camera2D = new THREE.OrthographicCamera(-60 * a, 60 * a, 60, -60, 1, 5000);
    this.controls = new OrbitControls(this.camera3D, r.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 3000;
    this.controls.screenSpacePanning = false;
    this.controls2D = new OrbitControls(this.camera2D, r.domElement);
    this.controls2D.enableRotate = false;
    this.controls2D.screenSpacePanning = true;
    this.controls2D.enabled = false;
    this.controls2D.zoomToCursor = true;
    this.controls.zoomToCursor = true;

    // lighting
    this.sky = new Sky();
    this.sky.scale.setScalar(18000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 5.5; u.rayleigh.value = 1.4; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.8;
    this.scene.add(this.sky);
    this.skyScene = new THREE.Scene();
    this.skyForEnv = new Sky();
    this.skyForEnv.scale.setScalar(1000);
    Object.assign(this.skyForEnv.material.uniforms.turbidity, { value: 5.5 });
    this.skyScene.add(this.skyForEnv);
    this.pmrem = new THREE.PMREMGenerator(r);
    this.sun = new THREE.DirectionalLight('#fff4e0', 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    const sc = this.sun.shadow.camera;
    sc.left = -150; sc.right = 150; sc.top = 150; sc.bottom = -150; sc.near = 10; sc.far = 1600;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight('#cfe3ff', '#5d5140', 0.35);
    this.scene.add(this.hemi);
    this.scene.fog = new THREE.Fog('#c9d8e6', 1400, 6500);
    const horizon = new THREE.Mesh(new THREE.CircleGeometry(16000, 64).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#4f6b3c' }));
    horizon.position.y = -238;
    this.scene.add(horizon);

    this.planGroup = new THREE.Group();
    this.planGroup.position.set(FRAME.tx, 0, FRAME.tz);
    this.planGroup.rotation.y = PLAN_ROT_Y;
    this.scene.add(this.planGroup);
    this.outdoorItems = new THREE.Group();
    this.planGroup.add(this.outdoorItems);
    this.fenceGroup = new THREE.Group();
    this.scene.add(this.fenceGroup);
    this.helperGroup = new THREE.Group();
    this.scene.add(this.helperGroup);

    this.ui = new UI(this);
    this.ui.status('Loading site data…');
    const saved = await Store.get('__autosave__').catch(() => null);
    this.state = defaultState();
    this.baseline = deepClone(this.state);
    let paint = null;
    if (saved && saved.state) {
      try {
        const st = JSON.parse(saved.state);
        if (st.version === 1) { this.state = st; this.state.sculpt = saved.sculpt ? Array.from(saved.sculpt) : null; paint = saved.paint || null; }
      } catch (e) { console.warn('autosave ignored', e); }
    }
    this.site = new Site(this);
    await this.site.load();
    this.scene.add(this.site.build(this.state));
    if (paint) { await this.site.loadPaint(paint); this.site.redrawGround(); }
    this.walker = new Walker(this);
    this.heat = new SunHeat(this);
    this.editor = new Editor(this);
    this.rebuildAll();
    this.ui.build();
    this.applySun();
    this.setPreset('house', true);
    addEventListener('resize', () => this.resize());
    this.resize();
    this.clock = new THREE.Clock();
    r.setAnimationLoop(() => this.frame());
    this.ui.status('Ready');
    document.body.classList.add('ready');
  }

  resize() {
    const w = this.vp.clientWidth, h = this.vp.clientHeight;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.camera3D.aspect = w / h;
    this.camera3D.updateProjectionMatrix();
    const H = (this.camera2D.top - this.camera2D.bottom) / 2;
    this.camera2D.left = -H * w / h; this.camera2D.right = H * w / h;
    this.camera2D.updateProjectionMatrix();
    this.site?.setLineResolution(w, h);
  }

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.renderPaused) return;
    if (this.walker.active) this.walker.update(dt);
    else if (this.view.plan2D) this.controls2D.update();
    else this.controls.update();
    if (this.sunState.animate) {
      this.sunState.hour += dt * this.sunState.speed * 0.5;
      if (this.sunState.hour > 21.5) this.sunState.hour = 5;
      this.applySun();
      this.ui.syncSun?.();
    }
    const tgt = this.walker.active ? this.camera.position : (this.view.plan2D ? this.controls2D.target : this.controls.target);
    this.followShadow(tgt);
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
    this.ui.tickCompass?.();
  }

  followShadow(t) {
    const cx = THREE.MathUtils.clamp(t.x, -400, 400), cz = THREE.MathUtils.clamp(t.z, -400, 400);
    const snap = 4;
    const x = Math.round(cx / snap) * snap, z = Math.round(cz / snap) * snap;
    const v = this.sunVec || [0, 1, 0];
    this.sun.target.position.set(x, 0, z);
    this.sun.position.set(x + v[0] * 700, v[1] * 700, z + v[2] * 700);
  }

  // ------------------------------------------------------------------ state + undo
  snapshot() { return { json: JSON.stringify({ ...this.state, sculpt: null }), sculpt: this.site.sculpt.slice() }; }
  restore(s) {
    this.state = JSON.parse(s.json);
    this.state.sculpt = Array.from(s.sculpt);
    this.site.state = this.state;
    this.site.sculpt.set(s.sculpt);
    for (let k = 0; k < this.site.nearH.length; k++) this.site.nearH[k] = this.site.nearBase[k] + this.site.sculpt[k];
    this.site.applyNearHeights();
    this.select(null);
    this.rebuildAll();
    this.ui.refresh();
  }
  pushUndo() {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 60) this.undoStack.shift();
    this.redoStack = [];
    this.ui.updateUndo?.();
  }
  undo() { if (!this.undoStack.length) return; this.redoStack.push(this.snapshot()); this.restore(this.undoStack.pop()); this.ui.toast('Undo'); this.changed(false); }
  redo() { if (!this.redoStack.length) return; this.undoStack.push(this.snapshot()); this.restore(this.redoStack.pop()); this.ui.toast('Redo'); this.changed(false); }

  // mutate(fn, what): snapshot, apply, rebuild relevant parts
  mutate(fn, what = 'all') {
    this.pushUndo();
    fn(this.state);
    this.rebuild(what);
    this.changed();
  }
  rebuild(what) {
    if (what === 'all' || what === 'house') this.buildHouse();
    if (what === 'all' || what === 'items' || what === 'house') this.buildItems();
    if (what === 'all' || what === 'ground') this.site.redrawGround();
    if (what === 'all' || what === 'fences') this.buildFences();
    if (what === 'canopy') this.site.applyCanopyClearing();
    if (what === 'terrain') { this.buildItems(); this.buildFences(); }
    this.collectPickables();
    this.applyView();
    this.editor.refreshHandles();
    this.ui.refreshInspector();
  }
  rebuildAll() { this.buildHouse(); this.buildItems(); this.buildFences(); this.site.redrawGround(); this.site.applyCanopyClearing(); this.collectPickables(); this.applyView(); applySeason(this.currentSeason()); this.site.applyCanopySeason(this.currentSeason()); }

  changed(save = true) {
    this.ui.refreshEstimate?.();
    this.ui.refreshStats?.();
    if (!save) return;
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => this.autosave(), 1200);
  }
  async autosave() {
    this.state.sculpt = null;
    await Store.put('__autosave__', { state: JSON.stringify(this.state), sculpt: this.site.sculpt.slice(), paint: this.site.paintDataURL(), savedAt: Date.now() }).catch((e) => console.warn(e));
    this.ui.status('Saved ' + new Date().toLocaleTimeString());
  }

  // ------------------------------------------------------------------ builders
  disposeGroup(g) {
    g.traverse((o) => {
      if (o.isCSS2DObject) o.element.remove();
      else if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose?.();
    });
    g.clear();
  }
  buildHouse() {
    if (this.houseOut) {
      for (const g of Object.values(this.houseOut.levels)) { this.planGroup.remove(g); this.disposeGroup(g); }
      for (const k of ['roof', 'site']) { this.planGroup.remove(this.houseOut[k]); this.disposeGroup(this.houseOut[k]); }
      this.scene.remove(this.houseOut.garage); this.disposeGroup(this.houseOut.garage);
    }
    const b = new HouseBuilder(this.state);
    const out = b.build();
    b.buildGarage(this.site.garageFloor);
    unclip(out.garage);
    unclip(out.site);
    for (const g of Object.values(out.levels)) this.planGroup.add(g);
    this.planGroup.add(out.roof, out.site);
    this.scene.add(out.garage);
    this.houseOut = out;
  }

  itemBaseY(it) {
    const c = CATALOG[it.type];
    if (it.lv) {
      const lv = levelById(this.state.house, it.lv);
      if (!lv) return 0;
      if (c?.place === 'ceiling') return lv.elev + lv.height - (c.dims[2] * (it.scale?.[2] ?? 1));
      return lv.elev + (it.dy ?? (c?.place === 'wall' ? c.dy : 0) ?? 0);
    }
    if (it.ground) { const [wx, wz] = planToWorld(it.x, it.y); return this.site.height(wx, wz) + (it.dy || 0); }
    return it.elev ?? 0;
  }
  buildItems() {
    for (const lv of Object.values(this.houseOut.levels)) { const p = lv.userData.parts.items; p.clear(); }
    this.outdoorItems.clear();
    this.itemMeshes = new Map();
    const years = PLANT_STATE.years;
    for (const it of this.state.items) {
      const c = CATALOG[it.type];
      if (!c) continue;
      const g = buildItem(it);
      g.position.set(it.x, this.itemBaseY(it), it.y);
      g.rotation.y = -(it.rot || 0) * DEG;
      const s = it.scale || [1, 1, 1];
      g.scale.set(s[0], s[2], s[1]);
      const spec = plantSpec(it.type);
      if (spec && it.age !== null && it.age !== undefined) {
        const f = plantHeight(spec, it.age + years) / spec.h;
        g.scale.multiplyScalar(f);
      }
      g.userData.itemId = it.id;
      g.traverse((o) => { if (o.isMesh) o.userData.pick = { kind: 'item', id: it.id }; });
      const parent = it.lv && this.houseOut.levels[it.lv] ? this.houseOut.levels[it.lv].userData.parts.items : this.outdoorItems;
      if (!it.lv) unclip(g);
      parent.add(g);
      this.itemMeshes.set(it.id, g);
    }
  }
  buildFences() {
    this.fenceGroup.clear();
    for (const f of this.state.fences) { const g = buildFence(f, this.site); unclip(g); this.fenceGroup.add(g); }
  }
  collectPickables() {
    const P = [...this.houseOut.pick];
    this.planGroup.updateMatrixWorld(true);
    for (const g of this.itemMeshes.values()) g.traverse((o) => o.isMesh && P.push(o));
    this.fenceGroup.traverse((o) => o.isMesh && P.push(o));
    this.houseOut.garage.traverse((o) => o.isMesh && P.push(o));
    this.site.layers.buildings.children.forEach((o) => P.push(o));
    this.pickables = P;
    this.walkables = [...this.houseOut.walk];
    this.colliders = [...this.houseOut.colliders];
    this.houseOut.garage.traverse((o) => { if (o.isMesh && o.userData.pick?.kind === 'garage' && o.geometry.type === 'BoxGeometry' && o.position.y > 1) this.colliders.push(o); });
    this.fenceGroup.traverse((o) => o.isMesh && this.colliders.push(o));
  }

  // ------------------------------------------------------------------ view
  levelIndex(id) { return this.state.house.levels.findIndex((l) => l.id === id); }
  applyView() {
    const v = this.view;
    const idx = v.level === 'all' ? 99 : this.levelIndex(v.level);
    for (const [id, g] of Object.entries(this.houseOut.levels)) {
      const i = this.levelIndex(id);
      g.visible = i <= idx;
      g.userData.parts.ceilings.visible = v.ceilings && (v.level === 'all' || i < idx);
      g.userData.parts.items.visible = v.furniture;
      g.userData.parts.labels.visible = v.labels && v.level === id;
      g.userData.parts.labels.children.forEach((l) => (l.visible = v.labels && v.level === id));
    }
    this.houseOut.roof.visible = v.roof && v.level === 'all';
    const hideTrees = v.plan2D && v.level !== 'all';
    this.site.layers.canopy.visible = !hideTrees && v.woods !== false;
    for (const g of this.itemMeshes?.values() || []) if (g.userData.catalog?.tree) g.visible = !hideTrees;
    if (v.level === 'all') setClipPlanes([]);
    else {
      const lv = levelById(this.state.house, v.level);
      if (!this.clipPlane) this.clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
      this.clipPlane.constant = lv.elev + v.cutH;
      setClipPlanes([this.clipPlane]);
    }
    this.applyXray();
    this.sun.castShadow = v.shadows;
  }
  applyXray() {
    const x = this.view.xray;
    if (!this.xrayMat) this.xrayMat = mat('xray', () => new THREE.MeshStandardMaterial({ color: '#dfe7ee', transparent: true, opacity: 0.22, depthWrite: false }));
    for (const g of Object.values(this.houseOut.levels)) {
      g.userData.parts.walls.traverse((o) => {
        if (!o.isMesh || o.userData.pick?.kind !== 'wall') return;
        if (x) { if (!o.userData.origMat) o.userData.origMat = o.material; o.material = this.xrayMat; o.castShadow = false; }
        else if (o.userData.origMat) { o.material = o.userData.origMat; delete o.userData.origMat; o.castShadow = true; }
      });
    }
  }
  setLevel(id) {
    this.view.level = id;
    this.applyView();
    this.ui.syncLevel?.();
    if (id !== 'all') this.editor.activeLevel = id;
  }

  setPlan2D(on) {
    this.view.plan2D = on;
    const t = this.controls.target.clone();
    if (on) {
      this.camera = this.camera2D;
      this.controls.enabled = false;
      this.controls2D.enabled = true;
      const [cx, cz] = planToWorld(...HOUSE_CENTER_PLAN);
      const tgt = this.selection ? t : new THREE.Vector3(cx, 0, cz);
      this.controls2D.target.copy(tgt);
      const s = Math.sin(FRAME.rotDeg * DEG), c = Math.cos(FRAME.rotDeg * DEG);
      this.camera2D.position.set(tgt.x - s * 0.02, 900, tgt.z + c * 0.02);
      this.camera2D.zoom = 1;
      this.camera2D.updateProjectionMatrix();
      this.controls2D.update();
      if (this.view.level === 'all') this.setLevel('main');
    } else {
      this.camera = this.camera3D;
      this.controls2D.enabled = false;
      this.controls.enabled = true;
    }
    this.applyView();
    this.ui.syncViewButtons?.();
  }

  setPreset(name, instant = false) {
    if (this.walker.active) this.stopWalk();
    if (this.view.plan2D && name !== 'plan') this.setPlan2D(false);
    const [hx, hz] = planToWorld(...HOUSE_CENTER_PLAN);
    const c = Math.cos(FRAME.rotDeg * DEG), s = Math.sin(FRAME.rotDeg * DEG);
    const dirPlan = (px, py) => [c * px - s * py, s * px + c * py];
    let pos, tgt = new THREE.Vector3(hx, 6, hz);
    switch (name) {
      case 'aerial': pos = new THREE.Vector3(420, 640, 760); tgt = new THREE.Vector3(-20, -40, 40); break;
      case 'parcel': pos = new THREE.Vector3(-620, 820, 380); tgt = new THREE.Vector3(-20, -40, 40); break;
      case 'house': pos = new THREE.Vector3(hx + 78, 52, hz + 88); break;
      case 'plan': this.setPlan2D(true); return;
      case 'north': case 'south': case 'east': case 'west': {
        const d = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] }[name];
        const [dx, dz] = dirPlan(d[0], d[1]);
        pos = new THREE.Vector3(hx + dx * 110, 8, hz + dz * 110);
        tgt = new THREE.Vector3(hx, 6, hz);
        break;
      }
      case 'yard': { const [dx, dz] = dirPlan(0.4, 1); pos = new THREE.Vector3(hx + dx * 150, 30, hz + dz * 150); tgt = new THREE.Vector3(hx, -4, hz + 20); break; }
      case 'garage': pos = new THREE.Vector3(60, 30, -130); tgt = new THREE.Vector3(15, 0, -45); break;
      default: return;
    }
    this.animateCamera(pos, tgt, instant ? 0 : 0.9);
  }
  animateCamera(pos, tgt, dur = 0.9) {
    const cam = this.camera3D, ctl = this.controls;
    if (!dur) { cam.position.copy(pos); ctl.target.copy(tgt); ctl.update(); return; }
    const p0 = cam.position.clone(), t0 = ctl.target.clone(), start = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - start) / (dur * 1000));
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      cam.position.lerpVectors(p0, pos, e);
      ctl.target.lerpVectors(t0, tgt, e);
      ctl.update();
      if (k < 1) requestAnimationFrame(step);
    };
    step();
  }
  focusOn(worldPos, dist = 40) {
    const cam = this.camera3D;
    const dir = cam.position.clone().sub(this.controls.target).normalize();
    this.animateCamera(worldPos.clone().add(dir.multiplyScalar(dist)), worldPos.clone(), 0.7);
  }

  // ------------------------------------------------------------------ walk
  startWalk(where = 'front') {
    if (this.view.plan2D) this.setPlan2D(false);
    this.prevView = { ...this.view };
    this.view.level = 'all'; this.view.roof = true; this.view.ceilings = true; this.view.xray = false;
    this.applyView();
    const spots = {
      front: { p: [44, 15], look: [30, 15], lvY: 1 },
      great: { p: [30, 30], look: [15, 20], lvY: 1 },
      bsmt: { p: [30, 40], look: [20, 34], lvY: -7 },
      upper: { p: [30, 24], look: [30, 16], lvY: 10.5 },
      yard: { p: [30, 95], look: [26, 40], lvY: 20 },
      drive: { p: [10, -40], look: [20, 10], lvY: 20 },
    };
    const s = spots[where] || spots.front;
    const [x, z] = planToWorld(...s.p), [lx, lz] = planToWorld(...s.look);
    this.walker.start({ x, z, y: s.lvY + 2, lookAt: new THREE.Vector3(lx, s.lvY + 5, lz) });
    this.controls.enabled = false;
    this.ui.onWalk(true);
  }
  stopWalk() {
    if (!this.walker.active) return;
    this.walker.stop();
    this.controls.enabled = true;
    if (this.prevView) { Object.assign(this.view, this.prevView); this.prevView = null; }
    this.applyView();
    const cam = this.camera3D;
    const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    this.controls.target.copy(cam.position).add(dir.multiplyScalar(20));
    cam.position.add(new THREE.Vector3(0, 12, 0)).sub(dir.clone().normalize().multiplyScalar(25));
    this.controls.update();
    this.ui.onWalk(false);
  }
  onWalkUnlock() { this.stopWalk(); }

  // ------------------------------------------------------------------ sun / season
  currentSeason() {
    if (!this.sunState.seasonAuto && this.sunState.season) return this.sunState.season;
    const m = this.sunState.month;
    return m <= 1 || m === 11 ? 'winter' : m <= 4 ? 'spring' : m <= 8 ? 'summer' : 'fall';
  }
  applySun() {
    const { month, day, hour } = this.sunState;
    const y = 2026;
    const sp = sunPosition(localToUTC(y, month, day, hour), FRAME.lat0, FRAME.lon0);
    this.sunPos = sp;
    const v = sunVector(sp.azimuth, sp.elevation);
    this.sunVec = v;
    const el = sp.elevation;
    const day01 = THREE.MathUtils.smoothstep(el, -4, 8);
    this.sun.intensity = 3.2 * THREE.MathUtils.smoothstep(el, -1, 12);
    this.sun.color.setHSL(0.09, 0.6 * (1 - THREE.MathUtils.smoothstep(el, 5, 35)) + 0.15, 0.62 + 0.3 * THREE.MathUtils.smoothstep(el, 5, 40));
    this.hemi.intensity = 0.3 + 0.1 * day01;
    this.hemi.color.set(day01 > 0.2 ? '#cfe3ff' : '#6d82a8');
    const sv = new THREE.Vector3(v[0], v[1], v[2]);
    this.sky.material.uniforms.sunPosition.value.copy(sv);
    this.skyForEnv.material.uniforms.sunPosition.value.copy(sv);
    this.renderer.toneMappingExposure = 0.5 + 0.15 * day01;
    this.scene.fog.color.setHSL(0.58, 0.25, 0.1 + 0.68 * day01);
    const night = el < 2;
    glassMat().emissiveIntensity = night ? 0.9 : 0;
    setLampsOn(night);
    clearTimeout(this._envT);
    this._envT = setTimeout(() => {
      if (this.envRT) this.envRT.dispose();
      this.envRT = this.pmrem.fromScene(this.skyScene);
      this.scene.environment = this.envRT.texture;
      this.scene.environmentIntensity = 0.25 + 0.55 * day01;
    }, 60);
    const season = this.currentSeason();
    if (season !== this._season) { this._season = season; applySeason(season); this.site.applyCanopySeason(season); this.ui?.syncSeason?.(); }
  }

  // ------------------------------------------------------------------ selection
  select(sel) {
    this.selection = sel;
    if (this.site && sel?.kind !== 'hardscape' && this.selectedHardscapeId) { this.selectedHardscapeId = null; this.site.redrawGround(); }
    if (sel?.kind === 'hardscape') { this.selectedHardscapeId = sel.id; this.site.redrawGround(); }
    this.editor?.refreshHandles();
    this.ui?.refreshInspector();
    this.editor?.updateSelectionBox();
  }
  findItem(id) { return this.state.items.find((i) => i.id === id); }
  findWall(id) { return this.state.house.walls.find((w) => w.id === id); }
  findOpening(id) { return this.state.house.openings.find((o) => o.id === id); }
  findRoom(id) { return this.state.house.rooms.find((r) => r.id === id); }
  findHardscape(id) { return this.state.hardscape.find((h) => h.id === id); }
  findFence(id) { return this.state.fences.find((f) => f.id === id); }

  deleteSelection() {
    const s = this.selection;
    if (!s) return;
    const H = this.state.house;
    const ops = {
      item: () => this.mutate((st) => { st.items = st.items.filter((i) => i.id !== s.id); }, 'items'),
      wall: () => this.mutate((st) => { st.house.walls = H.walls.filter((w) => w.id !== s.id); st.house.openings = H.openings.filter((o) => o.wall !== s.id); }, 'house'),
      opening: () => this.mutate((st) => { st.house.openings = H.openings.filter((o) => o.id !== s.id); }, 'house'),
      room: () => this.mutate((st) => { st.house.rooms = H.rooms.filter((r) => r.id !== s.id); }, 'house'),
      hardscape: () => this.mutate((st) => { st.hardscape = st.hardscape.filter((h) => h.id !== s.id); }, 'ground'),
      fence: () => this.mutate((st) => { st.fences = st.fences.filter((f) => f.id !== s.id); }, 'fences'),
    };
    if (ops[s.kind]) { ops[s.kind](); this.select(null); this.ui.toast('Deleted'); }
  }
  duplicateSelection() {
    const s = this.selection;
    if (s?.kind !== 'item') return;
    const it = this.findItem(s.id);
    const copy = { ...deepClone(it), id: uid('it'), x: it.x + 2, y: it.y + 2, existing: false };
    if (copy.age === null && CATALOG[copy.type]?.plant) copy.age = 0;
    this.mutate((st) => st.items.push(copy), 'items');
    this.select({ kind: 'item', id: copy.id });
  }

  // ------------------------------------------------------------------ analysis
  stats() {
    const H = this.state.house;
    const per = {};
    for (const lv of H.levels) per[lv.id] = { name: lv.name, fin: 0, unf: 0 };
    for (const r of H.rooms) {
      const a = Math.abs(polyArea(r.pts));
      if (!per[r.lv]) continue;
      if (r.finished === false) per[r.lv].unf += a; else per[r.lv].fin += a;
    }
    let imperv = 0;
    const pervious = new Set(['mulch', 'flowers', 'dirt', 'grass', 'meadow', 'gravel']);
    for (const h of this.state.hardscape) if (!pervious.has(h.mat)) imperv += hardscapeArea(h);
    const roofFoot = 38.5 * 48.85 - 14.5 * 11.8 - 9.33 * 18.35 + 13 * 22 + G_AREA(H.garage);
    return { per, imperv: imperv + roofFoot, lotAc: this.site.parcelAcres, lotSf: this.site.parcelAcres * 43560 };
  }

  estimate() {
    const lines = [];
    const B = this.baseline, S = this.state;
    const add = (cat, what, qty, unit, cost) => { if (cost > 0.5) lines.push({ cat, what, qty, unit, cost }); };
    const bRooms = new Map(B.house.rooms.map((r) => [r.id, r]));
    for (const r of S.house.rooms) {
      const a = Math.abs(polyArea(r.pts));
      const b = bRooms.get(r.id);
      if (!b || b.floor !== r.floor) add('Interior', `${FLOORS[r.floor]?.name || r.floor} – ${r.name}`, a, 'sf', a * (FLOORS[r.floor]?.cost || 0) * 1.25);
      if (b && (b.wallColor || null) !== (r.wallColor || null)) add('Interior', `Paint – ${r.name}`, a * 3.2, 'sf', a * 3.2 * 2.2);
    }
    const bWalls = new Map(B.house.walls.map((w) => [w.id, w]));
    const sWalls = new Set(S.house.walls.map((w) => w.id));
    for (const w of S.house.walls) {
      const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
      const b = bWalls.get(w.id);
      if (!b) add('Structure', `New ${w.ext ? 'exterior' : 'partition'} wall`, L, 'lf', L * (w.ext ? 420 : 165));
      else if (Math.hypot(b.a[0] - w.a[0], b.a[1] - w.a[1]) + Math.hypot(b.b[0] - w.b[0], b.b[1] - w.b[1]) > 0.2) add('Structure', 'Relocated wall', L, 'lf', L * 210);
    }
    for (const w of B.house.walls) if (!sWalls.has(w.id)) { const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]); add('Structure', `Remove ${w.ext ? 'exterior (needs engineer!)' : 'wall'}`, L, 'lf', L * (w.ext ? 900 : 120)); }
    const bOps = new Set(B.house.openings.map((o) => o.id));
    const oCost = { window: 1400, slider: 3800, door: 950, extdoor: 3200, opening: 1800, garage: 2600 };
    for (const o of S.house.openings) if (!bOps.has(o.id)) add('Structure', `New ${o.kind}`, 1, 'ea', oCost[o.kind] || 1000);
    const extWallArea = S.house.walls.filter((w) => w.ext === 'brick').reduce((a, w) => a + Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) * 9, 0);
    if (S.finish.brick !== B.finish.brick) add('Exterior', EXTERIORS[S.finish.brick].name, extWallArea, 'sf', extWallArea * EXTERIORS[S.finish.brick].cost);
    if (S.finish.siding !== B.finish.siding) add('Exterior', EXTERIORS[S.finish.siding].name, 520, 'sf', 520 * EXTERIORS[S.finish.siding].cost);
    const roofArea = 3100;
    if (S.finish.roof !== B.finish.roof) add('Exterior', `Re-roof: ${ROOFS[S.finish.roof].name}`, roofArea, 'sf', roofArea * ROOFS[S.finish.roof].cost);
    if (S.finish.trim !== B.finish.trim || S.finish.door !== B.finish.door) add('Exterior', 'Trim / door paint', 1, 'ls', 2800);
    const byType = new Map();
    for (const it of S.items) {
      if (it.existing) continue;
      const c = CATALOG[it.type];
      if (!c) continue;
      const cat = c.outdoor ? (c.plant ? 'Plantings' : 'Outdoor') : 'Furnishings';
      const k = cat + '|' + c.name;
      const e = byType.get(k) || { cat, name: c.name, n: 0, cost: c.cost };
      e.n++;
      byType.set(k, e);
    }
    for (const e of byType.values()) add(e.cat, e.name, e.n, 'ea', e.n * e.cost * (e.cat === 'Plantings' ? 1.6 : 1));
    const bHs = new Map(B.hardscape.map((h) => [h.id, h]));
    for (const h of S.hardscape) {
      const b = bHs.get(h.id);
      if (!b || b.mat !== h.mat || JSON.stringify(b.pts) !== JSON.stringify(h.pts) || b.width !== h.width) {
        const a = hardscapeArea(h);
        add('Hardscape', `${MATERIALS_GROUND[h.mat]?.name || h.mat} – ${h.name || h.kind}`, a, 'sf', a * (MATERIALS_GROUND[h.mat]?.cost || 5));
      }
    }
    for (const f of S.fences) { const L = polylineLength(f.pts); add('Hardscape', FENCES[f.type].name, L, 'lf', L * FENCES[f.type].cost); }
    const { cut, fill } = this.site.cutFillVolume();
    if (cut + fill > 1) add('Sitework', `Grading (cut ${cut.toFixed(0)} / fill ${fill.toFixed(0)} cy)`, cut + fill, 'cy', (cut + fill) * 48 + 1500);
    const cleared = (S.clearedCanopy || []).length;
    if (cleared) add('Sitework', 'Tree removal (woods)', cleared, 'ea', cleared * 950);
    const sub = lines.reduce((a, l) => a + l.cost, 0);
    return { lines, sub, contingency: sub * 0.15, total: sub * 1.15 };
  }

  screenshot() {
    this.renderer.render(this.scene, this.camera);
    this.renderer.domElement.toBlob((b) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `935-al-smith-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.png`;
      a.click();
    });
  }

  // ------------------------------------------------------------------ designs
  async saveDesign(name) {
    this.state.name = name;
    await Store.put('design:' + name, { state: JSON.stringify({ ...this.state, sculpt: null }), sculpt: this.site.sculpt.slice(), paint: this.site.paintDataURL(), savedAt: Date.now() });
    this.ui.toast(`Saved “${name}”`);
  }
  async loadDesign(key) {
    const d = await Store.get(key);
    if (!d) return;
    await this.loadPayload(d);
    this.ui.toast(`Loaded “${this.state.name}”`);
  }
  async loadPayload(d) {
    this.pushUndo();
    const st = typeof d.state === 'string' ? JSON.parse(d.state) : d.state;
    const sculpt = d.sculpt ? Float32Array.from(d.sculpt) : new Float32Array(this.site.sculpt.length);
    this.state = st;
    this.site.state = st;
    this.site.sculpt.set(sculpt);
    for (let k = 0; k < this.site.nearH.length; k++) this.site.nearH[k] = this.site.nearBase[k] + sculpt[k];
    this.site.applyNearHeights();
    await this.site.loadPaint(d.paint || null);
    this.select(null);
    this.rebuildAll();
    this.ui.refresh();
    this.changed();
  }
  async resetToAsBuilt() {
    await this.loadPayload({ state: JSON.stringify(defaultState()), sculpt: null, paint: null });
    this.ui.toast('Reset to as-built');
  }
  exportDesign() {
    const payload = { format: 'home-designer-3d', version: 1, state: { ...this.state, sculpt: null }, sculpt: Array.from(this.site.sculpt, (v) => Math.round(v * 100) / 100), paint: this.site.paintDataURL() };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(this.state.name || 'design').replace(/[^\w-]+/g, '_')}.json`;
    a.click();
  }
  async importDesign(file) {
    const txt = await file.text();
    const d = JSON.parse(txt);
    if (d.format !== 'home-designer-3d') throw new Error('Not a design file');
    await this.loadPayload(d);
    this.ui.toast('Imported design');
  }
}

function G_AREA(g) { return g.w * g.d; }

const app = new App();
window.app = app;
app.init().catch((e) => { console.error(e); const s = document.getElementById('status'); if (s) s.textContent = 'Failed to load: ' + e.message; });
