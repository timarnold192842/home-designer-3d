import math, sys, urllib.request

LAT0, LON0 = 40.477115, -80.086343
FT = 3.28084
KX = math.cos(math.radians(LAT0)) * 111320 * FT
KY = 110574 * FT

SOURCES = {
    "naip": "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage?bbox={b}&bboxSR=4326&imageSR=4326&size={w},{h}&format=jpg&f=image",
    "pasda": "https://imagery.pasda.psu.edu/arcgis/rest/services/pasda/AlleghenyCountyImagery2017/MapServer/export?bbox={b}&bboxSR=4326&imageSR=4326&size={w},{h}&format=jpg&f=image",
}


def get(src, hx, hz, w, name):
    b = (LON0 - hx / KX, LAT0 - hz / KY, LON0 + hx / KX, LAT0 + hz / KY)
    h = round(w * (2 * hz / KY) / (2 * hx / KX))
    url = SOURCES[src].format(b=",".join("%.7f" % v for v in b), w=w, h=h)
    data = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "home-designer-3d"}), timeout=120).read()
    open(name, "wb").write(data)
    print(src, name, len(data), w, h)


src = sys.argv[1]
get(src, 900, 1000, 2048, "data/aerial_far.jpg")
get(src, 200, 200, 2048, "data/aerial_near.jpg")
