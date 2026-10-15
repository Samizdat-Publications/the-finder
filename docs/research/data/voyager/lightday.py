import json, math, sys, urllib.request, urllib.parse

C = 299792.458  # km/s
LIGHT_DAY_KM = C * 86400.0  # 25,902,068,371.2 km

def horizons(command, center, start, stop, step, table="3", ephem_type="VECTORS", extra=None):
    params = {
        "format": "json",
        "COMMAND": "'%s'" % command,
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'%s'" % ephem_type,
        "CENTER": "'%s'" % center,
        "START_TIME": "'%s'" % start,
        "STOP_TIME": "'%s'" % stop,
        "STEP_SIZE": "'%s'" % step,
        "OUT_UNITS": "'KM-S'",
        "CSV_FORMAT": "'YES'",
    }
    if ephem_type == "VECTORS":
        params["VEC_TABLE"] = "'%s'" % table
    if extra:
        params.update(extra)
    url = "https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=90) as r:
        hdrs = dict(r.headers.items())
        body = r.read().decode("utf-8")
    d = json.loads(body)
    return d["result"], hdrs, url

def parse_vectors(result):
    soe = result.index("$$SOE")
    eoe = result.index("$$EOE")
    rows = []
    for line in result[soe + 5:eoe].strip().split("\n"):
        c = [x.strip() for x in line.split(",")]
        rows.append({
            "jd": float(c[0]), "date": c[1],
            "x": float(c[2]), "y": float(c[3]), "z": float(c[4]),
            "vx": float(c[5]), "vy": float(c[6]), "vz": float(c[7]),
            "lt": float(c[8]), "rg": float(c[9]), "rr": float(c[10]),
        })
    return rows

if __name__ == "__main__":
    # Voyager 1 from geocenter, daily over 2026-10-15 .. 2026-12-31
    res, hdrs, url = horizons("-31", "500@399", "2026-10-15", "2026-12-31", "1 d")
    rows = parse_vectors(res)
    print("Response headers:", {k: v for k, v in hdrs.items()})
    print("Light-day (km):", LIGHT_DAY_KM)
    prev = None
    for r in rows:
        flag = ""
        if prev is not None and prev["rg"] < LIGHT_DAY_KM <= r["rg"]:
            flag = "  <-- crossing between %s and %s" % (prev["date"], r["date"])
        if r["date"].endswith("00:00:00.0000") and (rows.index(r) % 5 == 0 or flag):
            print(r["date"], "RG=%.6e km" % r["rg"], "LT=%.1f s (%.4f h)" % (r["lt"], r["lt"] / 3600.0), "RR=%.3f km/s" % r["rr"], flag)
        prev = r
    # Refine: hourly step across the crossing window
    cross = None
    for a, b in zip(rows[:-1], rows[1:]):
        if a["rg"] < LIGHT_DAY_KM <= b["rg"]:
            cross = (a, b)
            break
    if cross:
        a, b = cross
        # find hour-level refinement by querying 1h steps from a's date for 3 days
        start = a["date"].replace("A.D. ", "")
        # Horizons accepts 'YYYY-Mon-DD HH:MM'
        import datetime
        d0 = datetime.datetime.strptime(start.split(" ")[0], "%Y-%b-%d")
        d1 = d0 + datetime.timedelta(days=3)
        res2, _, _ = horizons("-31", "500@399", d0.strftime("%Y-%m-%d"), d1.strftime("%Y-%m-%d"), "10 m")
        rows2 = parse_vectors(res2)
        prev = None
        for r in rows2:
            if prev is not None and prev["rg"] < LIGHT_DAY_KM <= r["rg"]:
                print("Geometric 1 light-day crossing between", prev["date"], "and", r["date"], "(TDB)")
                break
            prev = r
