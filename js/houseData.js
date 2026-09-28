// As-built model of 935 Al Smith Dr, transcribed from the iGUIDE scan (2026-05-04).
// Plan frame, feet. x = plan east, y = plan south. Origin = sunroom NW outer corner.
// Walls are centerlines. Openings: t = distance of opening center from wall start (a), w/h/sill in feet.

const W = (id, lv, a, b, t, ext = false, extra = {}) => ({ id, lv, a, b, t, ext, ...extra });
const O = (id, wall, t, w, h, sill, kind, extra = {}) => ({ id, wall, t, w, h, sill, kind, ...extra });
const R = (id, lv, name, pts, floor, extra = {}) => ({ id, lv, name, pts, floor, ...extra });

export const LEVELS = [
  { id: 'bsmt', name: 'Basement', short: 'B', elev: -8, height: 7.0 },
  { id: 'main', name: 'Main Floor', short: '1', elev: 0, height: 8.583 },
  { id: 'upper', name: '2nd Floor', short: '2', elev: 9.583, height: 8.167 },
  { id: 'attic', name: 'Attic', short: 'A', elev: 18.75, height: 5.5 },
];

const walls = [
  // ---------------- Basement (foundation + partitions)
  W('b_n', 'bsmt', [9.93, 12.4], [37.9, 12.4], 1.2, 'block'),
  W('b_e', 'bsmt', [37.9, 12.4], [37.9, 48.25], 1.2, 'block'),
  W('b_s', 'bsmt', [37.9, 48.25], [9.93, 48.25], 1.2, 'block'),
  W('b_w', 'bsmt', [9.93, 48.25], [9.93, 12.4], 1.2, 'block'),
  W('b_i1', 'bsmt', [10.53, 28.2], [37.3, 28.2], 0.4),
  W('b_i2', 'bsmt', [26.8, 15.8], [26.8, 28.2], 0.4),
  W('b_i3', 'bsmt', [22.8, 15.8], [26.8, 15.8], 0.4),
  W('b_i4', 'bsmt', [22.8, 13.0], [22.8, 15.8], 0.4),
  W('b_i5', 'bsmt', [22.5, 17.7], [22.5, 28.2], 0.4),
  W('b_i6', 'bsmt', [22.5, 17.7], [26.8, 17.7], 0.4),
  W('b_i7', 'bsmt', [10.53, 30.7], [18.2, 30.7], 0.4),
  W('b_i8', 'bsmt', [18.2, 30.7], [18.2, 47.65], 0.4),
  W('b_i9', 'bsmt', [10.53, 40.0], [18.2, 40.0], 0.4),

  // ---------------- Main floor
  W('m_sun_n', 'main', [0.25, 0.25], [23.75, 0.25], 0.5, 'siding', { h: 7.2 }),
  W('m_sun_e', 'main', [23.75, 0.25], [23.75, 11.8], 0.5, 'siding', { h: 7.2 }),
  W('m_sun_w', 'main', [0.25, 0.25], [0.25, 11.8], 0.5, 'siding', { h: 7.2 }),
  W('m_ww_w', 'main', [0.3, 11.8], [0.3, 30.2], 0.6, 'brick', { h: 9.0 }),
  W('m_ww_s', 'main', [0.3, 30.2], [9.33, 30.2], 0.6, 'brick', { h: 9.0 }),
  W('m_sun_ww', 'main', [0.5, 11.8], [9.33, 11.8], 0.5, 'brick', { h: 9.0 }),
  W('m_core_n', 'main', [9.78, 12.25], [38.05, 12.25], 0.9, 'brick'),
  W('m_core_e', 'main', [38.05, 12.25], [38.05, 48.4], 0.9, 'brick'),
  W('m_core_s', 'main', [38.05, 48.4], [9.78, 48.4], 0.9, 'brick'),
  W('m_core_w', 'main', [9.78, 48.4], [9.78, 12.25], 0.9, 'brick'),
  W('m_i_stair', 'main', [23.6, 12.7], [23.6, 20.3], 0.4),
  W('m_i_stair_s', 'main', [23.6, 16.0], [33.5, 16.0], 0.4),
  W('m_i_s1', 'main', [10.23, 36.3], [37.6, 36.3], 0.4),
  W('m_i_clo1', 'main', [10.23, 38.8], [16.2, 38.8], 0.4),
  W('m_i_clo2', 'main', [16.2, 36.3], [16.2, 38.8], 0.4),
  W('m_i_x18', 'main', [18.2, 36.3], [18.2, 47.95], 0.4),
  W('m_i_y40', 'main', [18.2, 40.3], [26.3, 40.3], 0.4),
  W('m_i_x239', 'main', [23.9, 40.3], [23.9, 47.95], 0.4),
  W('m_i_x263', 'main', [26.3, 36.3], [26.3, 47.95], 0.4),

  // ---------------- 2nd floor
  W('u_n', 'upper', [9.78, 12.25], [38.05, 12.25], 0.9, 'brick'),
  W('u_e', 'upper', [38.05, 12.25], [38.05, 30.15], 0.9, 'brick'),
  W('u_s', 'upper', [38.05, 30.15], [9.78, 30.15], 0.9, 'brick'),
  W('u_w', 'upper', [9.78, 30.15], [9.78, 12.25], 0.9, 'brick'),
  W('u_i1', 'upper', [18.4, 12.7], [18.4, 19.45], 0.4),
  W('u_i2', 'upper', [15.5, 15.1], [18.4, 15.1], 0.4),
  W('u_i3', 'upper', [15.5, 12.7], [15.5, 15.1], 0.4),
  W('u_i4', 'upper', [10.23, 19.45], [23.4, 19.45], 0.4),
  W('u_i5', 'upper', [23.4, 15.8], [23.4, 29.7], 0.4),
  W('u_i6', 'upper', [23.4, 15.8], [37.6, 15.8], 0.4),
  W('u_i7', 'upper', [29.4, 12.7], [29.4, 15.8], 0.4),
  W('u_i8', 'upper', [32.5, 12.7], [32.5, 15.8], 0.4),
  W('u_i9', 'upper', [24.9, 19.8], [24.9, 29.7], 0.4),
  W('u_i10', 'upper', [23.4, 19.8], [24.9, 19.8], 0.4),
  W('u_i11', 'upper', [19.3, 25.95], [19.3, 29.7], 0.4),
  W('u_i12', 'upper', [19.3, 25.95], [23.4, 25.95], 0.4),
];

