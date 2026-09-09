# Phar Lap 1 → Phar Lap 2 — what changed, and why

**8 September 2026.** The design is unchanged: the same browser-based wallet, the same covenants, the
same on-chain formats. **What changed is underneath it.**

---

## 1 · Why at all

| ⚖ **Field of use** | Phar Lap 1's wallet SDK is licensed for use on one blockchain. This project also runs a second chain, so that restriction is a boundary rather than a preference — the wallet core has to be usable on both. |
| ⚖ **Redistribution** | A wallet bundle ships to every visitor. Everything inside it is something we hand on, under terms we have to be able to state. ⇒ **Zero runtime dependencies is the simplest honest answer**, and it is the one Phar Lap 2 gives. |
| ★ **Verifiability** | Owning the core means every layer can be graded against a published oracle rather than trusted — which is what `PROVENANCE.md` and the vector harness exist to make checkable. |

⇒ **Phar Lap 2 is Business Source License 1.1**, © sun-dive, converting to **Apache 2.0** on
2030-09-09 — the same licence family as Phar Lap 1, with Apache rather than MIT at the end of it for
the patent grant MIT does not have.

---

## 2 · What was removed

The wallet SDK dependency — imported by **26 of 40 source files** in Phar Lap 1, across 19 distinct symbols.

⚠ Phar Lap 1 is **untouched and still runs.** It remains the reference to diff against.

## 3 · What replaces it

| removed | uses | replaced by | status |
|---|---|---|---|
| `Transaction` | 15 | `impl/js/transaction.mjs` — serialize · parse · txid · fee | ✅ graded by BIP-143's own vectors |
| `P2PKH` | 12 | `impl/js/address.mjs` | ✅ |
| `SatoshisPerKilobyte` | 10 | `impl/js/coins.mjs` — 100 sat/KB, rounded **up** | ✅ |
| `PublicKey` · `PrivateKey` | 12 | `impl/js/ecdsa.mjs` · `impl/js/address.mjs` (WIF) | ✅ |
| `Hash` | 5 | the platform's SHA-256, **injected** — see §6 | ✅ |
| `Curve` · `BigNumber` | 2 | `impl/js/secp256k1.mjs`, on native `BigInt` | ✅ |
| `HD` | 1 | `impl/js/bip32.mjs` | ✅ graded by BIP-32's vectors |
| `Mnemonic` | 1 | `impl/js/bip39.mjs` | ✅ graded by BIP-39's vectors |
| `TransactionSignature` | 1 | `impl/js/transaction.mjs` — BIP-143 preimage + sighash | ✅ |
| `Utils` | 12 | hex/byte helpers, inline | ✅ trivial |
| `LockingScript` · `ScriptChunk` · `OP` | 10 | `impl/js/script.mjs` — opcodes, minimal pushes, chunks | ✅ graded by real mainnet scripts |
| `SymmetricKey` · `Random` | 2 | `src/contentCrypto.ts` — the browser's own AES-GCM | ✅ reads ciphertext already on chain; **424× faster** |
| `ECIES` | 1 | ⏭ **not yet** — `messageCodec.ts`, `configBackup.ts` | **OPEN** |
| `MerklePath` (via the wallet provider) | — | `src/walletProvider.ts` — the deployed file, **adapted not rewritten** | ✅ two independent proof sources |

★★ **The open rows are the honest part of this document.** The core derives keys, selects coins, builds,
signs, broadcasts and verifies end to end. **It is still not a drop-in replacement**, and the blanks are
listed so a reader does not have to discover them.

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

---

## 6 · ⚠ One thing a browser build must still decide

`bip39.toSeed` needs **PBKDF2-HMAC-SHA512** and RFC 6979 needs **HMAC-SHA256**, and both must be
**synchronous**. Node provides them. ⛔ **The browser's WebCrypto is asynchronous and cannot be used
here.**

⇒ Rather than choose a browser hash silently, **both are injected**, with Node implementations supplied
for the harness. The bundling step makes that choice
explicitly, and it will be visible in the diff when it does.

---

## 7 · What has NOT changed

The covenants. The on-chain formats. The addresses. The derivation path `m/44'/236'/0'/0/0`, which
Phar Lap 1's source says must never change.

✅ **Verified:** given the same seed phrase, Phar Lap 2 derives **the same private key, the same public
key, the same WIF and the same address** as the live wallet. A user restoring from their phrase lands
in exactly the same place.
