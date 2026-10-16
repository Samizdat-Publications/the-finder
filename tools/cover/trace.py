"""Vectorise etched strokes: threshold -> skeleton -> pruned pixel graph -> simplified polylines.

All coordinates are photo pixels (x right, y down) of GPN-2000-001978, pixel centres at integers.
"""
import numpy as np
import cv2
import networkx as nx
from scipy import ndimage as ndi
from skimage.morphology import skeletonize

N8 = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def skeleton_graph(mask):
    sk = skeletonize(mask)
    ys, xs = np.nonzero(sk)
    G = nx.Graph()
    pts = set(zip(xs.tolist(), ys.tolist()))
    for (x, y) in pts:
        G.add_node((x, y))
    for (x, y) in pts:
        for dx, dy in N8:
            q = (x + dx, y + dy)
            if q in pts and q > (x, y):
                # prefer 4-neighbours; skip a diagonal that closes a triangle
                G.add_edge((x, y), q, w=1.0 if dx == 0 or dy == 0 else 1.4142)
    # remove diagonal edges that duplicate a 4-neighbour path (triangles)
    for (x, y) in list(G.nodes):
        for dx, dy in [(-1, -1), (-1, 1), (1, -1), (1, 1)]:
            q = (x + dx, y + dy)
            if G.has_edge((x, y), q) and (G.has_edge((x, y), (x + dx, y)) and G.has_edge((x + dx, y), q) or
                                          G.has_edge((x, y), (x, y + dy)) and G.has_edge((x, y + dy), q)):
                G.remove_edge((x, y), q)
    return G


def _chains(G):
    """Split a graph into chains between nodes of degree != 2 (loops handled)."""
    seen = set()
    chains = []
    nodes = [n for n in G.nodes if G.degree(n) != 2]
    for n in nodes:
        for m in G.neighbors(n):
            e = frozenset((n, m))
            if e in seen:
                continue
            path = [n, m]
            seen.add(e)
            while G.degree(path[-1]) == 2:
                nxt = [k for k in G.neighbors(path[-1]) if k != path[-2]]
                if not nxt:
                    break
                k = nxt[0]
                e2 = frozenset((path[-1], k))
                if e2 in seen:
                    break
                seen.add(e2)
                path.append(k)
            chains.append(path)
    # pure loops
    for comp in nx.connected_components(G):
        if all(G.degree(n) == 2 for n in comp):
            start = next(iter(comp))
            path = [start]
            prev = None
            cur = start
            while True:
                nxt = [k for k in G.neighbors(cur) if k != prev]
                k = nxt[0]
                if k == start:
                    path.append(start)
                    break
                path.append(k)
                prev, cur = cur, k
            chains.append(path)
    return chains


def prune(G, spur):
    """Remove branches ending in a free end that are shorter than spur pixels (repeat until stable)."""
    changed = True
    while changed:
        changed = False
        for path in _chains(G):
            a, b = path[0], path[-1]
            if a == b:
                continue
            if (G.degree(a) == 1) != (G.degree(b) == 1) and len(path) < spur:
                free = a if G.degree(a) == 1 else b
                other = b if free == a else a
                if G.degree(other) >= 3:
                    for n in path:
                        if n != other:
                            G.remove_node(n)
                    changed = True
                    break
    return G


def polylines(mask, spur=6, eps=0.9, min_len=0):
    """Pruned skeleton of mask as simplified polylines [[(x, y), ...], ...]."""
    G = skeleton_graph(mask)
    prune(G, spur)
    out = []
    for path in _chains(G):
        P = np.array(path, np.float32).reshape(-1, 1, 2)
        closed = path[0] == path[-1]
        S = cv2.approxPolyDP(P, eps, closed).reshape(-1, 2)
        L = float(np.hypot(*np.diff(np.array(path, float), axis=0).T).sum())
        if L >= min_len:
            out.append([(float(x), float(y)) for x, y in S])
    return out


def clean_mask(d, thr, box, min_area=30):
    """Threshold d inside box=(x0,y0,x1,y1); drop specks smaller than min_area; bridge 1 px gaps."""
    x0, y0, x1, y1 = box
    m = np.zeros(d.shape, bool)
    m[y0:y1, x0:x1] = d[y0:y1, x0:x1] > thr
    m = ndi.binary_closing(m, np.ones((3, 3)))
    lab, n = ndi.label(m, np.ones((3, 3)))
    sizes = ndi.sum(m, lab, range(1, n + 1))
    keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= min_area])
    return keep


