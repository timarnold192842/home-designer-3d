import * as THREE from 'three';
import { el, money, fmtArea, ftIn, polyArea, polylineLength, uid, deepClone, DEG, bearingStr } from './util.js';
import { CATALOG, CATEGORIES_INTERIOR, CATEGORIES_EXTERIOR, PLANT_STATE, plantSpec, plantHeight } from './catalog.js';
import { FLOORS, EXTERIORS, ROOFS, PAINTS } from './materials.js';
import { MATERIALS_GROUND, hardscapeArea, NEAR } from './site.js';
import { FENCES } from './fences.js';
import { FRAME, planToWorld, worldToLatLon } from './frame.js';
import { sunTimes, fmtHour } from './sun.js';
import { Store } from './store.js';
import { levelById } from './houseBuilder.js';
import { STAGING } from './staging.js';

const MODES = [['explore', 'Explore'], ['walk', 'Walk-through'], ['redesign', 'Redesign'], ['decorate', 'Decorate'], ['landscape', 'Landscape'], ['site', 'Site & Lot'], ['sun', 'Sun & Seasons']];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export class UI {
  constructor(app) {
    this.app = app;
    this.mode = 'explore';
    this.rtab = 'inspect';
    this.catFilter = { interior: 'Living', exterior: 'Trees', q: '' };
  }

  // ------------------------------------------------------------------ chrome
  status(t) { const s = document.getElementById('status'); if (s) s.textContent = t; const l = document.getElementById('loadmsg'); if (l && !document.body.classList.contains('ready')) l.textContent = t; }
  hint(t) { document.getElementById('hint').textContent = t || ''; }
  readout(html) { document.getElementById('readout').innerHTML = html; }
  toast(t) { const d = el('div', { class: 'toast' }, t); document.getElementById('toasts').append(d); setTimeout(() => d.remove(), 2500); }
  modal(title, ...body) {
    const m = document.getElementById('modal');
    const b = document.getElementById('modal-body');
    b.innerHTML = '';
    b.append(el('h2', {}, title), ...body);
    m.hidden = false;
  }

  build() {
    const app = this.app;
    const nav = document.getElementById('modes');
    for (const [id, label] of MODES) nav.append(el('button', { 'data-mode': id, onclick: () => this.setMode(id) }, label));
    document.getElementById('btn-undo').onclick = () => app.undo();
    document.getElementById('btn-redo').onclick = () => app.redo();
    document.getElementById('btn-shot').onclick = () => app.screenshot();
    document.getElementById('btn-help').onclick = () => this.help();
    document.getElementById('modal-close').onclick = () => (document.getElementById('modal').hidden = true);
    document.getElementById('modal').onclick = (e) => { if (e.target.id === 'modal') e.target.hidden = true; };
    const lb = document.getElementById('levelbar');
    const levels = [['all', 'All', 'house'], ...app.state.house.levels.slice().reverse().map((l) => [l.id, l.short, l.name.replace(' Floor', '')])];
    for (const [id, s, name] of levels) lb.append(el('button', { 'data-lv': id, title: name, onclick: () => app.setLevel(id) }, s, el('small', {}, name.split(' ')[0])));
    const vb = document.getElementById('viewbar');
    for (const [id, label] of [['aerial', 'Aerial'], ['parcel', 'Whole lot'], ['house', 'House'], ['plan', 'Plan 2D'], ['east', 'E'], ['south', 'S'], ['west', 'W'], ['north', 'N'], ['yard', 'Yard'], ['garage', 'Garage']]) {
      vb.append(el('button', { 'data-view': id, onclick: () => (id === 'plan' ? app.setPlan2D(!app.view.plan2D) : app.setPreset(id)) }, label));
    }
    const rt = document.getElementById('rtabs');
    for (const [id, label] of [['inspect', 'Inspector'], ['estimate', 'Estimate'], ['designs', 'Designs']]) rt.append(el('button', { 'data-tab': id, onclick: () => this.setTab(id) }, label));
    this.setMode('explore');
    this.setTab('inspect');
    this.syncLevel();
    this.updateUndo();
  }
  refresh() { this.setMode(this.mode); this.setTab(this.rtab); this.syncLevel(); }
  updateUndo() {
    document.getElementById('btn-undo').disabled = !this.app.undoStack.length;
    document.getElementById('btn-redo').disabled = !this.app.redoStack.length;
  }
  syncLevel() { document.querySelectorAll('#levelbar button').forEach((b) => b.classList.toggle('on', b.dataset.lv === this.app.view.level)); this.syncViewButtons(); }
  syncViewButtons() { document.querySelectorAll('#viewbar button').forEach((b) => b.classList.toggle('on', b.dataset.view === 'plan' && this.app.view.plan2D)); }
  tickCompass() {
    const cam = this.app.camera;
    const d = new THREE.Vector3(); cam.getWorldDirection(d);
    let ang;
    if (this.app.view.plan2D) ang = -FRAME.rotDeg;
    else ang = Math.atan2(d.x, -d.z) / DEG;
    if (Math.abs(ang - (this._cang ?? 999)) > 0.3) { this._cang = ang; document.querySelector('#compass svg').style.transform = `rotate(${-ang}deg)`; }
  }
  onWalk(on) {
    document.getElementById('walkhud').hidden = !on;
    document.getElementById('hint').style.visibility = on ? 'hidden' : '';
    if (!on && this.mode === 'walk') this.setMode('walk');
  }

  setMode(m) {
    const app = this.app;
    this.mode = m;
    document.querySelectorAll('#modes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
    const L = document.getElementById('left');
    L.innerHTML = '';
    if (!['redesign', 'decorate', 'landscape'].includes(m) && app.editor.tool !== 'select') app.editor.setTool('select');
    app.site.parcelEdgeLabels.visible = m === 'site';
    L.append(...this['panel_' + m]().filter(Boolean));
    if (m === 'select') this.hint('');
    else if (app.editor.tool === 'select') this.hint(app.editor.hintFor('select'));
  }
  setTab(t) {
    this.rtab = t;
    document.querySelectorAll('#rtabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    const P = document.getElementById('rpanel');
    P.innerHTML = '';
    if (t === 'inspect') P.append(...this.inspector().filter(Boolean));
    if (t === 'estimate') P.append(...this.estimatePanel().filter(Boolean));
    if (t === 'designs') this.designsPanel().then((els) => { if (this.rtab === 'designs') { P.innerHTML = ''; P.append(...els); } });
  }
  refreshInspector() { if (this.rtab === 'inspect') this.setTab('inspect'); }
  refreshEstimate() { if (this.rtab === 'estimate') this.setTab('estimate'); }
  refreshStats() { const s = document.getElementById('stats-card'); if (s) s.replaceWith(this.statsCard()); }

  // ------------------------------------------------------------------ widgets
  toggle(label, get, set, title) {
    const i = el('input', { type: 'checkbox' });
    i.checked = !!get();
    i.onchange = () => set(i.checked);
    return el('label', { class: 'toggle', title: title || '' }, el('span', {}, label), i);
  }
  range(label, min, max, step, get, set, fmt = (v) => v, live = true) {
    const i = el('input', { type: 'range', min, max, step });
    i.value = get();
    const o = el('output', {}, fmt(+i.value));
    i.oninput = () => { o.textContent = fmt(+i.value); if (live) set(+i.value); };
    i.onchange = () => { if (!live) set(+i.value); };
    const r = el('div', { class: 'row' }, el('label', {}, label), i, o);
    r.input = i; r.out = o;
    return r;
  }
  select(label, options, get, set) {
    const s = el('select', {});
    for (const [v, t] of options) { const o = el('option', { value: v }, t); if (String(v) === String(get())) o.selected = true; s.append(o); }
    s.onchange = () => set(s.value);
    return el('div', { class: 'row' }, el('label', {}, label), s);
  }
  num(label, get, set, step = 0.1, unit = 'ft') {
    const i = el('input', { type: 'number', step });
    i.value = +(+get()).toFixed(2);
    i.onchange = () => set(+i.value);
    return el('div', { class: 'row' }, el('label', {}, label), i, el('span', { class: 'muted small' }, unit));
  }
  text(label, get, set) {
    const i = el('input', { type: 'text' });
    i.value = get() || '';
    i.onchange = () => set(i.value);
    return el('div', { class: 'row' }, el('label', {}, label), i);
  }
  swatches(colors, get, set) {
    const wrap = el('div', { class: 'swatches' });
    for (const c of colors) wrap.append(el('div', { class: 'sw' + (get() === c ? ' on' : ''), style: `background:${c}`, title: c, onclick: () => set(c) }));
    const pick = el('input', { type: 'color', value: get() || '#ffffff', style: 'width:26px;height:24px;padding:0;border:0;background:none' });
    pick.onchange = () => set(pick.value);
    wrap.append(pick);
    return wrap;
  }
  tools(list) {
    const ed = this.app.editor;
    const g = el('div', { class: 'grid3' });
    for (const [id, label, icon, opts] of list) {
      const b = el('button', { class: 'tool' + (ed.tool === id ? ' on' : ''), 'data-tool': id, onclick: () => { ed.setTool(ed.tool === id && id !== 'select' ? 'select' : id, opts || {}); this.setMode(this.mode); } }, el('span', { class: 'ic' }, icon), label);
      g.append(b);
    }
    return g;
  }
  syncTool() { document.querySelectorAll('.tool[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === this.app.editor.tool)); }
  levelSelect() {
    const app = this.app, ed = app.editor;
    return this.select('Active level', app.state.house.levels.map((l) => [l.id, l.name]), () => ed.activeLevel, (v) => { ed.activeLevel = v; if (app.view.level !== 'all') app.setLevel(v); });
  }

  // ------------------------------------------------------------------ panels
  panel_explore() {
    const app = this.app, v = app.view;
    const set = (k) => (val) => { v[k] = val; app.applyView(); };
    return [
      el('h3', {}, 'Camera'),
      el('div', { class: 'grid3' },
        ...[['aerial', 'Aerial'], ['parcel', 'Whole lot'], ['house', 'House'], ['east', 'East'], ['south', 'South'], ['west', 'West'], ['north', 'North'], ['yard', 'Back yard'], ['garage', 'Garage']].map(([id, l]) => el('button', { class: 'btn small', onclick: () => app.setPreset(id) }, l))),
      el('div', { class: 'row' }, el('button', { class: 'btn', onclick: () => app.setPlan2D(!app.view.plan2D) }, 'Toggle 2D plan view (P)')),
      el('h3', {}, 'Display'),
      el('div', { class: 'card' },
        this.toggle('Roofs', () => v.roof, set('roof')),
        this.toggle('Room labels (per level)', () => v.labels, set('labels')),
        this.toggle('X-ray walls', () => v.xray, set('xray')),
        this.toggle('Furniture & fixtures', () => v.furniture, set('furniture')),
        this.toggle('Ceilings', () => v.ceilings, set('ceilings')),
        this.toggle('Sun shadows', () => v.shadows, set('shadows')),
        this.range('Cutaway at', 2, 8.5, 0.1, () => v.cutH, (x) => { v.cutH = x; app.applyView(); }, (x) => `${x.toFixed(1)} ft`),
        el('div', { class: 'muted small' }, 'Pick a level on the right edge of the viewport to cut the house open (like a dollhouse).'),
      ),
      el('h3', {}, 'This house'),
      this.statsCard(),
      el('div', { class: 'card small muted' },
        'Model built from the iGUIDE scan (May 4 2026). Placed on real terrain (Allegheny County 2-ft contours), the county parcel (6.61 ac), OpenStreetMap footprints and USGS NAIP imagery. Dimensions are approximate — verify before building.'),
    ];
  }
  statsCard() {
    const s = this.app.stats();
    const rows = [];
    let tf = 0, tu = 0;
    for (const p of Object.values(s.per)) { rows.push(el('span', {}, p.name), el('span', {}, `${fmtArea(p.fin)}${p.unf ? ` + ${fmtArea(p.unf)} unf.` : ''}`)); tf += p.fin; tu += p.unf; }
    rows.push(el('span', {}, 'Total rooms'), el('span', {}, `${fmtArea(tf + tu)}`));
    rows.push(el('span', {}, 'Scan gross (iGUIDE)'), el('span', {}, '4,202 sf incl. garage'));
    rows.push(el('span', {}, 'Lot'), el('span', {}, `${s.lotAc.toFixed(2)} ac (${Math.round(s.lotSf).toLocaleString()} sf)`));
    rows.push(el('span', {}, 'Impervious (est.)'), el('span', {}, `${fmtArea(s.imperv)} · ${((s.imperv / s.lotSf) * 100).toFixed(1)}%`));
    rows.push(el('span', {}, 'Main floor elev.'), el('span', {}, `${FRAME.mainFloorASL.toFixed(1)} ft ASL`));
    return el('div', { class: 'card kv', id: 'stats-card' }, ...rows);
  }

  panel_walk() {
    const app = this.app;
    const b = (id, l) => el('button', { class: 'btn', onclick: () => app.startWalk(id) }, l);
    return [
      el('h3', {}, 'Start walking from'),
      el('div', { class: 'grid2' }, b('front', 'Front porch'), b('great', 'Great room'), b('upper', '2nd floor'), b('bsmt', 'Basement rec room'), b('yard', 'Back yard'), b('drive', 'Driveway')),
      el('h3', {}, 'Controls'),
      el('div', { class: 'card small' },
        el('div', {}, 'Mouse — look around (click the view to capture the pointer)'),
        el('div', {}, 'W A S D / arrows — walk · Shift — run'),
        el('div', {}, 'Space — jump · F — fly mode (Space / C to rise / sink)'),
        el('div', {}, 'Esc — exit walk mode'),
        el('div', { class: 'muted' }, 'Stairs, porch, patios and terrain are walkable. Walls block you; doorways are open.')),
      el('div', { class: 'card small muted' }, 'Tip: set the time in “Sun & Seasons” first — walking through at golden hour or at night (warm windows) is a good way to judge light in each room.'),
    ];
  }

  panel_redesign() {
    const app = this.app, ed = app.editor, F = app.state.finish;
    const setF = (k) => (v) => { app.mutate((st) => { st.finish[k] = v; }, 'house'); this.setMode('redesign'); };
    return [
      el('h3', {}, 'Tools'),
      this.tools([['select', 'Select / move', '⇱'], ['wall', 'Draw wall', '▭'], ['room', 'Draw room', '⬠'], ['door', 'Add door', '⌷'], ['window', 'Add window', '⊞'], ['opening', 'Wide opening', '⊓'], ['measure', 'Measure', '↔']]),
      el('div', { class: 'card' },
        this.levelSelect(),
        this.select('Wall thickness', [[0.4, '4.5" partition'], [0.5, '6" (2×6)'], [0.9, '11" brick'], [1.2, '14" block']], () => ed.wallT, (v) => (ed.wallT = +v)),
        this.select('New wall face', [['', 'Interior (paint)'], ['brick', 'Exterior – brick'], ['siding', 'Exterior – siding'], ['block', 'Exterior – block']], () => ed.wallExt || '', (v) => (ed.wallExt = v || false)),
        this.select('Snap', [[0.0833, '1 in'], [0.25, '3 in'], [0.5, '6 in'], [1, '1 ft']], () => ed.snap, (v) => (ed.snap = +v)),
        el('div', { class: 'muted small' }, 'Select a wall to drag its endpoints (connected walls follow). Select a room to reshape its floor.')),
      el('h3', {}, 'Exterior finishes'),
      el('div', { class: 'card' },
        this.select('Brick walls', Object.entries(EXTERIORS).filter(([k]) => k !== 'block').map(([k, e]) => [k, e.name]), () => F.brick, setF('brick')),
        this.select('Siding areas', Object.entries(EXTERIORS).filter(([k]) => k !== 'block').map(([k, e]) => [k, e.name]), () => F.siding, setF('siding')),
        this.select('Roof', Object.entries(ROOFS).map(([k, r]) => [k, r.name]), () => F.roof, setF('roof')),
        el('div', { class: 'row' }, el('label', {}, 'Trim'), this.swatches(['#f4f3ef', '#ffffff', '#e4ddd0', '#2b2c2e', '#3d4a3f', '#56687a', '#6e3c3c'], () => F.trim, setF('trim'))),
        el('div', { class: 'row' }, el('label', {}, 'Doors'), this.swatches(['#34475e', '#2b2c2e', '#6e3c3c', '#3d6a4a', '#b5835a', '#f4f3ef', '#c9a13a'], () => F.door, setF('door')))),
      el('h3', {}, 'Ideas'),
      el('div', { class: 'card small' },
        el('div', { class: 'muted' }, 'The great room is gutted (posts on the old bearing line at 30.6′). Try: select walls around the laundry/hall and delete them, draw an island wall, or open the west wing (old kitchen) fully.'),
        el('div', { class: 'row' }, el('button', { class: 'btn small', onclick: () => { app.setLevel('main'); app.setPlan2D(true); } }, 'Main floor plan'), el('button', { class: 'btn small', onclick: () => { app.setLevel('upper'); app.setPlan2D(true); } }, '2nd floor plan'))),
      el('div', { class: 'row' }, el('button', { class: 'btn danger', onclick: () => { if (confirm('Reset walls, rooms, doors and finishes to the as-built scan? (Furniture/landscape kept)')) app.mutate((st) => { const d = deepClone(app.baseline); st.house = d.house; st.finish = d.finish; }, 'house'); } }, 'Reset house to as-built')),
    ];
  }

  catalogGrid(cats, key, outdoor) {
    const app = this.app, ed = app.editor;
    const wrap = el('div', {});
    const chips = el('div', { class: 'chips' });
    const grid = el('div', { class: 'catalog' });
    const draw = () => {
      chips.innerHTML = ''; grid.innerHTML = '';
      for (const c of cats) chips.append(el('span', { class: 'chip' + (this.catFilter[key] === c ? ' on' : ''), onclick: () => { this.catFilter[key] = c; this.catFilter.q = ''; search.value = ''; draw(); } }, c));
      const q = this.catFilter.q.toLowerCase();
      const items = Object.values(CATALOG).filter((c) => (q ? c.name.toLowerCase().includes(q) && cats.includes(c.cat) : c.cat === this.catFilter[key]));
      for (const c of items) {
        const b = el('button', { class: 'cat-item' + (ed.tool === 'place' && ed.placeType === c.type ? ' on' : ''), onclick: () => { ed.setTool('place', { placeType: c.type, placeRot: 0 }); draw(); this.syncTool(); } },
          el('b', {}, c.name), el('small', {}, `${ftIn(c.dims[0])} × ${ftIn(c.dims[1])}${c.plant ? ` · ${c.dims[2]}′ mature` : ''} · ${money(c.cost)}`));
        grid.append(b);
      }
    };
    const search = el('input', { type: 'text', placeholder: 'Search catalog…', style: 'width:100%;background:#11181e;border:1px solid var(--line);border-radius:6px;padding:6px 8px' });
    search.oninput = () => { this.catFilter.q = search.value; draw(); };
    wrap.append(search, chips, grid);
    draw();
    void outdoor;
    return wrap;
  }

  panel_decorate() {
    const app = this.app;
    return [
      el('h3', {}, 'Furniture & fixtures'),
      el('div', { class: 'card' }, this.levelSelect(), el('div', { class: 'muted small' }, 'Pick an item, then click a floor to place it. Wall items snap to walls. Drag placed items to move; Q/E rotate.')),
      this.catalogGrid(CATEGORIES_INTERIOR, 'interior', false),
      el('h3', {}, 'Quick staging ideas'),
      el('div', { class: 'card' }, ...STAGING.filter((s) => !s.outdoor).map((s) => el('div', { class: 'design-row' }, el('div', { class: 'grow' }, el('b', {}, s.name), el('div', { class: 'muted small' }, s.desc)), el('button', { class: 'btn small', onclick: () => this.applyStaging(s) }, 'Add')))),
      el('div', { class: 'row' }, el('button', { class: 'btn danger small', onclick: () => { if (confirm('Remove all furniture you added (keeps as-built fixtures)?')) app.mutate((st) => { st.items = st.items.filter((i) => i.existing || CATALOG[i.type]?.outdoor); }, 'items'); } }, 'Remove added furniture')),
    ];
  }
  applyStaging(s) {
    const app = this.app;
    app.mutate((st) => { for (const it of s.items) st.items.push({ id: uid('it'), rot: 0, ...it, seed: Math.floor(Math.random() * 999), ...(CATALOG[it.type]?.plant ? { age: 0, ground: true } : {}) }); }, 'items');
    if (s.level) app.setLevel(s.level);
    this.toast(`Added: ${s.name}`);
  }

  panel_landscape() {
    const app = this.app, ed = app.editor, b = ed.brush;
    const opts = [];
    const t = ed.tool;
    if (t === 'hardscape' || t === 'path') {
      opts.push(this.select('Material', Object.entries(MATERIALS_GROUND).map(([k, m]) => [k, `${m.name} (${money(m.cost)}/sf)`]), () => ed.hsMat, (v) => (ed.hsMat = v)));
      if (t === 'path') opts.push(this.range('Width', 2, 16, 0.5, () => ed.pathW, (v) => (ed.pathW = v), (v) => `${v} ft`));
    }
    if (t === 'fence') opts.push(this.select('Type', Object.entries(FENCES).map(([k, f]) => [k, `${f.name} (${money(f.cost)}/lf)`]), () => ed.fenceType, (v) => (ed.fenceType = v)));
    if (t === 'paint') {
      opts.push(this.select('Paint', Object.entries(MATERIALS_GROUND).map(([k, m]) => [k, m.name]), () => b.mat, (v) => (b.mat = v)));
      opts.push(this.toggle('Eraser (or hold Alt)', () => b.erase, (v) => (b.erase = v)));
      opts.push(this.range('Brush radius', 1, 30, 0.5, () => b.r, (v) => (b.r = v), (v) => `${v} ft`));
      opts.push(el('button', { class: 'btn small', onclick: () => { if (confirm('Clear all painted ground?')) { app.site.clearPaint(); app.changed(); } } }, 'Clear all paint'));
    }
    if (t === 'sculpt') {
      opts.push(this.select('Mode', [['raise', 'Raise (Alt = lower)'], ['lower', 'Lower / dig'], ['flatten', 'Flatten to click height'], ['smooth', 'Smooth']], () => b.mode, (v) => (b.mode = v)));
      opts.push(this.range('Brush radius', 2, 40, 1, () => b.r, (v) => (b.r = v), (v) => `${v} ft`));
      opts.push(this.range('Strength', 0.05, 1.5, 0.05, () => b.strength, (v) => (b.strength = v), (v) => v.toFixed(2)));
      const cf = app.site.cutFillVolume();
      opts.push(el('div', { class: 'muted small' }, `Earthwork so far: cut ${cf.cut.toFixed(0)} cy · fill ${cf.fill.toFixed(0)} cy`));
      opts.push(el('button', { class: 'btn small danger', onclick: () => { if (confirm('Reset all terrain sculpting?')) { app.pushUndo(); app.site.resetSculpt(); app.rebuild('terrain'); app.changed(); } } }, 'Reset terrain'));
    }
    if (t === 'clear') {
      opts.push(this.range('Brush radius', 2, 20, 1, () => b.r, (v) => (b.r = v), (v) => `${v * 3} ft`));
      opts.push(el('div', { class: 'muted small' }, `${(app.state.clearedCanopy || []).length} trees cleared`));
      opts.push(el('button', { class: 'btn small', onclick: () => app.mutate((st) => { st.clearedCanopy = []; }, 'canopy') }, 'Restore all woods'));
    }
    return [
      el('h3', {}, 'Tools'),
      this.tools([['select', 'Select / move', '⇱'], ['place', 'Plant / place', '♣'], ['hardscape', 'Patio / bed', '⬠'], ['path', 'Path / drive', '〰'], ['fence', 'Fence / wall', '⋕'], ['paint', 'Paint ground', '✎'], ['sculpt', 'Sculpt terrain', '△'], ['clear', 'Clear woods', '✕'], ['measure', 'Measure', '↔']]),
      opts.length ? el('div', { class: 'card' }, ...opts) : null,
      el('h3', {}, 'Time & season'),
      el('div', { class: 'card' },
        this.range('Years from now', 0, 30, 1, () => PLANT_STATE.years, (v) => { PLANT_STATE.years = v; app.buildItems(); app.collectPickables(); }, (v) => (v ? `+${v} yr` : 'today')),
        this.select('Season', [['auto', 'Auto (from date)'], ['spring', 'Spring'], ['summer', 'Summer'], ['fall', 'Fall'], ['winter', 'Winter']], () => (app.sunState.seasonAuto ? 'auto' : app.sunState.season), (v) => { app.sunState.seasonAuto = v === 'auto'; app.sunState.season = v === 'auto' ? null : v; app.applySun(); }),
        el('div', { class: 'muted small' }, 'New plantings start at nursery size and grow toward mature height; existing trees stay as they are.')),
      el('h3', {}, 'Plants & outdoor catalog'),
      this.catalogGrid(CATEGORIES_EXTERIOR, 'exterior', true),
      el('h3', {}, 'Landscape ideas'),
      el('div', { class: 'card' }, ...STAGING.filter((s) => s.outdoor).map((s) => el('div', { class: 'design-row' }, el('div', { class: 'grow' }, el('b', {}, s.name), el('div', { class: 'muted small' }, s.desc)), el('button', { class: 'btn small', onclick: () => this.applyStaging(s) }, 'Add')))),
    ];
  }

  panel_site() {
    const app = this.app, site = app.site, L = site.layers;
    const lay = (k, label) => this.toggle(label, () => L[k].visible, (v) => { L[k].visible = v; });
    const heatBox = el('div', {});
    const drawHeat = () => {
      heatBox.innerHTML = '';
      if (site.overlayMode === 'sun') {
        const prog = el('div', { class: 'progress' }, el('div', {}));
        const ss = app.sunState;
        const go = el('button', { class: 'btn primary small', onclick: async () => { go.disabled = true; const h = await app.heat.compute(2026, ss.month, ss.day, (f) => (prog.firstChild.style.width = `${f * 100}%`)); prog.firstChild.style.width = '100%'; go.disabled = false; info.textContent = `${MONTHS[ss.month]} ${ss.day}: ${h.toFixed(1)} h of sun above 2°. Hover the map to read hours at any spot (6+ h = full sun).`; const t = Math.max(8, h); legendLabels.innerHTML = ''; legendLabels.append(...[0, 0.25, 0.5, 0.75, 1].map((f) => el('span', {}, `${(t * f).toFixed(0)} h`))); } }, `Compute for ${MONTHS[ss.month]} ${ss.day}`);
        const legendLabels = el('div', { class: 'legend-labels' }, el('span', {}, '0 h'), el('span', {}, 'day length →'));
        const info = el('div', { class: 'muted small' }, 'Uses the current date from Sun & Seasons. Includes shadows from the house, garage, your plantings, structures and the surrounding woods.');
        heatBox.append(el('div', { class: 'row' }, go, el('button', { class: 'btn small', onclick: () => { app.sunState.month = 5; app.sunState.day = 21; app.applySun(); drawHeat(); } }, 'Jun 21'), el('button', { class: 'btn small', onclick: () => { app.sunState.month = 2; app.sunState.day = 20; app.applySun(); drawHeat(); } }, 'Mar 20')), prog, info,
          el('div', { class: 'legend', style: 'background:linear-gradient(90deg,#2e3390,#3399d9,#59cc59,#fad940,#f25a26)' }), legendLabels);
      } else if (site.overlayMode === 'slope') {
        heatBox.append(el('div', { class: 'legend', style: 'background:linear-gradient(90deg,#3caa50 0 20%,#aad246 20% 40%,#f5c83c 40% 60%,#f08228 60% 80%,#d23228 80%)' }), el('div', { class: 'legend-labels' }, el('span', {}, '<5%'), el('span', {}, '10%'), el('span', {}, '15%'), el('span', {}, '25%'), el('span', {}, 'steeper')));
      } else if (site.overlayMode === 'elevation' && site.overlayRange) {
        const [lo, hi] = site.overlayRange.map((v) => v + FRAME.mainFloorASL);
        heatBox.append(el('div', { class: 'legend', style: 'background:linear-gradient(90deg,hsl(238,75%,50%),hsl(180,75%,50%),hsl(120,75%,50%),hsl(60,75%,50%),hsl(0,75%,50%))' }), el('div', { class: 'legend-labels' }, el('span', {}, `${lo.toFixed(0)}′`), el('span', {}, `${((lo + hi) / 2).toFixed(0)}′`), el('span', {}, `${hi.toFixed(0)}′`)));
      }
    };
    const overlaySel = this.select('Overlay', [['none', 'None'], ['slope', 'Slope %'], ['elevation', 'Elevation bands'], ['sun', 'Sun hours (daily)']], () => site.overlayMode || 'none', (v) => {
      if (v === 'sun') { site.setOverlay('none'); site.overlayMode = 'sun'; } else { app.heat.hide(); site.setOverlay(v); }
      drawHeat();
    });
    drawHeat();
    const p = site.parcel;
    let per = 0; for (let i = 0; i < p.length - 1; i++) per += Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
    const elevs = this.parcelElevRange();
    return [
      el('h3', {}, 'Layers'),
      el('div', { class: 'card' },
        this.toggle('Aerial photo on ground (vs. designed)', () => app.state.view.groundMode === 'aerial', (v) => { app.state.view.groundMode = v ? 'aerial' : 'designed'; site.redrawGround(); app.changed(); }),
        lay('parcel', 'Parcel boundary + bearings'), lay('neighbors', 'Neighboring parcels'), lay('contours', 'Contours (2 ft)'), lay('easements', 'Easements (from survey)'),
        this.toggle('Woods (from imagery)', () => app.view.woods !== false, (v) => { app.view.woods = v; app.applyView(); }),
        lay('buildings', 'Neighbor buildings'), lay('roadLabels', 'Road names')),
      el('h3', {}, 'Analysis'),
      el('div', { class: 'card' }, overlaySel, heatBox),
      el('h3', {}, 'Parcel 0110-M-00207'),
      el('div', { class: 'card kv' },
        el('span', {}, 'Area (GIS)'), el('span', {}, `${site.parcelAcres.toFixed(2)} ac`),
        el('span', {}, 'Perimeter'), el('span', {}, `${per.toFixed(0)} ft`),
        el('span', {}, 'East line'), el('span', {}, `980.7′ (survey 979.67′)`),
        el('span', {}, 'Ground in parcel'), el('span', {}, `${elevs[0].toFixed(0)}–${elevs[1].toFixed(0)} ft ASL`),
        el('span', {}, 'Relief'), el('span', {}, `${(elevs[1] - elevs[0]).toFixed(0)} ft`),
        el('span', {}, 'House (lat, lon)'), el('span', {}, `${FRAME.lat0.toFixed(5)}, ${FRAME.lon0.toFixed(5)}`),
        el('span', {}, 'Municipality'), el('span', {}, 'Kennedy Twp. (919)')),
      el('div', { class: 'card small muted' }, 'Easement bands are hand-digitized from the red-lined survey and are approximate. Bearings are from county GIS (grid north) and differ ~2° from the survey basis of bearings.'),
    ];
  }
  parcelElevRange() {
    if (this._per) return this._per;
    const site = this.app.site;
    let lo = Infinity, hi = -Infinity;
    const xs = site.parcel.map((p) => p[0]), zs = site.parcel.map((p) => p[1]);
    for (let x = Math.min(...xs); x < Math.max(...xs); x += 10) for (let z = Math.min(...zs); z < Math.max(...zs); z += 10) {
      if (!site.inParcel(x, z)) continue;
      const h = site.natural(x, z) + FRAME.mainFloorASL;
      lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    return (this._per = [lo, hi]);
  }

  panel_sun() {
    const app = this.app, ss = app.sunState;
    const info = el('div', { class: 'card kv' });
    const upd = () => {
      const t = sunTimes(2026, ss.month, ss.day, FRAME.lat0, FRAME.lon0);
      const sp = app.sunPos;
      info.innerHTML = '';
      info.append(el('span', {}, 'Sun azimuth'), el('span', {}, `${sp.azimuth.toFixed(0)}° (${bearingStr(Math.sin(sp.azimuth * DEG), -Math.cos(sp.azimuth * DEG)).replace(/ \d+'/, '')})`),
        el('span', {}, 'Sun altitude'), el('span', {}, `${sp.elevation.toFixed(1)}°`),
        el('span', {}, 'Sunrise / sunset'), el('span', {}, `${fmtHour(t.rise)} / ${fmtHour(t.set)}`),
        el('span', {}, 'Daylight'), el('span', {}, t.rise && t.set ? `${(t.set - t.rise).toFixed(1)} h` : '—'),
        el('span', {}, 'Season (plants)'), el('span', {}, app.currentSeason()));
    };
    const time = this.range('Time', 4, 22, 0.05, () => ss.hour, (v) => { ss.hour = v; app.applySun(); upd(); }, (v) => fmtHour(v));
    this.syncSun = () => { time.input.value = ss.hour; time.out.textContent = fmtHour(ss.hour); upd(); };
    const dayR = this.range('Day', 1, 31, 1, () => ss.day, (v) => { ss.day = v; app.applySun(); upd(); }, (v) => v);
    const play = el('button', { class: 'btn primary', onclick: () => { ss.animate = !ss.animate; play.textContent = ss.animate ? 'Pause' : 'Play day'; } }, ss.animate ? 'Pause' : 'Play day');
    const quick = (l, m, d, h) => el('button', { class: 'btn small', onclick: () => { Object.assign(ss, { month: m, day: d, hour: h ?? ss.hour }); app.applySun(); this.setMode('sun'); } }, l);
    setTimeout(upd, 0);
    return [
      el('h3', {}, 'Date & time (Eastern)'),
      el('div', { class: 'card' },
        this.select('Month', MONTHS.map((m, i) => [i, m]), () => ss.month, (v) => { ss.month = +v; app.applySun(); upd(); }),
        dayR, time,
        el('div', { class: 'row' }, play),
        this.range('Speed', 0.2, 6, 0.2, () => ss.speed, (v) => (ss.speed = v), (v) => `${v.toFixed(1)}×`)),
      el('div', { class: 'grid2' }, quick('Winter solstice', 11, 21), quick('Spring equinox', 2, 20), quick('Summer solstice', 5, 21), quick('Fall equinox', 8, 22), quick('Golden hour (today)', ss.month, ss.day, 18.6), quick('Night', ss.month, ss.day, 21.5)),
      el('h3', {}, 'Sun'),
      info,
      el('div', { class: 'card' },
        this.toggle('Shadows', () => app.view.shadows, (v) => { app.view.shadows = v; app.applyView(); }),
        this.select('Plant season', [['auto', 'Auto (from date)'], ['spring', 'Spring'], ['summer', 'Summer'], ['fall', 'Fall'], ['winter', 'Winter']], () => (ss.seasonAuto ? 'auto' : ss.season), (v) => { ss.seasonAuto = v === 'auto'; ss.season = v === 'auto' ? null : v; app.applySun(); upd(); }),
        el('div', { class: 'muted small' }, 'At night the windows glow and lamps turn on. Use Site → Sun hours to map daily sunlight for gardens.')),
    ];
  }
  syncSeason() { if (this.mode === 'sun') this.syncSun?.(); }
  syncToggles() { if (this.mode === 'explore') this.setMode('explore'); }

  // ------------------------------------------------------------------ inspector
  inspector() {
    const app = this.app, s = app.selection;
    if (!s) return [el('h3', {}, 'Nothing selected'), el('div', { class: 'muted small card' }, 'Click anything in the scene — walls, doors, rooms, furniture, plants, patios, fences or the ground — to see and edit its properties.'), this.quickTips()];
    const H = app.state.house;
    const out = [];
    const del = (label = 'Delete') => el('button', { class: 'btn danger small', onclick: () => app.deleteSelection() }, label);
    const mut = (what, fn) => (v) => { app.mutate(() => fn(v), what); };
    if (s.kind === 'item') {
      const it = app.findItem(s.id), c = CATALOG[it?.type];
      if (!it || !c) return [el('div', {}, 'Missing item')];
      const spec = plantSpec(it.type);
      out.push(el('h3', {}, c.cat), el('div', { class: 'card' },
        el('div', { class: 'row' }, el('b', {}, c.name), el('span', { class: 'muted small' }, it.existing ? 'as-built' : money(c.cost))),
        this.range('Rotation', 0, 359, 1, () => it.rot || 0, mut('items', (v) => (it.rot = v)), (v) => `${v}°`, false),
        c.colorable ? el('div', { class: 'row' }, el('label', {}, 'Color'), this.swatches(['#7d8a93', '#a39c8f', '#b5835a', '#34475e', '#56687a', '#8e9b84', '#6e3c3c', '#2b2c2e', '#e9e3d5', '#c9a13a', '#8a5a36', '#f1efe9'], () => it.color, mut('items', (v) => (it.color = v)))) : null,
        this.range('Size', 50, 200, 5, () => Math.round((it.scale?.[0] ?? 1) * 100), mut('items', (v) => (it.scale = [v / 100, v / 100, v / 100])), (v) => `${v}%`, false),
        c.place === 'wall' || !it.lv ? this.num('Raise/lower', () => it.dy ?? (c.place === 'wall' ? c.dy : 0), mut('items', (v) => (it.dy = v))) : null,
        spec && it.age !== null && it.age !== undefined ? this.range('Age at install', 0, 15, 1, () => it.age, mut('items', (v) => (it.age = v)), (v) => `${v} yr · ${plantHeight(spec, v + PLANT_STATE.years).toFixed(0)}′ tall`, false) : null,
        spec ? el('div', { class: 'muted small' }, `Mature ${spec.h}′ tall × ${spec.spread}′ wide${it.age === null ? ' · existing tree' : ''}`) : null,
        el('div', { class: 'kv small' }, el('span', {}, 'Where'), el('span', {}, it.lv ? levelById(H, it.lv)?.name : it.ground ? 'On the ground' : 'On deck/patio'), el('span', {}, 'Plan x, y'), el('span', {}, `${it.x.toFixed(1)}, ${it.y.toFixed(1)}`)),
        el('div', { class: 'row' }, el('button', { class: 'btn small', onclick: () => app.duplicateSelection() }, 'Duplicate'), el('button', { class: 'btn small', onclick: () => app.focusOn(app.itemMeshes.get(it.id).getWorldPosition(new THREE.Vector3()), 25) }, 'Zoom to'), del())));
    } else if (s.kind === 'wall') {
      const w = app.findWall(s.id);
      if (!w) return [el('div', {}, 'Wall removed')];
      const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
      const ops = H.openings.filter((o) => o.wall === w.id);
      out.push(el('h3', {}, `Wall · ${levelById(H, w.lv)?.name}`), el('div', { class: 'card' },
        el('div', { class: 'kv' }, el('span', {}, 'Length'), el('span', {}, ftIn(L)), el('span', {}, 'Thickness'), el('span', {}, ftIn(w.t)), el('span', {}, 'Openings'), el('span', {}, String(ops.length))),
        this.num('Thickness', () => w.t, mut('house', (v) => (w.t = Math.max(0.2, v)))),
        this.num('Height override', () => w.h ?? 0, mut('house', (v) => { if (v > 0) w.h = v; else delete w.h; })),
        this.select('Exterior face', [['', 'None (interior)'], ['brick', 'Brick'], ['siding', 'Siding'], ['block', 'Block']], () => w.ext || '', mut('house', (v) => (w.ext = v || false))),
        el('div', { class: 'row' },
          el('button', { class: 'btn small', onclick: () => { app.editor.setTool('door'); this.setMode('redesign'); } }, '+ Door'),
          el('button', { class: 'btn small', onclick: () => { app.editor.setTool('window'); this.setMode('redesign'); } }, '+ Window'),
          el('button', { class: 'btn small', onclick: () => this.splitWall(w) }, 'Split'), del()),
        w.ext ? el('div', { class: 'muted small' }, 'Exterior/bearing walls need an engineer before removal. Drag the yellow handles to move endpoints.') : el('div', { class: 'muted small' }, 'Drag the yellow handles to move endpoints (connected walls follow).')));
    } else if (s.kind === 'opening') {
      const o = app.findOpening(s.id);
      if (!o) return [el('div', {}, 'Removed')];
      const w = app.findWall(o.wall);
      const L = w ? Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) : 10;
      out.push(el('h3', {}, 'Door / window'), el('div', { class: 'card' },
        o.note ? el('div', { class: 'muted small' }, o.note) : null,
        this.select('Type', [['window', 'Window'], ['slider', 'Slider / patio door'], ['door', 'Interior door'], ['extdoor', 'Exterior door'], ['opening', 'Cased opening'], ['garage', 'Garage door']], () => o.kind, mut('house', (v) => (o.kind = v))),
        this.range('Position', o.w / 2, Math.max(o.w / 2, L - o.w / 2), 0.05, () => o.t, mut('house', (v) => (o.t = v)), (v) => ftIn(v), false),
        this.num('Width', () => o.w, mut('house', (v) => (o.w = Math.max(1, v)))),
        this.num('Height', () => o.h, mut('house', (v) => (o.h = Math.max(1, v)))),
        this.num('Sill', () => o.sill, mut('house', (v) => (o.sill = Math.max(0, v)))),
        o.kind.includes('door') ? el('div', { class: 'row' }, el('button', { class: 'btn small', onclick: mut('house', () => (o.flip = !o.flip)) }, 'Flip hinge'), el('button', { class: 'btn small', onclick: mut('house', () => (o.swing = o.swing === 'out' ? 'in' : 'out')) }, 'Swing side'), el('button', { class: 'btn small', onclick: mut('house', () => (o.open = (o.open ?? 1) > 0 ? 0 : 1)) }, 'Open/close')) : null,
        el('div', { class: 'row' }, del())));
    } else if (s.kind === 'room') {
      const r = app.findRoom(s.id);
      if (!r) return [el('div', {}, 'Removed')];
      out.push(el('h3', {}, `Room · ${levelById(H, r.lv)?.name}`), el('div', { class: 'card' },
        this.text('Name', () => r.name, mut('house', (v) => (r.name = v))),
        el('div', { class: 'kv' }, el('span', {}, 'Area'), el('span', {}, fmtArea(Math.abs(polyArea(r.pts)))), el('span', {}, 'Ceiling'), el('span', {}, ftIn(r.ceiling ?? levelById(H, r.lv).height))),
        this.select('Floor', Object.entries(FLOORS).map(([k, f]) => [k, `${f.name}${f.cost ? ` (${money(f.cost)}/sf)` : ''}`]), () => r.floor, mut('house', (v) => (r.floor = v))),
        el('div', { class: 'row' }, el('label', {}, 'Wall paint'), this.swatches(PAINTS, () => r.wallColor, mut('house', (v) => { r.wallColor = v; delete r.wallMat; }))),
        this.toggle('Exposed brick walls', () => r.wallMat === 'brick', mut('house', (v) => { if (v) r.wallMat = 'brick'; else delete r.wallMat; })),
        this.toggle('Finished space', () => r.finished !== false, mut('house', (v) => (r.finished = v))),
        el('div', { class: 'row' }, el('button', { class: 'btn small', onclick: () => { app.setLevel(r.lv); } }, 'Show level'), del('Delete room'))));
    } else if (s.kind === 'hardscape') {
      const h = app.findHardscape(s.id);
      if (!h) return [el('div', {}, 'Removed')];
      out.push(el('h3', {}, h.kind === 'path' ? 'Path / drive' : 'Patio / bed'), el('div', { class: 'card' },
        this.text('Name', () => h.name, mut('ground', (v) => (h.name = v))),
        this.select('Material', Object.entries(MATERIALS_GROUND).map(([k, m]) => [k, m.name]), () => h.mat, mut('ground', (v) => (h.mat = v))),
        h.kind === 'path' ? this.range('Width', 2, 20, 0.5, () => h.width, mut('ground', (v) => (h.width = v)), (v) => `${v} ft`, false) : null,
        el('div', { class: 'kv' }, el('span', {}, 'Area'), el('span', {}, fmtArea(hardscapeArea(h))), el('span', {}, 'Cost @ material'), el('span', {}, money(hardscapeArea(h) * (MATERIALS_GROUND[h.mat]?.cost || 0)))),
        el('div', { class: 'muted small' }, 'Drag yellow handles to reshape.'),
        el('div', { class: 'row' }, del())));
    } else if (s.kind === 'fence') {
      const f = app.findFence(s.id);
      if (!f) return [el('div', {}, 'Removed')];
      const L = polylineLength(f.pts);
      out.push(el('h3', {}, 'Fence / wall'), el('div', { class: 'card' },
        this.select('Type', Object.entries(FENCES).map(([k, x]) => [k, x.name]), () => f.type, mut('fences', (v) => (f.type = v))),
        this.num('Height', () => f.h ?? FENCES[f.type].h, mut('fences', (v) => (f.h = v))),
        el('div', { class: 'kv' }, el('span', {}, 'Length'), el('span', {}, `${L.toFixed(0)} ft`), el('span', {}, 'Cost'), el('span', {}, money(L * FENCES[f.type].cost))),
        el('div', { class: 'row' }, del())));
    } else if (s.kind === 'terrain' || s.kind === 'neighbor' || s.point) {
      const p = s.point;
      const site = app.site;
      const [lat, lon] = worldToLatLon(p.x, p.z);
      const sh = app.heat.sample(p.x, p.z);
      out.push(el('h3', {}, s.kind === 'neighbor' ? 'Neighbor building' : s.kind === 'garage' ? 'Detached garage' : s.kind === 'stair' ? 'Stair' : s.kind === 'roof' ? 'Roof' : s.kind === 'struct' ? 'Structure' : 'Ground'), el('div', { class: 'card kv' },
        s.addr ? el('span', {}, 'Address') : null, s.addr ? el('span', {}, s.addr) : null,
        el('span', {}, 'Elevation'), el('span', {}, `${(p.y + FRAME.mainFloorASL).toFixed(1)} ft ASL`),
        el('span', {}, 'vs main floor'), el('span', {}, `${p.y >= 0 ? '+' : ''}${p.y.toFixed(1)} ft`),
        el('span', {}, 'Slope'), el('span', {}, `${site.slopeAt(p.x, p.z).toFixed(1)}%`),
        el('span', {}, 'Lat, lon'), el('span', {}, `${lat.toFixed(6)}, ${lon.toFixed(6)}`),
        el('span', {}, 'In parcel'), el('span', {}, site.inParcel(p.x, p.z) ? 'yes' : 'no'),
        sh !== null ? el('span', {}, 'Sun (computed day)') : null, sh !== null ? el('span', {}, `${sh.toFixed(1)} h`) : null),
        s.kind === 'garage' ? el('div', { class: 'card small muted' }, 'Detached garage · 670 sf (iGUIDE) · CMU walls · 2 overhead doors facing south.') : null,
        s.kind === 'roof' ? el('div', { class: 'card small' }, 'Change roofing under Redesign → Exterior finishes.') : null,
        el('div', { class: 'row' }, el('button', { class: 'btn small', onclick: () => app.focusOn(p, 60) }, 'Center view here'), el('button', { class: 'btn small', onclick: () => navigator.clipboard?.writeText(`${lat.toFixed(6)}, ${lon.toFixed(6)}`).then(() => this.toast('Copied coordinates')) }, 'Copy lat/lon')));
    }
    out.push(this.quickTips());
    return out;
  }
  splitWall(w) {
    const app = this.app;
    const m = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    app.mutate((st) => {
      const nw = { ...deepClone(w), id: uid('w'), a: m.slice() };
      const ww = st.house.walls.find((x) => x.id === w.id);
      ww.b = m.slice();
      st.house.walls.push(nw);
      for (const o of st.house.openings) if (o.wall === w.id && o.t > L / 2) { o.wall = nw.id; o.t -= L / 2; }
    }, 'house');
    this.toast('Wall split at midpoint');
  }
  quickTips() {
    return el('div', { class: 'card small muted' }, el('b', {}, 'Tips'), el('div', {}, 'Right-drag or two-finger drag to pan · scroll to zoom · Shift+D duplicate · Q/E rotate · Ctrl/Cmd+Z undo · P toggles plan view · L room labels'));
  }

  // ------------------------------------------------------------------ estimate
  estimatePanel() {
    const e = this.app.estimate();
    const byCat = {};
    for (const l of e.lines) (byCat[l.cat] ||= []).push(l);
    const rows = [];
    for (const [cat, ls] of Object.entries(byCat)) {
      rows.push(el('tr', { class: 'cat' }, el('td', { colspan: 2 }, cat), el('td', { class: 'num' }, money(ls.reduce((a, l) => a + l.cost, 0)))));
      for (const l of ls) rows.push(el('tr', {}, el('td', {}, l.what), el('td', { class: 'num muted' }, `${l.qty >= 10 ? Math.round(l.qty).toLocaleString() : +l.qty.toFixed(1)} ${l.unit}`), el('td', { class: 'num' }, money(l.cost))));
    }
    return [
      el('h3', {}, 'Planning estimate'),
      e.lines.length ? el('table', { class: 'est' }, ...rows,
        el('tr', { class: 'tot' }, el('td', { colspan: 2 }, 'Subtotal'), el('td', { class: 'num' }, money(e.sub))),
        el('tr', {}, el('td', { colspan: 2 }, 'Contingency 15%'), el('td', { class: 'num' }, money(e.contingency))),
        el('tr', { class: 'tot' }, el('td', { colspan: 2 }, 'Total'), el('td', { class: 'num' }, money(e.total))))
        : el('div', { class: 'card muted small' }, 'No changes from the as-built model yet. Add furniture, change floors, move walls, plant trees or build a patio and costs will appear here.'),
      el('div', { class: 'card small muted' }, 'Rough 2026 Pittsburgh-area installed costs for comparing ideas (±30%). Not a quote. Structural changes (exterior/bearing walls) need an engineer and permits.'),
    ];
  }

  // ------------------------------------------------------------------ designs
  async designsPanel() {
    const app = this.app;
    const keys = ((await Store.keys().catch(() => [])) || []).filter((k) => String(k).startsWith('design:'));
    const name = el('input', { type: 'text', value: app.state.name || 'My design', style: 'flex:1;background:#11181e;border:1px solid var(--line);border-radius:6px;padding:5px 7px' });
    const file = el('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
    file.onchange = async () => { try { await app.importDesign(file.files[0]); this.setTab('designs'); } catch (e) { alert('Import failed: ' + e.message); } };
    const list = keys.length ? keys.map((k) => el('div', { class: 'design-row' }, el('div', { class: 'grow' }, String(k).slice(7)),
      el('button', { class: 'btn small', onclick: () => app.loadDesign(k) }, 'Load'),
      el('button', { class: 'btn small danger', onclick: async () => { if (confirm('Delete this saved design?')) { await Store.del(k); this.setTab('designs'); } } }, '×'))) : [el('div', { class: 'muted small' }, 'No saved designs yet.')];
    return [
      el('h3', {}, 'Current design'),
      el('div', { class: 'card' }, el('div', { class: 'row' }, name, el('button', { class: 'btn primary small', onclick: async () => { await app.saveDesign(name.value.trim() || 'My design'); this.setTab('designs'); } }, 'Save')),
        el('div', { class: 'muted small' }, 'Autosaves in this browser. Save named versions to compare ideas (e.g. “Open kitchen”, “Garden plan”).')),
      el('h3', {}, 'Saved in this browser'),
      el('div', { class: 'card' }, ...list),
      el('h3', {}, 'Share / backup'),
      el('div', { class: 'card' }, el('div', { class: 'row' }, el('button', { class: 'btn small', onclick: () => app.exportDesign() }, 'Export .json'), el('button', { class: 'btn small', onclick: () => file.click() }, 'Import .json'), file),
        el('div', { class: 'row' }, el('button', { class: 'btn danger small', onclick: () => { if (confirm('Discard everything and go back to the as-built scan?')) app.resetToAsBuilt(); } }, 'Start over (as-built)'))),
    ];
  }

  help() {
    const k = (s) => el('kbd', {}, s);
    this.modal('935 Al Smith Dr — 3D Home & Site Studio',
      el('p', {}, 'A to-scale model of the house (from the iGUIDE scan) sitting on the real lot: county parcel lines, 2-ft terrain, OpenStreetMap footprints and NAIP aerial imagery. Everything is editable and saved in your browser.'),
      el('h3', {}, 'Navigate'),
      el('p', {}, 'Left-drag orbit · right-drag pan · scroll zoom (toward the cursor). Level buttons on the right cut the house open. ', k('P'), ' plan view, ', k('L'), ' labels.'),
      el('h3', {}, 'Modes'),
      el('ul', {},
        el('li', {}, el('b', {}, 'Redesign'), ' – draw/move/delete walls, rooms, doors & windows; change brick, siding, roof, trim.'),
        el('li', {}, el('b', {}, 'Decorate'), ' – 70+ furniture and fixture items; staging presets; paint & floors via the Inspector.'),
        el('li', {}, el('b', {}, 'Landscape'), ' – trees that grow over time, shrubs, structures, patios & paths, fences, ground painting, terrain sculpting with cut/fill, clearing woods.'),
        el('li', {}, el('b', {}, 'Site & Lot'), ' – parcel bearings, neighbors, contours, survey easements, slope/elevation and sun-hours maps.'),
        el('li', {}, el('b', {}, 'Sun & Seasons'), ' – accurate sun position for any date/time, animated shadows, seasonal foliage, night lighting.'),
        el('li', {}, el('b', {}, 'Walk-through'), ' – first-person with stairs and collisions.')),
      el('h3', {}, 'Editing keys'),
      el('p', {}, k('Del'), ' delete · ', k('Q'), '/', k('E'), ' rotate 15° (Shift 1°) · ', k('R'), ' +90° · ', k('Shift+D'), ' duplicate · ', k('Esc'), ' cancel · ', k('Enter'), ' finish drawing · ', k('Alt'), ' disable snapping · ', k('Ctrl/Cmd+Z'), ' undo'),
      el('p', { class: 'muted small' }, 'Data: iGUIDE (Planitar) scan 2026-05-04; Allegheny County parcels & 2004 contours; © OpenStreetMap contributors; USGS NAIP imagery (public domain). Rendering: three.js.'));
  }
}
