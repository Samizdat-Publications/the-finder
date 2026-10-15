"""How coarse can a precomputed Voyager trajectory table be?
Fetch truth (5-day steps) and nodes (30/90/180-day steps) from Horizons (heliocentric ecliptic J2000, km, km/s),
interpolate nodes with cubic Hermite, report max position error vs truth over 2000-2100."""
import sys, os, math, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from lightday import horizons, parse_vectors

def hermite(t, t0, t1, p0, p1, v0, v1):
    h = t1 - t0
    s = (t - t0) / h
    h00 = 2 * s**3 - 3 * s**2 + 1
    h10 = s**3 - 2 * s**2 + s
    h01 = -2 * s**3 + 3 * s**2
    h11 = s**3 - s**2
    return [h00 * p0[i] + h10 * h * v0[i] + h01 * p1[i] + h11 * h * v1[i] for i in range(3)]

for name, cmd in (("Voyager 1", "-31"), ("Voyager 2", "-32")):
    truth = parse_vectors(horizons(cmd, "500@10", "2000-01-01", "2099-12-31", "5 d")[0])
    print("\n%s: truth rows (5 d): %d" % (name, len(truth)))
    for step_label, step in (("30 d", 30), ("90 d", 90), ("180 d", 180), ("365.25 d", 365.25)):
        nodes = parse_vectors(horizons(cmd, "500@10", "2000-01-01", "2099-12-31", step_label)[0])
        nj = [n["jd"] for n in nodes]
        maxerr = 0.0; maxerr_at = None
        for r in truth:
            # locate bracketing nodes
            lo, hi = 0, len(nj) - 1
            if r["jd"] <= nj[0] or r["jd"] >= nj[-1]:
                continue
            while hi - lo > 1:
                mid = (lo + hi) // 2
                if nj[mid] <= r["jd"]:
                    lo = mid
                else:
                    hi = mid
            a, b = nodes[lo], nodes[hi]
            # use seconds as time unit so velocity (km/s) is consistent
            t0, t1, t = a["jd"] * 86400.0, b["jd"] * 86400.0, r["jd"] * 86400.0
            p = hermite(t, t0, t1, (a["x"], a["y"], a["z"]), (b["x"], b["y"], b["z"]), (a["vx"], a["vy"], a["vz"]), (b["vx"], b["vy"], b["vz"]))
            err = math.sqrt((p[0] - r["x"])**2 + (p[1] - r["y"])**2 + (p[2] - r["z"])**2)
            if err > maxerr:
                maxerr, maxerr_at = err, r["date"]
        print("  nodes every %-8s: %5d rows -> max Hermite position error vs truth = %.3f km (at %s)" % (step_label, len(nodes), maxerr, maxerr_at))
