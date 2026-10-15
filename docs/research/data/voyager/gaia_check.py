import sys, json, math, urllib.request, urllib.parse
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
UA = {"User-Agent": "Mozilla/5.0 (research script)"}
def tap(query):
    url = "https://gea.esac.esa.int/tap-server/tap/sync?" + urllib.parse.urlencode({"REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "json", "QUERY": query})
    return json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read().decode("utf-8"))
ids = {"Gl 445": 1129149723913123456, "Ross 248": 1926461164913660160, "TYC 3135-52-1": 2051984436005124480, "Proxima": 5853498713160606720}
q = ("SELECT source_id, ra, dec, parallax, parallax_error, pmra, pmdec, radial_velocity, radial_velocity_error, ruwe "
     "FROM gaiadr3.gaia_source WHERE source_id IN (%s)" % ",".join(str(v) for v in ids.values()))
res = tap(q)
cols = [c["name"] for c in res["metadata"]]
rows = [dict(zip(cols, r)) for r in res["data"]]
for r in rows:
    print({k: (round(v, 5) if isinstance(v, float) else v) for k, v in r.items()})
# DR2 values for comparison
q2 = ("SELECT source_id, ra, dec, parallax, pmra, pmdec, radial_velocity FROM gaiadr2.gaia_source WHERE source_id IN (%s)" % ",".join(str(v) for v in ids.values()))
res2 = tap(q2); cols2 = [c["name"] for c in res2["metadata"]]
print("--- DR2 ---")
for r in res2["data"]:
    print({k: (round(v, 5) if isinstance(v, float) else v) for k, v in zip(cols2, r)})

K = 4.740470446  # km/s per (mas/yr * kpc) -> v_t = K * mu[mas/yr] / parallax[mas]
PC_KM = 3.0856775814913673e13
YR_S = 365.25 * 86400
def star_state(r):
    ra, dec = math.radians(r["ra"]), math.radians(r["dec"])
    d_pc = 1000.0 / r["parallax"]
    # unit vectors
    rhat = (math.cos(dec) * math.cos(ra), math.cos(dec) * math.sin(ra), math.sin(dec))
    ahat = (-math.sin(ra), math.cos(ra), 0.0)
    dhat = (-math.sin(dec) * math.cos(ra), -math.sin(dec) * math.sin(ra), math.cos(dec))
    vt_a = K * r["pmra"] / r["parallax"]   # pmra already includes cos(dec)
    vt_d = K * r["pmdec"] / r["parallax"]
    vr = r["radial_velocity"]
    v = tuple(vr * rhat[i] + vt_a * ahat[i] + vt_d * dhat[i] for i in range(3))
    pos = tuple(d_pc * PC_KM * rhat[i] for i in range(3))   # km
    return pos, v, d_pc

def closest(pos, v_star, v_craft):
    vrel = tuple(v_star[i] - v_craft[i] for i in range(3))
    vr2 = sum(c * c for c in vrel)
    t = -sum(pos[i] * vrel[i] for i in range(3)) / vr2          # seconds from now (craft starts at the Sun; offset negligible)
    dmin = math.sqrt(sum((pos[i] + vrel[i] * t) ** 2 for i in range(3))) / PC_KM
    return t / YR_S / 1000.0, dmin, math.sqrt(vr2)

def craft_vec(ra_deg, dec_deg, v):
    ra, dec = math.radians(ra_deg), math.radians(dec_deg)
    return (v * math.cos(dec) * math.cos(ra), v * math.cos(dec) * math.sin(ra), v * math.sin(dec))
V1 = craft_vec(262.8760, 12.3199, 16.6048)
V2 = craft_vec(316.2717, -67.5491, 14.8550)
by_id = {r["source_id"]: r for r in rows}
print("\nLinear-motion estimate with Gaia DR3 astrometry (no Galactic potential), asymptotic craft velocities from Bailer-Jones & Farnocchia 2019:")
for name, craft, cv in (("Gl 445", "Voyager 1", V1), ("TYC 3135-52-1", "Voyager 1", V1), ("Proxima", "Voyager 1", V1), ("Ross 248", "Voyager 2", V2), ("Proxima", "Voyager 2", V2)):
    r = by_id.get(ids[name])
    if not r or r.get("radial_velocity") is None:
        print(name, craft, "-> missing DR3 data / RV"); continue
    pos, v, d = star_state(r)
    t, dmin, vrel = closest(pos, v, cv)
    print("%-14s vs %-9s: d_now=%.2f pc  t_min=%.1f kyr  d_min=%.3f pc (%.2f ly)  v_rel=%.1f km/s" % (name, craft, d, t, dmin, dmin * 3.26156, vrel))