const openings = [
  // basement
  O('ob1', 'b_n', 17.6, 2.8, 1.8, 4.8, 'window'),
  O('ob2', 'b_e', 33.2, 3.0, 6.7, 0, 'extdoor'),
  O('ob3', 'b_e', 27.45, 3.4, 3.5, 2.8, 'window'),
  O('ob4', 'b_e', 13.0, 2.4, 1.8, 4.8, 'window'),
  O('ob5', 'b_s', 4.85, 2.6, 2.0, 4.6, 'window'),
  O('ob6', 'b_s', 22.2, 2.6, 2.0, 4.6, 'window'),
  O('ob7', 'b_w', 31.25, 2.8, 1.8, 4.8, 'window'),
  O('ob8', 'b_i1', 4.87, 2.6, 6.6, 0, 'door'),
  O('ob9', 'b_i1', 24.47, 3.0, 6.6, 0, 'opening'),
  O('ob10', 'b_i2', 1.9, 2.6, 6.6, 0, 'door'),
  O('ob11', 'b_i5', 3.8, 2.4, 6.6, 0, 'door'),
  O('ob12', 'b_i8', 7.5, 2.4, 6.6, 0, 'door'),
  O('ob13', 'b_i8', 11.1, 2.4, 6.6, 0, 'door'),
  // main
  O('om1', 'm_sun_n', 6.1, 9.3, 6.6, 0.2, 'slider'),
  O('om2', 'm_sun_n', 17.6, 9.3, 6.6, 0.2, 'slider'),
  O('om3', 'm_sun_e', 6.0, 8.5, 5.4, 1.0, 'slider'),
  O('om4', 'm_sun_w', 3.4, 2.8, 6.7, 0, 'extdoor'),
  O('om5', 'm_sun_w', 8.7, 4.8, 5.0, 1.6, 'slider'),
  O('om6', 'm_ww_w', 9.0, 3.0, 4.0, 3.0, 'window'),
  O('om7', 'm_ww_s', 5.2, 2.6, 3.5, 3.5, 'window'),
  O('om8', 'm_sun_ww', 7.3, 2.6, 6.8, 0, 'opening'),
  O('om9', 'm_core_n', 4.3, 2.9, 4.0, 3.0, 'window'),
  O('om10', 'm_core_n', 9.2, 2.8, 6.8, 0, 'opening'),
  O('om11', 'm_core_n', 21.1, 2.0, 2.5, 4.5, 'window'),
  O('om12', 'm_core_e', 2.8, 3.0, 6.8, 0, 'extdoor', { note: 'Front door (to porch)' }),
  O('om13', 'm_core_e', 12.05, 3.4, 4.8, 2.4, 'window'),
  O('om14', 'm_core_e', 20.9, 3.4, 4.8, 2.4, 'window'),
  O('om15', 'm_core_e', 30.9, 3.4, 4.8, 2.4, 'window'),
  O('om16', 'm_core_s', 3.9, 2.8, 4.0, 3.0, 'window'),
  O('om17', 'm_core_s', 23.85, 2.8, 4.0, 3.0, 'window'),
  O('om18', 'm_core_w', 6.95, 2.8, 4.0, 3.0, 'window'),
  O('om19', 'm_core_w', 15.75, 3.6, 4.8, 2.4, 'window'),
  O('om20', 'm_core_w', 28.8, 8.0, 7.0, 0, 'opening'),
  O('om21', 'm_i_stair', 1.65, 2.6, 6.7, 0, 'door', { note: 'Basement stair door' }),
  O('om22', 'm_i_s1', 10.77, 3.0, 6.9, 0, 'opening'),
  O('om23', 'm_i_s1', 3.1, 4.0, 6.7, 0, 'door', { note: 'Pantry closet' }),
  O('om24', 'm_i_x18', 1.45, 2.5, 6.7, 0, 'door'),
  O('om25', 'm_i_y40', 2.05, 2.4, 6.7, 0, 'door'),
  O('om26', 'm_i_y40', 6.95, 2.0, 6.7, 0, 'door'),
  O('om27', 'm_i_x263', 2.0, 2.6, 6.7, 0, 'door'),
  // upper
  O('ou1', 'u_n', 10.65, 3.0, 4.0, 3.0, 'window'),
  O('ou2', 'u_e', 5.45, 3.0, 4.5, 2.8, 'window'),
  O('ou3', 'u_e', 11.9, 3.0, 4.5, 2.8, 'window'),
  O('ou4', 'u_s', 10.05, 3.0, 4.0, 3.0, 'window'),
  O('ou5', 'u_s', 20.75, 3.0, 4.0, 3.0, 'window'),
  O('ou6', 'u_w', 5.1, 3.2, 2.4, 4.2, 'window'),
  O('ou7', 'u_w', 12.5, 3.0, 2.4, 4.2, 'window'),
  O('ou8', 'u_i1', 4.95, 2.5, 6.6, 0, 'door'),
  O('ou9', 'u_i2', 1.45, 2.2, 6.6, 0, 'door'),
  O('ou10', 'u_i4', 11.1, 2.6, 6.6, 0, 'door'),
  O('ou11', 'u_i5', 1.85, 2.6, 6.6, 0, 'door'),
  O('ou12', 'u_i6', 7.2, 1.8, 6.4, 0, 'door'),
  O('ou13', 'u_i6', 11.6, 3.0, 6.6, 0, 'door'),
  O('ou14', 'u_i12', 1.75, 2.4, 6.6, 0, 'door'),
];

