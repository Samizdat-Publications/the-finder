import json, struct, sys, math
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
path = sys.argv[1]
data = open(path, "rb").read()
magic, ver, total = struct.unpack_from("<4sII", data, 0)
jlen, jt = struct.unpack_from("<I4s", data, 12)
g = json.loads(data[20:20 + jlen].decode().rstrip("\x00 "))
bin_off = 20 + jlen + 8
accs, bvs = g["accessors"], g["bufferViews"]
def read_acc(i):
    a = accs[i]; bv = bvs[a["bufferView"]]
    comp = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2), 5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}[a["componentType"]]
    n = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
    stride = bv.get("byteStride") or comp[1] * n
    base = bin_off + bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    out = []
    for k in range(a["count"]):
        out.append(struct.unpack_from("<" + comp[0] * n, data, base + k * stride))
    return out
mesh = g["meshes"][0]; prim = mesh["primitives"][0]
node = [n for n in g["nodes"] if n.get("mesh") == 0][0]
tr = node.get("translation", [0, 0, 0])
pos = read_acc(prim["attributes"]["POSITION"]); uv = read_acc(prim["attributes"]["TEXCOORD_0"]); idx = [i[0] for i in read_acc(prim["indices"])]
print("verts", len(pos), "uvs", len(uv), "indices", len(idx), "node translation", tr)
W = [(p[0] + tr[0], p[1] + tr[1], p[2] + tr[2]) for p in pos]
tris = [(idx[i], idx[i + 1], idx[i + 2]) for i in range(0, len(idx), 3)]
def normal(t):
    a, b, c = (W[t[0]], W[t[1]], W[t[2]])
    u = (b[0]-a[0], b[1]-a[1], b[2]-a[2]); v = (c[0]-a[0], c[1]-a[1], c[2]-a[2])
    n = (u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0])
    l = math.sqrt(sum(x*x for x in n)) or 1
    return (n[0]/l, n[1]/l, n[2]/l)
# candidate region: +X face of the bus near the record
sel = []
for ti, t in enumerate(tris):
    cx = sum(W[v][0] for v in t) / 3; cy = sum(W[v][1] for v in t) / 3; cz = sum(W[v][2] for v in t) / 3
    if 0.80 <= cx <= 1.20 and abs(cz) <= 0.30 and -0.20 <= cy <= 0.40:
        n = normal(t)
        if abs(n[0]) > 0.85:
            sel.append(ti)
print("triangles in candidate region with +/-X normal:", len(sel))
# connected components by shared vertex
parent = {}
def find(x):
    while parent.setdefault(x, x) != x:
        parent[x] = parent[parent[x]]; x = parent[x]
    return x
for ti in sel:
    t = tris[ti]
    for v in t[1:]:
        parent[find(v)] = find(t[0])
comps = {}
for ti in sel:
    comps.setdefault(find(tris[ti][0]), []).append(ti)
rows = []
for root, tl in comps.items():
    vs = set(v for ti in tl for v in tris[ti])
    ys = [W[v][1] for v in vs]; zs = [W[v][2] for v in vs]; xs = [W[v][0] for v in vs]
    us = [uv[v][0] for v in vs]; vv = [uv[v][1] for v in vs]
    rows.append((len(tl), max(ys) - min(ys), max(zs) - min(zs), sum(xs)/len(xs), (min(us), max(us)), (min(vv), max(vv)), (min(ys)+max(ys))/2, (min(zs)+max(zs))/2, max(xs), min(xs)))
rows.sort(key=lambda r: -r[0])
for r in rows[:12]:
    print("tris=%4d  size_y=%.3f m size_z=%.3f m  mean_x=%.3f  U[%.3f..%.3f] (%.0f px)  V[%.3f..%.3f] (%.0f px)" % (r[0], r[1], r[2], r[3], r[4][0], r[4][1], (r[4][1]-r[4][0])*1024, r[5][0], r[5][1], (r[5][1]-r[5][0])*1024))
print()
for r in rows[:1]:
    print("DISC centre (glTF world, metres): x=%.3f (face plane, spans %.3f..%.3f)  y=%.3f  z=%.3f ; diameter %.3f m" % (r[3], r[9], r[8], r[6], r[7], r[1]))
