#!/usr/bin/env python3
"""
The Python vector runner.

⚠⚠ WRITTEN FROM `vectors/SCHEMA.md`, NOT PORTED FROM THE JAVASCRIPT ONE. That is the whole point: two
implementations that share no code, asked the same question. A port would agree with its source about
the things its source got wrong, which is precisely the failure the vectors exist to find.

Usage:
    python3 runner/python/run.py [--selftest]
"""
import hashlib
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "impl" / "python"))


# ── ⚠⚠ THE CANONICAL FORM ──────────────────────────────────────────────────────────────────────────
# Bytes, never JSON text. JSON has key order, whitespace and number formatting, and all three differ
# between languages — hashing the text would make the harness agree with itself and nothing else.

def _uvarint(n: int) -> bytes:
    """unsigned LEB128"""
    if n < 0:
        raise ValueError("uvarint is unsigned")
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        out.append(b | (0x80 if n else 0))
        if not n:
            return bytes(out)


def _zigzag(n: int) -> int:
    return (n << 1) ^ (n >> 63)


def canon(v) -> bytes:
    """Serialize a value to its canonical bytes. ⚠ Refuses floats, deliberately."""
    if v is None:
        return b"\x00"
    if v is True:
        return b"\x02"
    if v is False:
        return b"\x01"
    if isinstance(v, float):
        # ⚠⚠ IEEE round-tripping between languages is the exact silent divergence this harness is for.
        raise TypeError("canon: floats are refused — a satoshi is an integer")
    if isinstance(v, int):
        return b"\x03" + _uvarint(_zigzag(v))
    if isinstance(v, str):
        b = v.encode("utf-8")
        return b"\x04" + _uvarint(len(b)) + b
    if isinstance(v, (bytes, bytearray)):
        return b"\x05" + _uvarint(len(v)) + bytes(v)
    if isinstance(v, list):
        return b"\x06" + _uvarint(len(v)) + b"".join(canon(x) for x in v)
    if isinstance(v, dict):
        # ★ {"hex": "…"} is the wire spelling of a byte string — one key, and it must be the only one.
        if set(v.keys()) == {"hex"}:
            return canon(bytes.fromhex(v["hex"]))
        # ⚠ keys sorted by their UTF-8 BYTES, not by Python's default string ordering, which is by
        #   code point and differs above the BMP.
        items = sorted(v.items(), key=lambda kv: kv[0].encode("utf-8"))
        body = b"".join(canon(k) + canon(val) for k, val in items)
        return b"\x07" + _uvarint(len(items)) + body
    raise TypeError(f"canon: no rule for {type(v).__name__}")


def canon_hash(v) -> str:
    return hashlib.sha256(canon(v)).hexdigest()


# ── the operations under test ───────────────────────────────────────────────────────────────────────
# ⚠ Everything not listed here is SKIPPED, and a skip is never a pass. On day one that is nearly all
#   of it, and the runner must say so loudly rather than reporting a clean sheet.

class NotImplementedOp(Exception):
    pass


def op_canon_hash(inp):
    """The harness pinning its own foundation. ⇒ If the two languages disagree here, nothing built on
    top of it means anything, so this is the first thing that has to pass."""
    return {"hex": canon_hash(inp["value"])}


def op_sha256(inp):
    return {"hex": hashlib.sha256(bytes.fromhex(inp["hex"])).hexdigest()}


def op_hash160(inp):
    d = hashlib.sha256(bytes.fromhex(inp["hex"])).digest()
    r = hashlib.new("ripemd160")
    r.update(d)
    return {"hex": r.hexdigest()}


def op_bip32_derive(inp):
    """★ Aimed at vectors sealed from the BIP before this code existed."""
    import bip32
    node = bip32.from_seed(bytes.fromhex(inp["seed"]["hex"])).derive(inp["path"])
    return {"xprv": node.xprv(), "xpub": node.xpub()}


def op_base58_check(inp):
    import bip32
    return {"b58": bip32.b58check(bytes.fromhex(inp["hex"]))}


OPS = {
    "bip32.derive": op_bip32_derive,
    "base58.check": op_base58_check,
    "canon.hash": op_canon_hash,
    "hash.sha256": op_sha256,
    "hash.hash160": op_hash160,
}


def dispatch(op, inp):
    fn = OPS.get(op)
    if fn is None:
        raise NotImplementedOp(op)
    return fn(inp)


# ── the runner ──────────────────────────────────────────────────────────────────────────────────────

def main() -> int:
    selftest = "--selftest" in sys.argv
    files = sorted((ROOT / "vectors").glob("*.json"))
    if not files:
        print("  ⚠ no vector files found")
        return 1

    npass = nfail = nskip = 0
    seen_ids = set()
    failures = []

    for f in files:
        doc = json.loads(f.read_text())
        for v in doc["vectors"]:
            vid, op = v["id"], v["op"]
            if vid in seen_ids:
                print(f"  ⚠⚠ DUPLICATE VECTOR ID: {vid}")
                return 1
            seen_ids.add(vid)
            try:
                got = dispatch(op, v["in"])
            except NotImplementedOp:
                nskip += 1
                continue
            except Exception as e:                       # a throw is a FAILURE, never a skip
                nfail += 1
                failures.append((vid, f"threw {type(e).__name__}: {e}"))
                continue
            h = canon_hash(got)
            if selftest and vid == doc["vectors"][0]["id"]:
                h = "0" * 64                             # ⚠ deliberately wrong — see below
            if h == v["hash"]:
                npass += 1
            else:
                nfail += 1
                failures.append((vid, f"expected {v['hash'][:16]}… got {h[:16]}…"))

    for vid, why in failures:
        print(f"  ✗ {vid}  {why}")
    print(f"\n  {npass} passed · {nfail} failed · {nskip} SKIPPED (not implemented)\n")

    if selftest:
        # ★ A HARNESS NOBODY HAS WATCHED FAIL IS NOT A HARNESS.
        ok = nfail >= 1
        print(f"  selftest: the runner {'DID' if ok else 'DID NOT'} report the planted failure "
              f"{'✓' if ok else '⚠⚠'}")
        return 0 if ok else 1

    if nskip:
        print(f"  ⚠ {nskip} vectors were skipped. A skip is not a pass.")
    return 1 if nfail else 0


if __name__ == "__main__":
    sys.exit(main())