const rooms = [
  // basement
  R('rb_work', 'bsmt', 'Unfinished / Workshop', [[10.73, 13.2], [22.6, 13.2], [22.6, 16.0], [26.6, 16.0], [26.6, 17.5], [22.3, 17.5], [22.3, 28.0], [10.73, 28.0]], 'concrete', { finished: false }),
  R('rb_util', 'bsmt', 'Utility', [[22.7, 17.9], [26.6, 17.9], [26.6, 28.0], [22.7, 28.0]], 'concrete', { finished: false }),
  R('rb_kit', 'bsmt', 'Basement Kitchen', [[27.0, 13.2], [37.1, 13.2], [37.1, 28.0], [27.0, 28.0]], 'vinyl', { finished: true }),
  R('rb_rec', 'bsmt', 'Rec Room', [[10.73, 28.4], [37.1, 28.4], [37.1, 47.45], [18.4, 47.45], [18.4, 30.9], [10.73, 30.9]], 'carpet', { finished: true }),
  R('rb_stor', 'bsmt', 'Storage', [[10.73, 30.9], [18.0, 30.9], [18.0, 39.8], [10.73, 39.8]], 'concrete', { finished: true }),
  R('rb_bath', 'bsmt', 'Bath (4pc)', [[10.73, 40.2], [18.0, 40.2], [18.0, 47.45], [10.73, 47.45]], 'tile', { finished: true }),
  // main
  R('rm_sun', 'main', 'Sunroom', [[0.5, 0.5], [23.5, 0.5], [23.5, 11.8], [0.5, 11.8]], 'tile', { finished: true, ceiling: 7.42 }),
  R('rm_ww', 'main', 'West Wing (old kitchen)', [[0.6, 12.05], [9.33, 12.05], [9.33, 29.9], [0.6, 29.9]], 'subfloor', { finished: false }),
  R('rm_great', 'main', 'Great Room (unfinished)', [[10.23, 12.7], [23.6, 12.7], [23.6, 16.2], [33.5, 16.2], [33.5, 12.7], [37.6, 12.7], [37.6, 36.1], [10.23, 36.1]], 'subfloor', { finished: false }),
  R('rm_pantry', 'main', 'Closet', [[10.23, 36.5], [16.0, 36.5], [16.0, 38.6], [10.23, 38.6]], 'subfloor', { finished: false }),
  R('rm_laundry', 'main', 'Laundry', [[16.4, 36.5], [18.0, 36.5], [18.0, 47.95], [10.23, 47.95], [10.23, 39.0], [16.4, 39.0]], 'tile', { finished: true }),
  R('rm_hall', 'main', 'Hall', [[18.4, 36.5], [26.1, 36.5], [26.1, 40.1], [18.4, 40.1]], 'subfloor', { finished: false }),
  R('rm_bath', 'main', 'Bath (3pc)', [[18.4, 40.5], [23.7, 40.5], [23.7, 47.95], [18.4, 47.95]], 'tile', { finished: true }),
  R('rm_linen', 'main', 'Linen', [[24.1, 40.5], [26.1, 40.5], [26.1, 47.95], [24.1, 47.95]], 'subfloor', { finished: false }),
  R('rm_bed', 'main', 'Bedroom / Den (unfinished)', [[26.5, 36.5], [37.6, 36.5], [37.6, 47.95], [26.5, 47.95]], 'subfloor', { finished: false }),
  // upper
  R('ru_bath', 'upper', 'Bath (4pc)', [[10.23, 12.7], [15.3, 12.7], [15.3, 15.3], [18.2, 15.3], [18.2, 19.25], [10.23, 19.25]], 'tile', { finished: true }),
  R('ru_linen', 'upper', 'Linen', [[15.7, 12.7], [18.2, 12.7], [18.2, 14.9], [15.7, 14.9]], 'hardwood', { finished: true }),
  R('ru_hall', 'upper', 'Hall', [[18.6, 12.7], [23.6, 12.7], [23.6, 19.25], [18.6, 19.25]], 'hardwood', { finished: true }),
  R('ru_bed', 'upper', 'Bedroom', [[10.23, 19.65], [23.2, 19.65], [23.2, 25.75], [19.1, 25.75], [19.1, 29.7], [10.23, 29.7]], 'hardwood', { finished: true }),
  R('ru_bclo', 'upper', 'Closet', [[19.5, 26.15], [23.2, 26.15], [23.2, 29.7], [19.5, 29.7]], 'hardwood', { finished: true }),
  R('ru_primary', 'upper', 'Primary Bedroom', [[23.6, 16.0], [37.6, 16.0], [37.6, 29.7], [25.1, 29.7], [25.1, 19.6], [23.6, 19.6]], 'hardwood', { finished: true }),
  R('ru_strg', 'upper', 'Storage', [[29.6, 12.7], [32.3, 12.7], [32.3, 15.6], [29.6, 15.6]], 'hardwood', { finished: true }),
  R('ru_pclo', 'upper', 'Closet', [[32.7, 12.7], [37.6, 12.7], [37.6, 15.6], [32.7, 15.6]], 'hardwood', { finished: true }),
  // attic (floored area under the ridge)
  R('ra_attic', 'attic', 'Attic', [[10.2, 12.7], [20.5, 12.7], [20.5, 29.7], [10.2, 29.7]], 'plywood', { finished: false, noCeiling: true }),
];

