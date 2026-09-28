# 935 Al Smith Dr — 3D Home & Site Studio

Interactive, to-scale 3D model of the house and its 6.6-acre lot, built in the browser with three.js (no build step).

**Live:** https://timarnold192842.github.io/home-designer-3d/

## What's in it
- **House** transcribed from the iGUIDE scan (May 2026): basement walkout, main floor, 2nd floor, attic, roofs (7/12, 10/12 dormer, sunroom shed), porch, west patio cover, chimney, stairs, detached garage.
- **Site** on real data: Allegheny County parcel 0110-M-00207 (bearings + lengths), 2-ft county contours → terrain, OSM building footprints/roads, USGS NAIP aerial imagery, woods detected from imagery, approximate easements from the survey.
- **Modes:** Explore (cutaway levels, 2D plan, x-ray), Walk-through (first person, stairs, collisions), Redesign (walls/rooms/doors/windows, exterior finishes), Decorate (70+ items, staging presets), Landscape (growing trees, shrubs, patios, paths, fences, ground paint, terrain sculpt with cut/fill, clear woods), Site & Lot (slope/elevation/sun-hours maps), Sun & Seasons (accurate sun, shadows, foliage, night).
- Planning **cost estimate**, named **designs** saved in the browser, JSON export/import, PNG snapshots.

## Run locally
```
python3 scripts/devserver.py 8766   # then open http://localhost:8766
```

## Rebuild data
```
python3 -m venv /tmp/geo && /tmp/geo/bin/pip install pyproj shapely numpy scipy pillow
/tmp/geo/bin/python scripts/fetch_osm.py      # refresh OSM cache (optional)
/tmp/geo/bin/python scripts/build_site.py     # needs ../parcels.geojson and ../mckeesrocks.geojson
/tmp/geo/bin/python scripts/fetch_aerial.py naip
/tmp/geo/bin/python scripts/detect_trees.py
```

Dimensions are approximate; verify before building. Data: iGUIDE/Planitar scan, Allegheny County GIS, © OpenStreetMap contributors, USGS NAIP (public domain).
