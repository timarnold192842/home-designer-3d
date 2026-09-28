"""Build site.json + terrain.bin for the 3D home designer from local county GIS + OSM data.

Usage: /tmp/geo/bin/python scripts/build_site.py
Inputs: ../parcels.geojson, ../mckeesrocks.geojson, /tmp/osm.json (from fetch_osm.py)
World frame: feet, x = east, z = south, origin = OSM footprint centroid of 935 Al Smith Dr.
"""
import json, math, re, base64, os
import numpy as np
from pyproj import Transformer
from scipy.interpolate import griddata
from shapely.geometry import LineString, Polygon, box

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.dirname(ROOT)
OUT = os.path.join(ROOT, "data")
os.makedirs(OUT, exist_ok=True)

LAT0, LON0 = 40.477115, -80.086343
FT = 3.28084
KX = math.cos(math.radians(LAT0)) * 111320 * FT
KY = 110574 * FT
PIN = "0110M00207000000"
HALF_X, HALF_Z, STEP = 900, 1000, 5.0

to_ll = Transformer.from_crs("EPSG:2272", "EPSG:4326", always_xy=True)


def loc(lon, lat):
    return (round((lon - LON0) * KX, 2), round(-(lat - LAT0) * KY, 2))


def ll_bbox():
    lon_min = LON0 - HALF_X / KX; lon_max = LON0 + HALF_X / KX
    lat_min = LAT0 - HALF_Z / KY; lat_max = LAT0 + HALF_Z / KY
    return lon_min, lat_min, lon_max, lat_max


lon_min, lat_min, lon_max, lat_max = ll_bbox()

# ---------- parcels ----------
print("reading parcels...")
txt = open(os.path.join(DATA, "parcels.geojson")).read()
parcels, own = [], None
num = re.compile(r"\[\s*(-?\d+\.\d+),\s*(-?\d+\.\d+)\s*\]")
for chunk in txt.split('{"geometry"')[1:]:
    m = num.search(chunk)
    if not m:
        continue
    lo, la = float(m.group(1)), float(m.group(2))
    if not (lon_min - 0.003 < lo < lon_max + 0.003 and lat_min - 0.003 < la < lat_max + 0.003):
        continue
    body = '{"geometry"' + chunk
    body = body.rstrip().rstrip(",").rstrip()
    if body.endswith("]}"):
        body = body[:-2]
    try:
        f = json.loads(body)
    except json.JSONDecodeError:
        continue
    g = f["geometry"]
    polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
    for poly in polys:
        ring = [loc(p[0], p[1]) for p in poly[0]]
        if not any(abs(x) < HALF_X and abs(z) < HALF_Z for x, z in ring):
            continue
        item = {"pin": f["properties"].get("PIN"), "acres": f["properties"].get("CALCACREAG"), "pts": ring}
        if item["pin"] == PIN:
            own = item
        else:
            parcels.append(item)
del txt
print("neighbors", len(parcels), "own", own and own["acres"])

# ---------- OSM ----------
osm = json.load(open(os.path.join(ROOT, "scripts", "osm_cache.json")))
buildings, roads, water = [], [], []
for e in osm["elements"]:
    t = e.get("tags", {})
    pts = [loc(p["lon"], p["lat"]) for p in e["geometry"]]
    if e["id"] in (520909784, 520909783):
        continue
    if "building" in t:
        buildings.append({"type": t["building"], "addr": " ".join(filter(None, [t.get("addr:housenumber"), t.get("addr:street")])), "pts": pts})
    elif "highway" in t:
        roads.append({"type": t["highway"], "name": t.get("name", ""), "pts": pts})
    elif t.get("natural") == "water":
        water.append({"pts": pts})