def ridge_path(d, waypoints, mid=55.0, width=10.0, dark=30.0, floor=0.05, box=None):
    """Minimum-cost path along the bright ridge of d through the waypoints (x, y), as a pixel list.

    cost = floor + dark * (1 - sigmoid((d - mid) / width)), so the path hugs the ridge and never pays less to cut across a dark gap.
    box=(x0,y0,x1,y1) restricts the search (cost is made huge outside it).
    """
    from skimage.graph import route_through_array
    cost = floor + dark / (1.0 + np.exp((np.clip(d, -50, 250) - mid) / width))
    if box is not None:
        x0, y0, x1, y1 = box
        mask = np.ones(cost.shape, bool)
        mask[y0:y1, x0:x1] = False
        cost = np.where(mask, 1e4, cost)
    path = []
    for a, b in zip(waypoints[:-1], waypoints[1:]):
        p, _ = route_through_array(cost, (int(round(a[1])), int(round(a[0]))), (int(round(b[1])), int(round(b[0]))),
                                   fully_connected=True, geometric=True)
        if path:
            p = p[1:]
        path += p
    return [(float(x), float(y)) for y, x in path]


def simplify(path, eps=0.9, smooth=1.5):
    """Smooth a pixel path lightly then Douglas-Peucker simplify (cv2.approxPolyDP)."""
    P = np.array(path, float)
    if smooth and len(P) > 5:
        k = np.exp(-0.5 * (np.arange(-3, 4) / smooth) ** 2)
        k /= k.sum()
        Q = P.copy()
        for j in range(2):
            pad = np.pad(P[:, j], 3, mode='edge')
            Q[:, j] = np.convolve(pad, k, mode='valid')
        Q[0], Q[-1] = P[0], P[-1]
        P = Q
    S = cv2.approxPolyDP(P.astype(np.float32).reshape(-1, 1, 2), eps, False).reshape(-1, 2)
    return [(float(x), float(y)) for x, y in S]


def skeleton_route(d, guide_path, a, b, thr=55.0, band=11, eps=0.7):
    """Skeleton of d > thr inside a band around guide_path, then the shortest skeleton route from the
    node nearest a to the node nearest b, simplified. Removes scratches and spurs that touch no route."""
    m = np.zeros(d.shape, bool)
    for x, y in guide_path:
        m[int(y), int(x)] = True
    m = ndi.binary_dilation(m, iterations=band) & (d > thr)
    m = ndi.binary_closing(m, np.ones((3, 3)))
    G = skeleton_graph(m)
    nodes = np.array(list(G.nodes), float)

    def near(p):
        i = int(np.argmin(np.hypot(nodes[:, 0] - p[0], nodes[:, 1] - p[1])))
        return tuple(int(v) for v in nodes[i])
    path = nx.shortest_path(G, near(a), near(b), weight='w')
    P = np.array(path, np.float32).reshape(-1, 1, 2)
    S = cv2.approxPolyDP(P, eps, False).reshape(-1, 2)
    return [(float(x), float(y)) for x, y in S]


def skeleton_route_box(d, box, a, b, thrs=(70, 60, 50, 42, 35), eps=0.7, bridge=9.0, ridge_ref=120.0, ridge_k=60.0):
    """Skeleton of d > thr inside box, then the shortest skeleton route from the node nearest a to the node
    nearest b (thresholds lowered until the two are connected), simplified. Spurs and scratches that are
    not on the route are ignored."""
    x0, y0, x1, y1 = box
    for thr in thrs:
        m = np.zeros(d.shape, bool)
        m[y0:y1, x0:x1] = d[y0:y1, x0:x1] > thr
        m = ndi.binary_closing(m, np.ones((3, 3)))
        G = skeleton_graph(m)
        nodes = np.array(list(G.nodes), float)
        # bridge small breaks (dim stretches of the etch) between different skeleton pieces
        from scipy.spatial import cKDTree
        comp = {}
        for ci, cset in enumerate(nx.connected_components(G)):
            for n in cset:
                comp[n] = ci
        tree = cKDTree(nodes)
        for i, j in tree.query_pairs(bridge):
            a_, b_ = tuple(int(v) for v in nodes[i]), tuple(int(v) for v in nodes[j])
            if comp[a_] != comp[b_]:
                G.add_edge(a_, b_, w=6.0 * float(np.hypot(*(nodes[i] - nodes[j]))))

        def near(p):
            i = int(np.argmin(np.hypot(nodes[:, 0] - p[0], nodes[:, 1] - p[1])))
            return tuple(int(v) for v in nodes[i])
        # prefer bright ridge pixels: a shortcut across the halo between two legs has much lower etch than the stroke
        for u_, v_, dat in G.edges(data=True):
            dm = 0.5 * (d[u_[1], u_[0]] + d[v_[1], v_[0]])
            dat['w'] = dat['w'] * (1.0 + ridge_k * (max(0.0, (ridge_ref - dm) / ridge_ref)) ** 2)
        try:
            path = nx.shortest_path(G, near(a), near(b), weight='w')
        except nx.NetworkXNoPath:
            continue
        P = np.array(path, np.float32).reshape(-1, 1, 2)
        S = cv2.approxPolyDP(P, eps, False).reshape(-1, 2)
        return [(float(x), float(y)) for x, y in S], thr
    raise RuntimeError('no skeleton route between the end points')


