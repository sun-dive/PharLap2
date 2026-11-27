# impl/js/bip32.mjs

BIP-32 hierarchical deterministic keys — the JavaScript side.

Answerable to `vectors/bip32.json`, which was sealed from the BIP's published test vectors before
either implementation existed. ⇒ The target was not defined by this code.

## b58check

At `let pad = 0`:

⚠⚠ Every leading zero BYTE is a leading '1'.
⚠ MEASURED: this branch is UNREACHABLE from the BIP-32 vectors — 0 of their 34 keys begin with a
  zero byte, because an extended key payload always starts with the version (0x0488). Removing it
  left all 42 green. ⇒ It is kept because addresses and WIF do hit it, and `vectors/base58.json`
  covers it directly — three vectors, two of which fail if this line goes.

### Node.constructor

At `this.k = k`:

BigInt, or null for a watch-only node

At `this.K = K ?? mulBlinded(k)`:

⚠ k is a SECRET child key

### Node.xprv

At `return this.#ser(XPRV, concat(new Uint8Array(1), ser256(this.k)))`:

⚠ 0x00 prefix, so the key field is 33 bytes like a compressed point

### Node.child

At `if (IL >= N) return this.child(index + 1)`:

⚠⚠ THE CASE NOBODY WILL EVER SEE. The BIP says: if IL >= n, or the resulting key is zero, the
child is INVALID and you proceed to index+1. Probability about 2^-127 — which is precisely why
it must be written rather than assumed.

At `const K = add(mulBlinded(IL), this.K)`:

⚠ IL is secret-derived

At `if (K === null) return this.child(index + 1)`:

the point at infinity — same rule

### Node.derive

`m`, `m/0'`, `m/0'/1/2'` — a prime or an h marks a hardened step.

## fromSeed

At `const I = hmac(sha512, fromUtf8('Bitcoin seed'), seed)`:

⚠ The curve is named IN the HMAC key. A different string derives another wallet's keys —
  valid, verifiable, and nobody else's.

At `throw new Error('invalid seed: the master key is out of range')`:

⚠ the BIP says the seed is invalid and another should be chosen — not silently clamped
