#!/usr/bin/env python3
"""Emit {vector id: hash-of-our-answer} for everything this side can compute. ⚠ Silent on the rest."""
import json, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from run import dispatch, canon_hash, NotImplementedOp
ROOT = pathlib.Path(__file__).resolve().parents[2]
out = {}
for f in sorted((ROOT / 'vectors').glob('*.json')):
    for v in json.loads(f.read_text())['vectors']:
        try: out[v['id']] = canon_hash(dispatch(v['op'], v['in']))
        except NotImplementedOp: pass
        except Exception as e: print(f"# {v['id']} threw {e}", file=sys.stderr)
print(json.dumps(out))
