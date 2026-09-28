import { DEG } from './util.js';

// Plan frame: iGUIDE drawings, feet, origin at sunroom NW outer corner, x = plan east, y = plan south.
// World frame: feet, x = true east, z = true south, origin = OSM footprint centroid (lat0/lon0), y = up with 0 at main floor.
// House axes are rotated 7.4 deg clockwise from true north (fit to OSM footprint + NAIP imagery).
export const FRAME = {
  tx: -19.5,
  tz: -20.5,
  rotDeg: 7.4,
  mainFloorASL: 1094.5,
  lat0: 40.477115,
  lon0: -80.086343,
};
const FT = 3.28084;
export const KX = Math.cos(FRAME.lat0 * DEG) * 111320 * FT;
export const KY = 110574 * FT;
const c = Math.cos(FRAME.rotDeg * DEG), s = Math.sin(FRAME.rotDeg * DEG);

export function planToWorld(x, y) {
  return [c * x - s * y + FRAME.tx, s * x + c * y + FRAME.tz];
}
export function worldToPlan(x, z) {
  const dx = x - FRAME.tx, dz = z - FRAME.tz;
  return [c * dx + s * dz, -s * dx + c * dz];
}
export function worldToLatLon(x, z) {
  return [FRAME.lat0 - z / KY, FRAME.lon0 + x / KX];
}
export const planPolyToWorld = (pts) => pts.map(([x, y]) => planToWorld(x, y));
export const PLAN_ROT_Y = -FRAME.rotDeg * DEG;
