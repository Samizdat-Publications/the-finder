"""Inspect remote GLB files using HTTP HEAD + Range requests only (no full download).
Prints: size, range support, node/mesh/material/texture/image summary, triangle/vertex counts,
embedded image byte sizes + pixel dimensions (PNG/JPEG header parse), and any node/mesh/material
names that look like a record / disc / golden / cover / plaque.
"""
import json, struct, sys, urllib.request, re

UA = {"User-Agent": "Mozilla/5.0 (research script)"}

def head(url):
    req = urllib.request.Request(url, method="HEAD", headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status, dict(r.headers.items()), r.geturl()

def rng(url, a, b):
    h = dict(UA)
    h["Range"] = "bytes=%d-%d" % (a, b)
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status, dict(r.headers.items()), r.read()

def png_dims(b):
    if b[:8] == b"\x89PNG\r\n\x1a\n":
        w, h = struct.unpack(">II", b[16:24])
        return "PNG %dx%d" % (w, h)
    return None

def jpeg_dims(b):
    if b[:2] != b"\xff\xd8":
        return None
    i = 2
    while i + 9 < len(b):
        if b[i] != 0xFF:
            i += 1
            continue
        m = b[i + 1]
        if m in (0xC0, 0xC1, 0xC2, 0xC3):
            h, w = struct.unpack(">HH", b[i + 5:i + 9])
            return "JPEG %dx%d" % (w, h)
        seglen = struct.unpack(">H", b[i + 2:i + 4])[0]
        i += 2 + seglen
    return "JPEG (dims not found in first bytes)"

def analyze(url):
    print("=" * 100)
    print(url)
    try:
        st, hd, final = head(url)
        print("HEAD:", st, "len=", hd.get("Content-Length"), "type=", hd.get("Content-Type"),
              "accept-ranges=", hd.get("Accept-Ranges"), "ACAO=", hd.get("Access-Control-Allow-Origin"),
              "last-mod=", hd.get("Last-Modified"))
        if final != url:
            print("final URL:", final)
    except Exception as e:
        print("HEAD ERR", e)
    try:
        st, hd, first = rng(url, 0, 19)
    except Exception as e:
        print("RANGE ERR", e)
        return
    print("Range status:", st, "Content-Range:", hd.get("Content-Range"))
    magic, ver, total = struct.unpack("<4sII", first[:12])
    jlen, jtype = struct.unpack("<I4s", first[12:20])
    print("magic", magic, "version", ver, "total_len", total, "json_len", jlen, jtype)
    if magic != b"glTF":
        print("Not a GLB")
        return
    st, hd, jb = rng(url, 20, 20 + jlen - 1)
    g = json.loads(jb.decode("utf-8").rstrip("\x00 "))
    print("asset:", g.get("asset"))
    print("extensionsUsed:", g.get("extensionsUsed"), "extensionsRequired:", g.get("extensionsRequired"))
    nodes = g.get("nodes", [])
    meshes = g.get("meshes", [])
    mats = g.get("materials", [])
    texs = g.get("textures", [])
    imgs = g.get("images", [])
    accs = g.get("accessors", [])
    bvs = g.get("bufferViews", [])
    print("counts: nodes=%d meshes=%d materials=%d textures=%d images=%d accessors=%d bufferViews=%d animations=%d" % (
        len(nodes), len(meshes), len(mats), len(texs), len(imgs), len(accs), len(bvs), len(g.get("animations", []))))
    # triangle / vertex counts (per mesh, then total as instanced by nodes)
    def mesh_tris(m):
        t = v = 0
        for p in m.get("primitives", []):
            mode = p.get("mode", 4)
            pos = p.get("attributes", {}).get("POSITION")
            if pos is not None:
                v += accs[pos]["count"]
            if "indices" in p:
                n = accs[p["indices"]]["count"]
            elif pos is not None:
                n = accs[pos]["count"]
            else:
                n = 0
            if mode == 4:
                t += n // 3
            elif mode in (5, 6):
                t += max(n - 2, 0)
        return t, v
    per_mesh = [mesh_tris(m) for m in meshes]
    print("unique-mesh totals: tris=%d verts=%d" % (sum(t for t, _ in per_mesh), sum(v for _, v in per_mesh)))
    # instanced total through the scene graph
    inst_t = inst_v = 0
    def walk(ni):
        nonlocal inst_t, inst_v
        n = nodes[ni]
        if "mesh" in n:
            t, v = per_mesh[n["mesh"]]
            inst_t += t
            inst_v += v
        for c in n.get("children", []):
            walk(c)
    scenes = g.get("scenes", [])
    if scenes:
        for r in scenes[g.get("scene", 0)].get("nodes", []):
            walk(r)
    print("instanced scene totals: tris=%d verts=%d" % (inst_t, inst_v))
    # names
    pat = re.compile(r"record|disc|disk|golden|cover|plaque|gold|phono|stylus|cartridge|lp", re.I)
    names = []
    for i, n in enumerate(nodes):
        nm = n.get("name", "")
        names.append(nm)
    print("node names (%d):" % len(names), names[:80] if len(names) <= 80 else names[:80] + ["..."])
    print("mesh names:", [m.get("name") for m in meshes][:60])
    print("material names:", [m.get("name") for m in mats][:60])
    hits = [("node", n.get("name")) for n in nodes if pat.search(n.get("name", "") or "")]
    hits += [("mesh", m.get("name")) for m in meshes if pat.search(m.get("name", "") or "")]
    hits += [("material", m.get("name")) for m in mats if pat.search(m.get("name", "") or "")]
    print("RECORD-LIKE NAME HITS:", hits)
    # images
    bin_start = 20 + jlen + 8  # start of BIN chunk payload
    for i, im in enumerate(imgs):
        info = {"name": im.get("name"), "mimeType": im.get("mimeType"), "uri": (im.get("uri") or "")[:80] or None}
        if "bufferView" in im:
            bv = bvs[im["bufferView"]]
            off = bin_start + bv.get("byteOffset", 0)
            ln = bv["byteLength"]
            info["bytes"] = ln
            try:
                _, _, head_b = rng(url, off, off + min(ln, 4096) - 1)
                info["dims"] = png_dims(head_b) or jpeg_dims(head_b)
            except Exception as e:
                info["dims"] = "ERR %s" % e
        print("image", i, info)
    # material summary
    for i, m in enumerate(mats[:30]):
        pbr = m.get("pbrMetallicRoughness", {})
        print("material", i, m.get("name"), "baseColorFactor=", pbr.get("baseColorFactor"), "baseColorTex=", pbr.get("baseColorTexture"),
              "metal=", pbr.get("metallicFactor"), "rough=", pbr.get("roughnessFactor"), "emissive=", m.get("emissiveFactor"),
              "normalTex=", bool(m.get("normalTexture")), "alphaMode=", m.get("alphaMode"))
    # bounding box of POSITION accessors (scene units) -> approximate overall extents of the first few
    ext = []
    for m in meshes:
        for p in m.get("primitives", []):
            pos = p.get("attributes", {}).get("POSITION")
            if pos is not None and "min" in accs[pos] and "max" in accs[pos]:
                ext.append((accs[pos]["min"], accs[pos]["max"]))
    if ext:
        mn = [min(e[0][k] for e in ext) for k in range(3)]
        mx = [max(e[1][k] for e in ext) for k in range(3)]
        print("overall mesh-local bounds (ignores node transforms): min", mn, "max", mx, "size", [round(mx[k] - mn[k], 3) for k in range(3)])
    return g

if __name__ == "__main__":
    for u in sys.argv[1:]:
        analyze(u)
