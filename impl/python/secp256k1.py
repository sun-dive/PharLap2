"""
secp256k1, written to be READ.

⚠⚠ WHY OUR OWN AND NOT bitcoinX. bitcoinX is MIT and excellent, and for an application it would be the
right dependency. But this is the **reference implementation** — its job is to be legible, and a rule
you can only find by following a call into a library is a rule nobody can check.

⚠ And if the Python side leaned on a library while the JavaScript side wrote its own, the two would not
be independent in the way that matters: one would be testing the library, the other testing itself.
⇒ Both sides write their own, and **the published BIP-32 vectors are the external oracle**. That is the
whole reason `bip` is the class we started with.

⚠⚠ NOT CONSTANT TIME, and not trying to be. This is a reference for deriving from PUBLISHED TEST
VECTORS, not a signing implementation for a wallet holding money. When Phar Lap 2 signs, it uses a real
library. **Saying so here is cheaper than someone assuming otherwise.**
"""

# the curve, from SEC 2 §2.4.1
P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
Gx = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798
Gy = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8
G = (Gx, Gy)

# A point is (x, y), or None for the point at infinity.


def _inv(a: int) -> int:
    return pow(a, P - 2, P)          # Fermat — P is prime


def add(p, q):
    if p is None:
        return q
    if q is None:
        return p
    (x1, y1), (x2, y2) = p, q
    if x1 == x2:
        if (y1 + y2) % P == 0:
            return None              # p + (−p) = ∞
        # doubling
        lam = (3 * x1 * x1) * _inv(2 * y1) % P
    else:
        lam = (y2 - y1) * _inv(x2 - x1) % P
    x3 = (lam * lam - x1 - x2) % P
    return (x3, (lam * (x1 - x3) - y1) % P)


def mul(k: int, p=G):
    """Double-and-add. ⚠ Not constant time — see the module note."""
    k %= N
    r, acc = None, p
    while k:
        if k & 1:
            r = add(r, acc)
        acc = add(acc, acc)
        k >>= 1
    return r


def ser_p(point) -> bytes:
    """SEC1 compressed: 0x02 if y is even, 0x03 if odd, then x as 32 bytes."""
    x, y = point
    return bytes([2 + (y & 1)]) + x.to_bytes(32, "big")


def ser32(i: int) -> bytes:
    return i.to_bytes(4, "big")


def ser256(k: int) -> bytes:
    """
    ⚠⚠ ALWAYS 32 BYTES. THIS IS WHAT "RETENTION OF LEADING ZEROS" MEANS IN BIP-32.

    Two of the published test vectors derive a private key whose first byte is zero —
    `tv3/m` starts `00dd`, `tv4/m/0'` starts `00d9`. A minimal-length encoding gives 31 bytes, every
    field after it shifts, and the extended key is wrong from that point on.
    ⇒ Verified by breaking it on purpose: minimal length fails 4 of the 17 BIP-32 vectors.
    """
    return k.to_bytes(32, "big")
