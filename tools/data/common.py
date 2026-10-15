"""Shared helpers for the data builders (tools/data/). Pure standard library.

Paths, deterministic JSON writing and the source-manifest lookup. Every builder reads raw files only
from sources/<id>/ (fetched and checksummed by tools/fetch-sources.mjs) and writes data/*.json.
"""
import datetime
import json
import math
import os

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
DATA = os.path.join(ROOT, 'data')
SOURCES = os.path.join(ROOT, 'sources')
MANIFEST = os.path.join(ROOT, 'tools', 'sources.json')


def manifest():
    with open(MANIFEST, encoding='utf-8') as f:
        return {s['id']: s for s in json.load(f)['sources']}


def source_path(source_id):
    """Absolute path of a fetched raw source; fails loudly if it is missing."""
    entry = manifest()[source_id]
    path = os.path.join(SOURCES, source_id, entry['file'])
    if not os.path.exists(path):
        raise SystemExit(f'missing source {source_id}: run  node tools/fetch-sources.mjs {source_id}')
    return path


def source_ref(source_id):
    """Short provenance record for meta blocks: id, URL and SHA-256 from tools/sources.json."""
    e = manifest()[source_id]
    return {'id': source_id, 'url': e['url'], 'sha256': e.get('sha256')}


def today():
    return datetime.date.today().isoformat()


def _check_finite(obj, where='$'):
    if isinstance(obj, float):
        if not math.isfinite(obj):
            raise ValueError(f'non-finite float at {where}')
    elif isinstance(obj, dict):
        for k, v in obj.items():
            _check_finite(v, f'{where}.{k}')
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            _check_finite(v, f'{where}[{i}]')


def write_json(name, obj, compact=False, rows_key=None):
    """Write data/<name> deterministically.

    Floats are written by Python's json module, which uses repr (shortest round-trip form), so full
    double precision is kept. compact=True writes no indentation; rows_key names a top-level list that
    is written one element per line (compact elements) for readable diffs.
    """
    _check_finite(obj)
    os.makedirs(DATA, exist_ok=True)
    path = os.path.join(DATA, name)
    if rows_key is not None:
        head = {k: v for k, v in obj.items() if k != rows_key}
        parts = ['{']
        items = sorted(head.items())
        for k, v in items:
            parts.append(json.dumps(k) + ':' + json.dumps(v, sort_keys=True, separators=(',', ':')) + ',')
        parts.append(json.dumps(rows_key) + ':[')
        rows = obj[rows_key]
        for i, r in enumerate(rows):
            parts.append(json.dumps(r, sort_keys=True, separators=(',', ':')) + (',' if i < len(rows) - 1 else ''))
        parts.append(']}')
        text = '\n'.join(parts) + '\n'
    elif compact:
        text = json.dumps(obj, sort_keys=True, separators=(',', ':')) + '\n'
    else:
        text = json.dumps(obj, sort_keys=True, indent=1) + '\n'
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    return path, os.path.getsize(path)


def read_json(name):
    with open(os.path.join(DATA, name), encoding='utf-8') as f:
        return json.load(f)


def register_sources(entries):
    """Add source entries to tools/sources.json (same shape as the others) if their id is new.

    An existing id with a different URL is an error: a changed query is a new source and needs a new
    id (or a deliberate manual edit), so recorded checksums never silently describe another file.
    Returns the ids that were added.
    """
    with open(MANIFEST, encoding='utf-8') as f:
        man = json.load(f)
    have = {s['id']: s for s in man['sources']}
    added = []
    for e in entries:
        if e['id'] in have:
            if have[e['id']]['url'] != e['url']:
                raise SystemExit(f"tools/sources.json already has {e['id']} with a different URL")
            continue
        entry = {'id': e['id'], 'file': e['file'], 'url': e['url'], 'bytes': None, 'md5': None, 'sha256': None,
                 'credit': e['credit'], 'usedFor': e['usedFor'], 'research': e['research']}
        man['sources'].append(entry)
        added.append(e['id'])
    if added:
        with open(MANIFEST, 'w', encoding='utf-8', newline='\n') as f:
            f.write(json.dumps(man, indent=2, ensure_ascii=False) + '\n')
    return added
