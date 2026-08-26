#!/bin/sh
# ★★★ SEAL THE VECTORS — and a hash is only written if BOTH languages produce it independently.
#
# ⚠⚠ THE TEMPTATION THIS EXISTS TO REFUSE: run one implementation, write down what it said, and call
# that the expected answer. That records a bug as a standard. Every hash below is computed twice, by
# two runners that share no code, and a disagreement STOPS THE SEAL rather than picking a winner.
#
#   sh runner/seal.sh            propose hashes and report agreement
#   sh runner/seal.sh --write    …and write them into the vector files
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

python3 runner/python/propose.py > /tmp/wc-py.json
node    runner/js/propose.mjs    > /tmp/wc-js.json

python3 - "$@" <<'PY'
import json, sys, pathlib
py = json.load(open('/tmp/wc-py.json'))
js = json.load(open('/tmp/wc-js.json'))
ids = sorted(set(py) | set(js))
agree, differ, missing = [], [], []
for i in ids:
    a, b = py.get(i), js.get(i)
    if a is None or b is None: missing.append((i, a, b))
    elif a == b:               agree.append((i, a))
    else:                      differ.append((i, a, b))

for i, a, b in differ:
    print(f"  ⚠⚠ DISAGREE  {i}\n      python {a}\n      js     {b}")
for i, a, b in missing:
    print(f"  ⚠ only one side produced {i}  (py={'yes' if a else 'no'} js={'yes' if b else 'no'})")

print(f"\n  {len(agree)} agree · {len(differ)} DISAGREE · {len(missing)} one-sided\n")
if differ or missing:
    print("  ⇒ nothing written. A divergence is the harness working — read it before you seal it.")
    sys.exit(1)

if '--write' not in sys.argv:
    print("  ⇒ all agree. Re-run with --write to seal.")
    sys.exit(0)

h = dict(agree)
n = 0
for f in sorted(pathlib.Path('vectors').glob('*.json')):
    doc = json.loads(f.read_text())
    for v in doc['vectors']:
        if v['id'] in h and v.get('hash') != h[v['id']]:
            v['hash'] = h[v['id']]; n += 1
    f.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + '\n')
print(f"  ✓ sealed {n} hashes, agreed by two independent implementations")
PY