const stairs = [
  { id: 'st_up', lv: 'main', x0: 23.6, x1: 33.5, y0: 12.7, y1: 15.8, dir: '-x', from: 0, to: 9.583, n: 15, rails: [] },
  { id: 'st_dn', lv: 'bsmt', x0: 23.6, x1: 33.0, y0: 12.7, y1: 15.8, dir: '-x', from: -8, to: 0, n: 12, rails: ['y1'] },
  { id: 'st_ext', lv: 'site', x0: 9.5, x1: 19.6, y0: 48.95, y1: 51.9, dir: '-x', from: -8.35, to: -0.45, n: 10, rails: ['y1'], mat: 'concrete' },
];

const roofs = [
  { id: 'rf_main', kind: 'gable', ridge: 'x', rect: [9.33, 11.8, 38.5, 30.6], base: 18.75, pitch: 7 / 12, oh: { n: 1.2, s: 1.2, e: 1.2, w: 1.2 }, gables: ['e', 'w'], gableMat: 'brick' },
  { id: 'rf_south', kind: 'gable', ridge: 'x', rect: [9.33, 30.6, 38.5, 48.85], base: 9.583, pitch: 7 / 12, oh: { n: 0, s: 1.0, e: 1.0, w: 1.0 }, gables: ['e', 'w'], gableMat: 'brick' },
  { id: 'rf_dormer', kind: 'gable', ridge: 'y', rect: [19.5, 40.0, 31.0, 48.85], base: 9.583, pitch: 10 / 12, oh: { n: 0, s: 0.8, e: 0.6, w: 0.6 }, gables: ['s'], gableMat: 'siding' },
  { id: 'rf_ww', kind: 'gable', ridge: 'x', rect: [0, 11.8, 9.33, 30.5], base: 9.0, pitch: 10 / 12, oh: { n: 1.0, s: 1.0, e: 0, w: 1.0 }, gables: ['w'], gableMat: 'brick' },
  { id: 'rf_sun', kind: 'shed', rect: [0, 0, 24, 11.8], down: 'n', high: 9.2, pitch: 2 / 12, wallTop: 7.2, oh: { n: 1.0, s: 0, e: 0.8, w: 0.8 }, sideMat: 'siding' },
];