# ---------- contours -> terrain ----------
print("reading contours...")
cj = json.load(open(os.path.join(DATA, "mckeesrocks.geojson")))
to_sp = Transformer.from_crs("EPSG:4326", "EPSG:2272", always_xy=True)
bx0, by0 = to_sp.transform(lon_min - 0.002, lat_min - 0.002)
bx1, by1 = to_sp.transform(lon_max + 0.002, lat_max + 0.002)
clip = box(min(bx0, bx1), min(by0, by1), max(bx0, bx1), max(by0, by1))
samples, contours = [], []
for f in cj["features"]:
    el = f["properties"]["ELEVATION"]
    g = f["geometry"]
    lines = g["coordinates"] if g["type"] == "MultiLineString" else [g["coordinates"]]
    for line in lines:
        ls = LineString(line)
        if not ls.intersects(clip):
            continue
        ls = ls.intersection(clip)
        parts = [ls] if ls.geom_type == "LineString" else list(getattr(ls, "geoms", []))
        for part in parts:
            if part.geom_type != "LineString" or part.length < 1:
                continue
            dense = [part.interpolate(d) for d in np.arange(0, part.length, 6.0)] + [part.interpolate(part.length)]
            xs, ys = zip(*[(p.x, p.y) for p in dense])
            lo, la = to_ll.transform(np.array(xs), np.array(ys))
            loc_pts = [loc(a, b) for a, b in zip(lo, la)]
            samples.extend((x, z, el) for x, z in loc_pts)
            if el % 2 == 0:
                simp = LineString(loc_pts).simplify(1.5)
                contours.append({"e": el, "pts": [[round(x, 1), round(z, 1)] for x, z in simp.coords]})
print("contour samples", len(samples), "lines", len(contours))
S = np.array(samples)
nx = int(2 * HALF_X / STEP) + 1
nz = int(2 * HALF_Z / STEP) + 1
gx = np.linspace(-HALF_X, HALF_X, nx)
gz = np.linspace(-HALF_Z, HALF_Z, nz)
GX, GZ = np.meshgrid(gx, gz)
H = griddata(S[:, :2], S[:, 2], (GX, GZ), method="linear")
Hn = griddata(S[:, :2], S[:, 2], (GX, GZ), method="nearest")
H = np.where(np.isnan(H), Hn, H)
# light smoothing to soften TIN facets
from scipy.ndimage import gaussian_filter
H = gaussian_filter(H, 1.0)
hmin, hmax = float(H.min()), float(H.max())
scale = (hmax - hmin) / 65535.0
q = np.round((H - hmin) / scale).astype("<u2")
q.tofile(os.path.join(OUT, "terrain.bin"))


def sample(x, z):
    i = (x + HALF_X) / STEP; j = (z + HALF_Z) / STEP
    i0, j0 = int(i), int(j); fi, fj = i - i0, j - j0
    return float(H[j0, i0] * (1 - fi) * (1 - fj) + H[j0, i0 + 1] * fi * (1 - fj) + H[j0 + 1, i0] * (1 - fi) * fj + H[j0 + 1, i0 + 1] * fi * fj)


print("elev at house", sample(0, 0), "range", hmin, hmax)

site = {
    "origin": {"lat": LAT0, "lon": LON0, "address": "935 Al Smith Dr, McKees Rocks, PA 15136"},
    "house": {"x": -18.3, "z": -21.7, "rotDeg": -7.4, "note": "plan frame (sunroom NW corner) -> world"},
    "garageOSM": [[9.1, -86.7], [35.5, -86.8], [35.6, -56.4], [9.1, -56.4]],
    "parcel": own,
    "neighbors": parcels,
    "buildings": buildings,
    "roads": roads,
    "water": water,
    "terrain": {"file": "data/terrain.bin", "nx": nx, "nz": nz, "x0": -HALF_X, "z0": -HALF_Z, "step": STEP, "min": hmin, "scale": scale, "houseElev": sample(0, 0)},
    "contours": contours,
}
json.dump(site, open(os.path.join(OUT, "site.json"), "w"), separators=(",", ":"))
print("wrote", os.path.getsize(os.path.join(OUT, "site.json")), "bytes")
