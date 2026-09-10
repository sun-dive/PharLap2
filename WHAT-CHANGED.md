# Phar Lap 1 → Phar Lap 2 — what changed, and why

**8 September 2026.** The design is unchanged: the same browser-based wallet, the same covenants, the
same on-chain formats. **What changed is underneath it.**

---

## 1 · Why at all

| ⚖ **Field of use** | Phar Lap 1's wallet library is licensed for use on one blockchain. This project also runs a second chain, so that restriction is a boundary rather than a preference — the wallet core has to be usable on both. |
| ⚖ **Redistribution** | A wallet bundle ships to every visitor. Everything inside it is something we hand on, under terms we have to be able to state. ⇒ **Zero runtime dependencies is the simplest honest answer**, and it is the one Phar Lap 2 gives. |
| ★ **Verifiability** | Owning the core means every layer can be graded against a published oracle rather than trusted — which is what `PROVENANCE.md` and the vector harness exist to make checkable. |

⇒ **Phar Lap 2 is Business Source License 1.1**, © sun-dive, converting to **Apache 2.0** on
2030-09-09 — the same licence family as Phar Lap 1, with Apache rather than MIT at the end of it for
the patent grant MIT does not have.

---

## 2 · What was removed

A wallet library Phar Lap 1 depended on. ⚠ Measured 9 Sept 2026: it is referenced by only **659 of the
application's 12,400 lines — 5%**, which is the useful number, because it says the work was never mostly
about replacing it.

⚠ Phar Lap 1 is **untouched and still runs.** It remains the reference to diff against.

## 3 · What replaces it

| module | covers | graded by |
|---|---|---|
| `impl/js/secp256k1.mjs` | the curve, on native `BigInt` | its own published test vectors |
| `impl/js/ecdsa.mjs` | signing, verifying, strict DER | **openssl**, an implementation with no relationship to this project |
| `impl/js/rfc6979.mjs` | deterministic nonces | **RFC 6979's own published vectors** |
| `impl/js/bip32.mjs` · `bip39.mjs` | keys from a phrase | **BIP-32 and BIP-39's own vectors** |
| `impl/js/address.mjs` | addresses, WIF, locking scripts | round trips against known keys |
| `impl/js/script.mjs` | opcodes, minimal pushes, chunks | **19 real mainnet scripts**, 25 B to 81 KB |
| `impl/js/transaction.mjs` | serialize, parse, txid, BIP-143 sighash | **BIP-143's own vectors** |
| `impl/js/signer.mjs` | unlocking-script assembly | **5 real mainnet spends the network already accepted** |
| `impl/js/coins.mjs` | selection, fees, change | invariants, and the deployed arithmetic to the satoshi |
| `impl/js/chain.mjs` | the rate-limited transport | offline, with the transport and clock injected |
| `src/contentCrypto.ts` | AES-GCM, via the browser's own | **ciphertext already on chain**, and 424× faster |

★ **Where a row says "its own vectors", that is the point.** Nothing here is graded by agreeing with
another implementation: agreement proves compatibility, never correctness. The oracles are the chain
itself, the specifications' published vectors, and openssl.

⏭ **Still open: authenticated encryption between two parties**, used by the messaging and
settings-backup features. Not on the path to sending a payment.

★★ **The open item above is the honest part of this document.** The core derives keys, selects coins,
builds, signs, broadcasts and verifies end to end. **It is still not a drop-in replacement**, and what is
missing is stated so a reader does not have to discover it.

⚠⚠ **AND THE LARGER PART IS NOT IN THIS TABLE AT ALL.** Measured 9 Sept: only **659 of the application's
12,400 lines** touch the removed library — 5%. The remaining work is not replacing symbols, it is that
transactions were built by a mutable object that filled in its own change and signed itself from
per-input templates, and here everything is decided before anything is constructed. **That is a change of
shape, not of names**, and it is the bulk of what is left.

★ **Nothing has been broadcast yet.** Every check in this repository grades against frozen chain data,
published vectors, openssl, or an injected transport. The first real send is the one none of that
can stand in for.

---

## 4 · What was added, and from where

| added | from |
|---|---|
| `secp256k1.mjs` · `bip32.mjs` | written from the specifications, against the BIPs' own sealed vectors |
| `ecdsa.mjs` · `rfc6979.mjs` | written from RFC 6979 and SEC1; graded against openssl and an independent implementation |
| `bip39.mjs` · `address.mjs` · `transaction.mjs` · `coins.mjs` | written from BIP-39, BIP-143, and Bitcoin's serialization format |
| `impl/js/data/wordlist-english.mjs` | **BIP-39's official English wordlist** — the only third-party data, verified byte-identical on every test run. See `PROVENANCE.md` |
| the vector harness (`runner/`, `vectors/`) | this repo. Two implementations, no shared code, one set of externally sealed answers |

⇒ **Full detail, method, and controls: `PROVENANCE.md`.**

---

## 5 · Where Phar Lap 2 deliberately behaves DIFFERENTLY

Not accidents. Each was measured and each is a decision.

### ⛔ Strict DER, including the rule most parsers miss

A DER integer is SIGNED: one whose top bit is set **requires** a leading `0x00`, or the value reads as
negative. Omit it and you have **two different byte strings for one signature** — the classic
malleability. ⇒ **BIP-66 has made the unpadded form invalid on the network since 2015**, so a parser
that accepts it is *more permissive than consensus*: it can call a transaction good that no node would
accept. Phar Lap 2 refuses it, along with BER long-form lengths, trailing bytes and non-minimal zeros.

### ⛔ The dust floor is 1 satoshi, not 546