def extend_tips(d, poly, thr=60.0, max_ext=18.0, back=1.2, min_turn_deg=35.0, sampler=None):
    """A skeleton stops about half a stroke width short of a sharp tip. For every vertex whose path turns by
    more than min_turn_deg, march outward along the corner bisector while the etch is still above thr and
    move the vertex there (minus `back`, the half stroke width at the tip)."""
    from scipy import ndimage as _ndi
    P = [np.array(p, float) for p in poly]
    out = [P[0]]
    for i in range(1, len(P) - 1):
        a, v, b = P[i - 1], P[i], P[i + 1]
        u1, u2 = (v - a), (v - b)
        n1, n2 = np.hypot(*u1), np.hypot(*u2)
        if n1 < 1e-6 or n2 < 1e-6:
            out.append(v)
            continue
        u1 /= n1
        u2 /= n2
        cosang = np.clip(-(u1 @ u2), -1, 1)  # turn angle between incoming and outgoing directions
        turn = np.degrees(np.arccos(cosang))
        bis = u1 + u2
        nb = np.hypot(*bis)
        if turn < min_turn_deg or nb < 1e-6:
            out.append(v)
            continue
        t = bis / nb
        best = 0.0
        s = 0.0
        while s < max_ext:
            s += 0.5
            q = v + t * s
            val = _ndi.map_coordinates(d, [[q[1]], [q[0]]], order=1, mode='nearest')[0]
            if val < thr:
                break
            best = s
        out.append(v + t * max(0.0, best - back))
    out.append(P[-1])
    return [(float(x), float(y)) for x, y in out]


def envelope_trace(d, box, thr=60.0, open_size=3, thick=7, eps=0.8, shrink=1.3):
    """Trace a single-valued curve (with vertical runs) left to right from its etched band.

    Per column: upper and lower edge of the opened mask. Thin columns give the centre; tall columns (steep
    strokes) give the edge nearer the previous point then the other. Tips are pulled in by `shrink`
    (half stroke) so the centre line, not the outer edge, is returned. Result is Douglas-Peucker simplified.
    """
    x0, y0, x1, y1 = box
    m = np.zeros(d.shape, bool)
    m[y0:y1, x0:x1] = d[y0:y1, x0:x1] > thr
    m = ndi.binary_opening(m, np.ones((open_size, open_size)))
    pts = []
    for x in range(x0, x1):
        ys = np.nonzero(m[:, x])[0]
        if len(ys) == 0:
            continue
        u, l = float(ys.min()), float(ys.max())
        if l - u <= thick:
            pts.append((float(x), (u + l) / 2))
        else:
            if pts and abs(pts[-1][1] - u) > abs(pts[-1][1] - l):
                pts += [(float(x), l - shrink), (float(x), u + shrink)]
            else:
                pts += [(float(x), u + shrink), (float(x), l - shrink)]
    P = np.array(pts, np.float32).reshape(-1, 1, 2)
    S = cv2.approxPolyDP(P, eps, False).reshape(-1, 2)
    return [(float(a), float(b)) for a, b in S]


def walk_ridge(d, start, heading_deg, stop, max_steps=8000, step=1.0, look=2.5, turn_pen=0.3, min_ridge=15.0):
    """Follow a bright stroke from start (x, y) with initial heading (degrees, y down) until within 4 px of
    stop. Each step scores candidate headings (within +-175 deg) by the etch ahead minus a turn penalty
    (per degree) and refuses pixels near the path's older points, so it turns at sharp tips onto the
    other leg but never doubles back along itself. Returns the pixel path."""
    from scipy import ndimage as _ndi
    ds = _ndi.gaussian_filter(d, 0.8)
    pos = np.array(start, float)
    h = np.radians(heading_deg)
    path = [pos.copy()]
    cands = np.radians(np.arange(-175, 176, 7.0))
    for it in range(max_steps):
        if np.hypot(*(pos - np.array(stop))) < 4.0 and it > 20:
            break
        best = None
        older = np.array(path[:-14]) if len(path) > 14 else np.zeros((0, 2))
        for dh in cands:
            a = h + dh
            q = pos + look * np.array([np.cos(a), np.sin(a)])
            val = _ndi.map_coordinates(ds, [[q[1]], [q[0]]], order=1, mode='nearest')[0]
            if len(older):
                dist = np.hypot(older[:, 0] - q[0], older[:, 1] - q[1]).min()
                if dist < 1.7:
                    continue
            score = val - turn_pen * abs(np.degrees(dh))
            if best is None or score > best[0]:
                best = (score, a, val)
        if best is None or best[2] < min_ridge:
            break
        h = best[1]
        pos = pos + step * np.array([np.cos(h), np.sin(h)])
        path.append(pos.copy())
    return [(float(x), float(y)) for x, y in path]
