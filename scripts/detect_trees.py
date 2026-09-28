"""Detect tree canopy from NAIP aerial (data/aerial_far.jpg) and write data/canopy.json.

Points are world feet (x east, z south) relative to site origin; r is a crown radius estimate.
"""
import json, os, random
import numpy as np
from PIL import Image
from scipy.ndimage import uniform_filter, binary_opening

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
img = np.asarray(Image.open(os.path.join(ROOT, "data/aerial_far.jpg")).convert("RGB")).astype(float)
H, W, _ = img.shape
X0, X1, Z0, Z1 = -900, 900, -1000, 1000
r, g, b = img[..., 0], img[..., 1], img[..., 2]
lum = 0.3 * r + 0.59 * g + 0.11 * b
exg = 2 * g - r - b
dark = uniform_filter(lum, 5)
mean = uniform_filter(lum, 7)
std = np.sqrt(np.maximum(uniform_filter(lum * lum, 7) - mean * mean, 0))
green = uniform_filter(exg, 5) > 8
# woods are textured (crowns + shadows); lawns are smooth even when similar in hue
mask = green & ((dark < 92) | (std > 13))
mask = binary_opening(mask, iterations=2)
density = uniform_filter(mask.astype(float), 9)

random.seed(7)
pts = []
step = 13.0
for zc in np.arange(Z0 + 10, Z1 - 10, step):
    for xc in np.arange(X0 + 10, X1 - 10, step):
        x = xc + random.uniform(-4, 4); z = zc + random.uniform(-4, 4)
        if abs(x) < 70 and abs(z) < 90:
            continue  # house/garage yard is handled by hand-placed trees
        if x * x + z * z > 820 ** 2:
            continue
        px = int((x - X0) / (X1 - X0) * (W - 1)); pz = int((z - Z0) / (Z1 - Z0) * (H - 1))
        if density[pz, px] > 0.55:
            pts.append([round(x, 1), round(z, 1), round(random.uniform(9, 15), 1)])
json.dump(pts, open(os.path.join(ROOT, "data/canopy.json"), "w"), separators=(",", ":"))
print("trees", len(pts), "mask frac", mask.mean())
