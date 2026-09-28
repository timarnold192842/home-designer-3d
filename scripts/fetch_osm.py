import json, sys, urllib.request, urllib.parse

q = """[out:json][timeout:50];
(way["building"](40.4740,-80.0895,40.4805,-80.0840);
 way["highway"](40.4730,-80.0905,40.4815,-80.0830);
 way["natural"="water"](40.4740,-80.0895,40.4805,-80.0840););
out geom;"""
for url in ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"]:
    try:
        req = urllib.request.Request(url, data=urllib.parse.urlencode({"data": q}).encode(), headers={"User-Agent": "home-designer-3d/1.0"})
        raw = urllib.request.urlopen(req, timeout=60).read()
        d = json.loads(raw)
        break
    except Exception as e:
        print("fail", url, e)
json.dump(d, open("/tmp/osm.json", "w"))
for e in d["elements"]:
    t = e.get("tags", {}); g = e["geometry"]
    la = sum(p["lat"] for p in g) / len(g); lo = sum(p["lon"] for p in g) / len(g)
    print(e["id"], t.get("building"), t.get("highway"), t.get("name"), t.get("addr:housenumber"), t.get("addr:street"), round(la, 6), round(lo, 6), len(g))
