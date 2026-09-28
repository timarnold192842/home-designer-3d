import { DEG } from './util.js';

// Eastern time offset (hours) for a local civil date, US DST rules (2nd Sun Mar – 1st Sun Nov).
export function easternOffset(y, m, d, h) {
  const nthSunday = (month, n) => { const first = new Date(Date.UTC(y, month, 1)).getUTCDay(); return 1 + ((7 - first) % 7) + (n - 1) * 7; };
  const start = nthSunday(2, 2), end = nthSunday(10, 1);
  const md = m * 100 + d;
  const dst = (md > 200 + start || (md === 200 + start && h >= 2)) && (md < 1000 + end || (md === 1000 + end && h < 2));
  return dst ? -4 : -5;
}

export function localToUTC(y, m, d, hours) {
  const off = easternOffset(y, m, d, hours);
  return Date.UTC(y, m, d) + (hours - off) * 3600e3;
}

// Returns azimuth (deg clockwise from true north) and elevation (deg).
export function sunPosition(ms, lat, lon) {
  const d = ms / 86400000 + 2440587.5 - 2451545.0;
  const g = ((357.529 + 0.98560028 * d) % 360) * DEG;
  const q = (280.459 + 0.98564736 * d) % 360;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG;
  const e = (23.439 - 0.00000036 * d) * DEG;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const H = ((gmst * 15 + lon) * DEG - ra);
  const la = lat * DEG;
  const el = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(la) - Math.sin(la) * Math.cos(H));
  return { azimuth: ((az / DEG) + 360) % 360, elevation: el / DEG };
}

// Unit vector toward the sun in world frame (x east, y up, z south).
export function sunVector(az, el) {
  const a = az * DEG, e = el * DEG;
  return [Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a)];
}

export function sunTimes(y, m, d, lat, lon) {
  let rise = null, set = null, prev = null;
  for (let h = 0; h <= 24; h += 1 / 12) {
    const el = sunPosition(localToUTC(y, m, d, h), lat, lon).elevation;
    if (prev !== null) {
      if (prev < -0.83 && el >= -0.83) rise = h;
      if (prev >= -0.83 && el < -0.83) set = h;
    }
    prev = el;
  }
  return { rise, set };
}

export const fmtHour = (h) => {
  if (h === null || h === undefined) return '—';
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  const H = ((hh + 11) % 12) + 1;
  return `${H}:${String(mm % 60).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'}`;
};