// Non-wall structures in plan frame
const structs = [
  { id: 'chimney', kind: 'chimney', rect: [21.4, 20.3, 24.6, 27.0], from: -8, to: 9.583, flue: [23.6, 21.0, 24.7, 25.0], top: 27.2, fireplaces: [{ lv: 'main', side: 'w' }, { lv: 'main', side: 'e' }] },
  { id: 'bsmt_fp', kind: 'fireplace', lv: 'bsmt', x: 18.6, y: 34.6, face: 'e' },
  { id: 'beam', kind: 'beam', lv: 'main', a: [10.23, 30.6], b: [37.6, 30.6], posts: [15.3, 19.4, 28.2, 32.5] },
  { id: 'bulkhead', kind: 'soffit', lv: 'bsmt', rect: [10.73, 28.4, 37.1, 30.6], drop: 1.2 },
  {
    id: 'porch', kind: 'deck', name: 'Front Porch', top: -0.15, bottom: -8.35,
    pts: [[38.5, 11.7], [40.6, 9.3], [42.7, 11.4], [49.2, 11.4], [49.2, 15.0], [51.9, 18.9], [51.9, 24.1], [49.2, 26.5], [49.2, 31.7], [38.5, 31.7]],
    houseEdges: [9], roof: { h: 9.1, mat: 'poly' },
  },
  {
    id: 'patio_cover', kind: 'cover', name: 'West Patio Cover', rect: [-12.9, -10.7, 0, 30.8], h: 8.6,
    posts: [[-12.4, -10.2], [-12.4, -0.7], [-12.4, 9.3], [-12.4, 19.3], [-12.4, 29.3], [-0.5, -10.2], [-0.5, -0.7]],
  },
  { id: 'ret_wall', kind: 'retaining', pts: [[40.5, -19], [40.5, 9.3]], top: -0.45, bottom: -9.5, t: 0.8 },
  { id: 'ac', kind: 'ac', x: -1.6, y: 35.2, elev: -0.45 },
];

