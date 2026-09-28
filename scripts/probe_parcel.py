import json, re, sys

PIN = "0110M00207000000"
path = sys.argv[1]
buf = open(path, "r").read()
i = buf.find(PIN)
start = buf.rfind('{"geometry"', 0, i)
depth = 0
for j in range(start, len(buf)):
    c = buf[j]
    if c == '{':
        depth += 1
    elif c == '}':
        depth -= 1
        if depth == 0:
            break
feat = json.loads(buf[start:j + 1])
print(json.dumps(feat["properties"]))
coords = feat["geometry"]["coordinates"]
print(feat["geometry"]["type"], len(coords[0]) if feat["geometry"]["type"] == "Polygon" else [len(p[0]) for p in coords])
json.dump(feat, open(sys.argv[2], "w"))
