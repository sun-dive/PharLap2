"""
BIP-32 hierarchical deterministic keys — the Python reference.

Written from the specification, and answerable to `vectors/bip32.json`, which was sealed from the
BIP's own published test vectors before this file existed. ⇒ **The target was not defined by this code**,
which is the only way a reference implementation can be checked rather than merely believed.
"""
import hashlib
import hmac

from secp256k1 import G, N, add, mul, ser32, ser256, ser_p

# mainnet, from the BIP's "Serialization format"
XPRV = bytes.fromhex("0488ADE4")
XPUB = bytes.fromhex("0488B21E")

HARDENED = 0x80000000

_B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def hash160(b: bytes) -> bytes:
    r = hashlib.new("ripemd160")
    r.update(hashlib.sha256(b).digest())
    return r.digest()


def b58check(payload: bytes) -> str:
    raw = payload + hashlib.sha256(hashlib.sha256(payload).digest()).digest()[:4]
    n = int.from_bytes(raw, "big")
    out = ""
    while n:
        n, r = divmod(n, 58)
        out = _B58[r] + out
    # ⚠⚠ Every leading zero BYTE is a leading '1'.
    #
    # ⚠ AND THIS BRANCH IS UNREACHABLE FROM THE BIP-32 VECTORS — measured, not assumed: 0 of their 34
    #   keys begin with a zero byte, because an extended key payload always starts with the version
    #   (0x0488…). Removing it entirely left all 42 vectors green.
    #   ⇒ It is kept because addresses and WIF DO hit it, and `vectors/base58.json` covers it directly.
    #   ★ What BIP-32's "retention of leading zeros" actually means is in `ser256` — see secp256k1.py.
    return "1" * (len(raw) - len(raw.lstrip(b"\x00"))) + out


class Node:
    """An extended key. Holds the private key when it has one, and always the public point."""

    def __init__(self, k, K, chain, depth=0, parent_fp=b"\x00\x00\x00\x00", index=0):
        self.k = k                       # int, or None for a watch-only node
        self.K = K if K is not None else mul(k)
        self.chain = chain
        self.depth = depth
        self.parent_fp = parent_fp
        self.index = index

    # ── serialization ───────────────────────────────────────────────────────────────────────────
    def _ser(self, version: bytes, key: bytes) -> str:
        return b58check(version + bytes([self.depth]) + self.parent_fp + ser32(self.index)
                        + self.chain + key)

    def xpub(self) -> str:
        return self._ser(XPUB, ser_p(self.K))

    def xprv(self) -> str:
        if self.k is None:
            raise ValueError("no private key in this node")
        # ⚠ 0x00 prefix, so the key field is 33 bytes like a compressed point
        return self._ser(XPRV, b"\x00" + ser256(self.k))

    def fingerprint(self) -> bytes:
        return hash160(ser_p(self.K))[:4]

    # ── derivation ──────────────────────────────────────────────────────────────────────────────
    def child(self, index: int) -> "Node":
        hardened = index >= HARDENED
        if hardened:
            if self.k is None:
                raise ValueError("a hardened child needs the private key")
            data = b"\x00" + ser256(self.k) + ser32(index)
        else:
            data = ser_p(self.K) + ser32(index)

        I = hmac.new(self.chain, data, hashlib.sha512).digest()
        IL, IR = int.from_bytes(I[:32], "big"), I[32:]

        # ⚠⚠ THE CASE EVERYONE SKIPS. The BIP says: if IL >= n, or the resulting key is zero, the child
        # is INVALID and you proceed to index+1. It happens with probability about 2^-127, so it will
        # never be seen in testing — which is exactly why it must be written rather than assumed.
        if IL >= N:
            return self.child(index + 1)

        if self.k is not None:
            k = (IL + self.k) % N
            if k == 0:
                return self.child(index + 1)
            return Node(k, None, IR, self.depth + 1, self.fingerprint(), index)

        K = add(mul(IL), self.K)
        if K is None:                    # the point at infinity — same rule
            return self.child(index + 1)
        return Node(None, K, IR, self.depth + 1, self.fingerprint(), index)

    def derive(self, path: str) -> "Node":
        """`m`, `m/0'`, `m/0'/1/2'` — a prime or an h marks a hardened step."""
        parts = path.split("/")
        if parts[0] not in ("m", "M"):
            raise ValueError(f"a path starts at m, not {parts[0]!r}")
        node = self
        for p in parts[1:]:
            if not p:
                raise ValueError(f"empty step in path {path!r}")
            hard = p[-1] in ("'", "h", "H")
            n = int(p[:-1] if hard else p)
            if n < 0 or n >= HARDENED:
                raise ValueError(f"index out of range: {p}")
            node = node.child(n + HARDENED if hard else n)
        return node


def from_seed(seed: bytes) -> Node:
    I = hmac.new(b"Bitcoin seed", seed, hashlib.sha512).digest()
    IL, IR = int.from_bytes(I[:32], "big"), I[32:]
    if IL == 0 or IL >= N:
        # ⚠ the BIP says the seed is invalid and another should be chosen — not silently clamped
        raise ValueError("invalid seed: the master key is out of range")
    return Node(IL, None, IR)
