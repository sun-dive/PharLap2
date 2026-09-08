# Provenance and third-party notices

**Phar Lap 2 · `tack` — audited 8 September 2026.**

A wallet handles keys, so where its code came from is part of what it is. This file states Phar Lap 2's
sources up front — **including where the answer is "none"** — and shows the method, so the claim can be
checked rather than believed.

★★ Two reasons it is worth the trouble. **A licence condition you cannot see is a condition you cannot
meet**, and downstream users inherit whatever you failed to declare. And a copy that loses track of its
origin **loses its upstream too**: fixes published for the original never find their way to it, and
nothing is left to say where to look.

---

## The short answer

| | |
|---|---|
| **Licence** | **Business Source License 1.1** · © 2026 sun-dive — source-available, converting to **Apache 2.0** on 2030-09-09 |
| **Runtime dependencies** | **none** — `package.json` has no `dependencies` block because there is nothing to declare |
| **Third-party source code** | **none.** Every line under `impl/` and `runner/` was written for this repo |
| **Third-party data** | **one file** — BIP-39's official English wordlist. See §3 |

---

## 1 · Method

Search for **private identifiers that carry no mathematical meaning**, where there is no route to the
name except from one particular source. An internal scratch-buffer name is not something two authors
invent independently — which makes it evidence in a way that a shared algorithm name never is.

⚠⚠ **A CLEAN SCAN IS ONLY EVIDENCE IF THE METHOD DISCRIMINATES.** So every marker set is first run
against a file *known* to contain that source. **A set that finds nothing in its own control is
reported as unproven, not as a pass.**

⚠ Comments are stripped before scanning, so that a library mentioned in prose is never mistaken for a
library imported in code.

## 2 · Results

**Controls (does the set discriminate?)**

| source | control | result |
|---|---|---|
| a widely used JS elliptic-curve library | a file known to derive from it | ✅ 13 distinct markers |
| its big-number companion | a file known to derive from it | ✅ 6 |
| its hashing companion | a file known to derive from it | ✅ 6 |
| a second pure-JS curve library | its published package, fetched from npm | ✅ 4 |
| a desktop wallet's coin selector | its published source | ✅ 5 |
| the SDK previously depended on | a file that genuinely imports it | ✅ 1 |
| a Python Bitcoin library | ⚪ none installed locally | **unproven — declared, not claimed** |
| an older JS Bitcoin library | ⚪ none installed locally | **unproven — declared, not claimed** |

**The scan — all 17 source files under `impl/` and `runner/`**

```
0 of 17 files carry any marker from any set.
```

### ★★★ 3 · The structural argument, which matters more than names

Identifiers can be renamed. Algorithms cannot. Point multiplication here is textbook double-and-add
over affine coordinates:

```js
export function mul(k, p = G) {
  let r = null, acc = p
  while (k > 0n) { if (k & 1n) r = add(r, acc); acc = add(acc, acc); k >>= 1n }
  return r
}
```

⇒ The fast libraries use **windowed-NAF with endomorphism decomposition**, or **projective coordinates**
with precomputed tables. **These are different algorithms, not different spellings** — and nobody lifting
a fast implementation throws away the fast paths on the way out.

⚠ **What this evidence is, stated plainly:** fingerprint and structural evidence, using a method shown
to discriminate. It is **not** a line-by-line provenance proof, and it is not legal advice.

---

## 3 · Third-party data — the one item

| file | source | licence |
|---|---|---|
| `impl/js/data/wordlist-english.mjs` | **BIP-39's official English wordlist**, `bitcoin/bips` | BIP-39 is public specification text |

✅ **Verified byte-identical**, and **re-verified on every test run** rather than once:
`test/bip39.mjs` reconstructs the original file's exact form from the module and hashes it, so the
claim below cannot quietly stop being true.

```
sha256  2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda
2048 words · sorted · lowercase ASCII · 2048 distinct four-letter prefixes
```

⚠ It is a **module** rather than the original text file because the wallet is browser-only: there is
no filesystem to read from, and `node:fs` cannot be bundled for a browser at all. The words are
unchanged.

★ This file is **specification data, not code**: BIP-39 defines the mapping from index to word, so any
conforming implementation must use exactly these bytes. Substituting them produces a wallet nobody else
can restore. ⇒ It is reproduced because the standard requires it, and its origin is stated here.

---

## 4 · What was READ but not taken

★★ Reading a specification or a published implementation and writing your own is not derivation. But
because that distinction is the whole subject of this file, the reading is listed too.

| read | what crossed |
|---|---|
| **BIP-32 / BIP-39 / BIP-143 / BIP-350** | the specifications, and their published test vectors |
| **RFC 6979** | the algorithm, and §A.2.5's P-256 vectors |
| **a desktop wallet's coin selector** | ⚠ **facts about behaviour**: that the fee is circular, that change below a floor is better given to the miner, that a script's coins should be spent together. **No code.** ⛔ Its hard-coded 546 dust threshold was examined and **REFUSED** — see §6 |
| **an existing implementation, as an oracle** | ⚠ **its OUTPUT, as test vectors** — it was run and what it printed was recorded. Running a program does not make its output a derivative of it, and an RFC 6979 signature is a fact fixed by the specification, not authorship |

⚠ Those comparison vectors live outside this repository as **test data only**, never in shipped code,
and an automated check enforces that.

---

## 5 · Verification — how a stranger checks this

Nothing here rests on our own say-so where an outside oracle exists:

| layer | graded against |
|---|---|
| BIP-32 | the BIP's own test vectors, sealed before either implementation existed |
| BIP-39 | the BIP's own vectors |
| BIP-143 sighash | the BIP's own worked examples — preimage **and** sighash, byte for byte |
| merkle proofs | **real mainnet blocks** — the root the chain recorded, and every transaction's path |
| ECDSA | **openssl**, 1800/1800, plus 613 signatures from an independent implementation, byte for byte |
| coin selection | ⚠ **no oracle can exist** — selection is policy. Graded on **invariants** instead, chiefly that `selected == target + fee + change` exactly |

★ The vector harness names each vector's class — `bip`, `bsv`, `ours` — so it is always visible which
claims a stranger can check and which they must take from us.

---

## 6 · ⛔ One number we deliberately did not inherit

Desktop wallets commonly hard-code `dust_threshold = 546`. **That is Bitcoin Core's number** —
`dustRelayFee` at 3000 sat/kB over a P2PKH output — and it is correct where it comes from.
⚠ **BSV removed the dust limit at Genesis in February 2020**, so it does not apply here.

✅ Measured against this project's own mainnet history: three confirmed transactions carry **nine
1-satoshi outputs** between them, at 2,927–5,932 confirmations. They relayed and were mined.

⇒ The constant is retained only as `BTC_LEGACY_DUST`, **named for its provenance rather than any
authority**, so a future reader recognises the number and does not re-import it as a rule. The actual
floor is `MIN_OUTPUT = 1`, and it applies to **change we create**, never to an output a caller asked
for.

★ An earlier draft called it `RELAY_DUST`, which asserted something false about this chain. A borrowed
number under a name that grants it authority is worse than no constant at all.