// Detached garage in WORLD frame (aligned with true north per imagery).
const garage = {
  id: 'garage', cx: 20, cz: -57, w: 23.7, d: 27.6, rotDeg: 0, wallH: 9.583, pitch: 7 / 12, t: 0.7,
  openings: [
    { side: 's', t: 6.2, w: 9, h: 7, sill: 0, kind: 'garage' },
    { side: 's', t: 17.5, w: 9, h: 7, sill: 0, kind: 'garage' },
    { side: 'n', t: 8.5, w: 3, h: 3.5, sill: 3.5, kind: 'window' },
    { side: 'n', t: 15.2, w: 3, h: 3.5, sill: 3.5, kind: 'window' },
    { side: 'e', t: 13.8, w: 3, h: 3.5, sill: 3.5, kind: 'window' },
    { side: 'w', t: 5, w: 3, h: 6.8, sill: 0, kind: 'extdoor' },
    { side: 'w', t: 14, w: 3, h: 3.5, sill: 3.5, kind: 'window' },
  ],
};

// Plumbing/mechanical/appliance fixtures present in the scan (as catalog items).
const fixtures = [
  { type: 'furnace', lv: 'bsmt', x: 24.2, y: 20.6, rot: 90 },
  { type: 'waterHeater', lv: 'bsmt', x: 25.6, y: 23.0, rot: 0 },
  { type: 'sumpPump', lv: 'bsmt', x: 25.4, y: 19.2, rot: 0 },
  { type: 'utilitySink', lv: 'bsmt', x: 18.9, y: 27.1, rot: 180 },
  { type: 'range', lv: 'bsmt', x: 28.3, y: 21.6, rot: 270 },
  { type: 'sinkCabinet', lv: 'bsmt', x: 31.0, y: 27.0, rot: 180 },
  { type: 'baseCabinet', lv: 'bsmt', x: 34.0, y: 27.0, rot: 180 },
  { type: 'tub', lv: 'bsmt', x: 12.1, y: 43.8, rot: 270 },
  { type: 'toilet', lv: 'bsmt', x: 16.7, y: 46.2, rot: 90 },
  { type: 'vanity', lv: 'bsmt', x: 17.0, y: 43.0, rot: 90 },
  { type: 'desk', lv: 'bsmt', x: 33.0, y: 45.6, rot: 180 },
  { type: 'washer', lv: 'main', x: 11.5, y: 45.6, rot: 270 },
  { type: 'dryer', lv: 'main', x: 11.5, y: 43.1, rot: 270 },
  { type: 'utilitySink', lv: 'main', x: 14.8, y: 46.8, rot: 180 },
  { type: 'shower', lv: 'main', x: 21.05, y: 46.3, rot: 180 },
  { type: 'toilet', lv: 'main', x: 22.4, y: 41.9, rot: 90 },
  { type: 'vanity', lv: 'main', x: 19.4, y: 42.0, rot: 270 },
  { type: 'woodStove', lv: 'main', x: 5.0, y: 10.4, rot: 180 },
  { type: 'tub', lv: 'upper', x: 12.8, y: 14.0, rot: 0 },
  { type: 'toilet', lv: 'upper', x: 11.2, y: 17.4, rot: 270 },
  { type: 'vanity', lv: 'upper', x: 14.0, y: 18.3, rot: 180 },
];

export function defaultHouse() {
  return JSON.parse(JSON.stringify({ levels: LEVELS, walls, openings, rooms, stairs, roofs, structs, garage }));
}
export function defaultFixtures() {
  return JSON.parse(JSON.stringify(fixtures));
}