546 is **Bitcoin Core's** number, correct where it comes from. **BSV removed the dust limit at
Genesis (2020)**, and this project's own confirmed transactions carry **nine 1-satoshi outputs** at
2,927–5,932 confirmations. ⇒ Every covenant here uses 1-satoshi outputs; a 546 floor would refuse them.
The constant survives only as `BTC_LEGACY_DUST`, named so it is recognised and not re-imported.

### ★ The fee is charged for the SIGNED size

An unsigned input carries an empty script; the signed one carries ~107 bytes. Estimating from the
unsigned size produces a transaction that is well-formed, **under-paid, and simply never confirms** —
with nothing in it to say why. ⚠ A covenant's unlocking script is larger still, so callers declare it.

### ★ Rate limiting is not optional

Every call to a chain service passes through a queue with a minimum gap and a `429` backoff that
honours `Retry-After`. ⚠ Without one, a rate limit surfaces as a verification error —
indistinguishable from a bad proof. **A verifier that reports "invalid" when it was merely throttled is
worse than one that waits.**

### ★ Every secret scalar goes through a fixed-width ladder, blinded

Phar Lap 1 handed signing to a library. Phar Lap 2 signs with its own curve code, so the timing question
became ours. Two defences, because they cover different things:

| | |
|---|---|
| a **Montgomery ladder**, fixed pattern and **fixed width** | hides which bits are set, and how many there are |
| **blinding**, `(k + b·n)·P == k·P` and `(k·t)⁻¹·t == k⁻¹` | means the bits walked are not the key's in the first place |

Five call sites: the nonce and its inverse in `sign`, public key derivation, BIP-32 child derivation,
and the ECIES shared secret.

⚠⚠ **The fixed WIDTH is the part that is usually missed, including by the library this replaced.** Its
ladder loops over `k.toString(2)`, so the iteration count is the scalar's bit length. Measured on it:
1.28 ms at 256 bits, 0.96 ms at 192, 0.34 ms at 64. A nonce that happens to be short is visible to
anyone who can time the signature, and short nonces are what lattice attacks on ECDSA consume. Fixing
the width costs nothing.

★★ **And it made signing 19× faster, which was not the goal.** The old code was affine, so every point
addition needed a modular inverse — about 330 `modPow` calls per multiply. Jacobian coordinates defer
that to **one** inversion at the end. The ladder does roughly twice the point operations and still runs
in a fraction of the time: **40.5 ms → 2.10 ms** per signature. Constant-time is normally a cost; here
it paid for itself because the thing it replaced was the expensive part.

⚠⚠ **It was written once and did nothing for a day.** `mulBlinded` lived in `ecdsa.mjs` and called
`mul`, whose first line is `k = mod(k, N)` — reducing `k + b·n` straight back to `k`. Measured, the
blinded call cost **0.998×** the unblinded one. Every test stayed green throughout, because blinding is
invisible in the result; that is the whole point of it.

⇒ `test/blinding.mjs` therefore **measures** rather than reads: it counts point operations, and reads
back the scalar the ladder was actually handed through a seam. Fifteen mutants are written against it,
including the original bug and the bit-length leak. Fourteen fail the suite. The one that survives is
the degenerate branch in Jacobian addition, unreachable from the ladder's only call site, and it is
labelled as untested in the source rather than left to look covered.

⛔ This raises the cost of a timing attack. It does not make the implementation hardened, and the field
inversion inside every point addition is still value-dependent. **For anything material, sign
air-gapped.**

---

## 6 · Why there is a dependency at all

One, `@noble/hashes`, and the reason is narrow: **`bip39.toSeed` needs PBKDF2-HMAC-SHA512 and RFC 6979
needs HMAC-SHA256, and both must be SYNCHRONOUS.** A nonce is derived inside signing, which is a
synchronous function; it cannot await.

⛔ **The browser's own crypto cannot do that.** `crypto.subtle` is asynchronous, so it is unusable at
those two call sites no matter how good it is.

★ **Which is not a rule against the platform's crypto — the opposite.** `src/contentCrypto.ts` uses the
browser's AES-GCM, because there the call site *can* await. That swap made encryption **424× faster**
than the JavaScript implementation it replaced: a 47 MB release went from roughly 21 seconds of
arithmetic to a tenth of a second. ⇒ The rule is *the platform's crypto wherever the call site can
await, and only where it cannot do we carry our own.*

⚠ An earlier version of this section left that as an open question, and both hashes were injected so the
choice would be visible. The choice has been made; the injection is gone.

---

## 7 · What is NOT here yet

⚠⚠ **THE INTERFACE.** Phar Lap 1 is a browser app — `index.html` plus a bundle — and none of that has
been brought across. What exists here is the wallet and the layers directly under the interface: keys,
coins, scripts, transactions, signing, the network, and the builders a payment and a mint go through.

⏭ Also open: **authenticated encryption between two parties**, used by the messaging and settings-backup
features. Not on the path to sending a payment.

★★★ **And nothing has been broadcast.** Every check in this repository grades against frozen chain data,
the specifications' published vectors, openssl, an injected transport, or the deployed wallet's own
bytes. That is a strong position and it is not the same as having spent a satoshi. **The first real send
is the one none of it can stand in for.**

---

## 8 · What has NOT changed

The covenants. The on-chain formats. The addresses. The derivation path `m/44'/236'/0'/0/0`, which
Phar Lap 1's source says must never change.

✅ **Verified:** given the same seed phrase, Phar Lap 2 derives **the same private key, the same public
key, the same WIF and the same address** as the live wallet. A user restoring from their phrase lands
in exactly the same place.
