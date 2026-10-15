import sys, math, json, re, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from lightday import horizons, parse_vectors
AU = 149597870.7
print("=== NOW snapshot (2026-10-15 19:00 TDB ~ 18:59 UTC) ===")
for name, cmd in (("Voyager 1", "-31"), ("Voyager 2", "-32")):
    for cname, ctr in (("Sun", "500@10"), ("Earth(geocenter)", "500@399")):
        res, hdrs, url = horizons(cmd, ctr, "2026-10-15 19:00", "2026-10-15 19:01", "1 m")
        r = parse_vectors(res)[0]
        sp = math.sqrt(r["vx"]**2 + r["vy"]**2 + r["vz"]**2)
        print("%-9s from %-16s: range = %.4e km = %.3f AU | LT = %.1f s = %.3f h = %.4f light-days | range-rate = %+.3f km/s | |v| = %.3f km/s" % (
            name, cname, r["rg"], r["rg"]/AU, r["lt"], r["lt"]/3600, r["lt"]/86400, r["rr"], sp))
print("\nExample request URL (V1, heliocentric):")
print(url.replace("500%40399", "500@399"))
print("\n=== Ephemeris coverage probe: V1 vectors, yearly steps ===")
for stop in ("2030-12-31", "2050-01-01", "2100-01-01", "2200-01-01"):
    try:
        res, _, _ = horizons("-31", "500@10", "2026-01-01", stop, "5 y" if stop > "2050" else "1 y")
        rows = parse_vectors(res)
        print("stop", stop, "-> OK rows:", len(rows), "last:", rows[-1]["date"], "RG=%.3e km (%.1f AU)" % (rows[-1]["rg"], rows[-1]["rg"]/AU))
    except Exception as e:
        # Horizons returns the error text in the JSON result or error field
        msg = str(e)[:300]
        print("stop", stop, "-> EXC", msg)
