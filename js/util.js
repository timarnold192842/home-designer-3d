export const DEG = Math.PI / 180;

export const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 9);

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function seeded(seed = 1) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function ftIn(ft) {
  const sign = ft < 0 ? '-' : '';
  ft = Math.abs(ft);
  let f = Math.floor(ft);
  let i = Math.round((ft - f) * 12);
  if (i === 12) { f++; i = 0; }
  return `${sign}${f}'-${i}"`;
}

export const fmtArea = (a) => `${Math.round(a).toLocaleString()} sf`;
export const money = (v) => '$' + Math.round(v).toLocaleString();

export function polyArea(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

export function polyCentroid(pts) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n];
    const f = x1 * y2 - x2 * y1;
    a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
  }
  if (Math.abs(a) < 1e-9) return pts[0].slice();
  return [cx / (3 * a), cy / (3 * a)];
}

export function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const L2 = dx * dx + dy * dy;
  let t = L2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
  t = clamp(t, 0, 1);
  const qx = ax + t * dx, qy = ay + t * dy;
  return { d: Math.hypot(px - qx, py - qy), t, x: qx, y: qy };
}

export function signedDistPoly(x, y, pts) {
  let d = Infinity;
  for (let i = 0, n = pts.length; i < n; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % n];
    d = Math.min(d, distToSeg(x, y, ax, ay, bx, by).d);
  }
  return pointInPoly(x, y, pts) ? -d : d;
}

export function distToPolyline(x, y, pts) {
  let best = { d: Infinity };
  for (let i = 0; i < pts.length - 1; i++) {
    const r = distToSeg(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (r.d < best.d) best = { ...r, i };
  }
  return best;
}

export function polylineLength(pts) {
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  return L;
}

// World vector (x east, z south) -> surveyor quadrant bearing.
export function bearingStr(dx, dz) {
  let az = Math.atan2(dx, -dz) / DEG;
  if (az < 0) az += 360;
  let ns, ew, a;
  if (az <= 90) { ns = 'N'; ew = 'E'; a = az; }
  else if (az <= 180) { ns = 'S'; ew = 'E'; a = 180 - az; }
  else if (az <= 270) { ns = 'S'; ew = 'W'; a = az - 180; }
  else { ns = 'N'; ew = 'W'; a = 360 - az; }
  let d = Math.floor(a), m = Math.round((a - d) * 60);
  if (m === 60) { d++; m = 0; }
  return `${ns} ${d}°${String(m).padStart(2, '0')}' ${ew}`;
}

export function downloadBlob(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export const deepClone = (o) => JSON.parse(JSON.stringify(o));

export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
