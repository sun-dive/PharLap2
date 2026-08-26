# Phar Lap 2

⚠ Phar Lap was a gelding, so the second one arrives by immaculate conception.

Inside is **tack** — the gear a horse wears, and the name of the core this wallet is mounted on: two
implementations of one library, and the vectors that keep them honest.

★ The trifecta: **Phar Lap 2** (own · mint) · **Big Red** (sell) · **Pole Position** (create). ⇒ If the
core ever earns its own life — because Big Red and Pole Position come to depend on it too — `tack`
lifts out into its own repo with its history intact. **Until then there is one thing here, not two.**

Two implementations of the same wallet — **Python as the reference, JavaScript in production** — that
share no code, and a set of vectors both must satisfy.

```
sh runner/seal.sh            propose hashes from both sides and report agreement
sh runner/seal.sh --write    …and seal them
python3 runner/python/run.py     [--selftest]
node    runner/js/run.mjs        [--selftest]
```

## Why vectors, and why they come first

A hand-port from one language to the other **on every update is a drift machine**. The two will
diverge, and they will do it quietly — on integer width, on key ordering, on how a byte string is
spelled. ⇒ So neither implementation is ever checked against the *other*. **Both are checked against
the vectors**, and a divergence becomes a failing test on the day it appears.

★ Inherited from `jetmora/README.md`, which puts it better than a restatement would:

> *"Prose about what `OP_MUL` does cannot be executed. Two honest implementations will still diverge on
> overflow, negative zero and minimal encoding — silently. A vector names the divergence and fails."*

## The three classes — who else can check this

| class | meaning |
|---|---|
| `bip` | a **published external oracle exists** — BIP-32/39/44 ship their own test vectors |
| `bsv` | checkable against a node, ElectrumSV, or a mined transaction |
| ⚠ `ours` | **no oracle can exist** — our implementation IS the definition |

★★ Naming the class is the honest part. It says out loud which of our claims a stranger can check and
which they must simply take from us — and the third column is where the standards actually live.

⚠ A `bip` or `bsv` vector **must carry its `out`**, or the oracle it claims cannot actually be used.
The `hash` field is authoritative; `out` is what a human compares against the published source.

## ★★★ How a hash gets written

**Never by running one side and writing down what it said.** That records a bug as a standard.
`runner/seal.sh` computes every hash **twice, in two implementations that share no code**, and a
disagreement **stops the seal** rather than picking a winner.

## ⚠⚠ A skip is never a pass

Nothing is implemented on day one. A runner that reports "0 failures" against an empty implementation
is worse than no runner at all, so **pass / fail / SKIPPED are three separate counts** and the skip
total is printed loudly.

## ⚠ `--selftest`

Both runners plant a wrong answer and require themselves to notice. **A harness nobody has watched fail
is not a harness** — the same rule as *"a green test on a path the change cannot reach is not
evidence."*

## Where it stands

| | |
|---|---|
| `canon` | ✅ 20 vectors — the canonical form, pinning the harness's own foundation |
| `hash` | ✅ 5 vectors — SHA-256 and HASH160, three checked against **published FIPS 180-4 values** |
| `bip32` | ✅ **17 vectors** — all four published BIP-32 test vectors, sealed from the specification. **Both languages pass** |
| `base58` | ✅ 3 — ⚠ written because the BIP-32 set **cannot reach** the leading-zero branch |
| `bip39/44` | ⏭ next |
| `bsv` | ⏭ sighash, fee, address encoding, against real mined transactions |
| `ours` | ⏭ MPT · BMF · BRC-226 — the layer that justifies the exercise |

## ⚠ Every claim here was checked by breaking something

| broken on purpose | vectors that failed |
|---|---|
| `ser256` using minimal length instead of 32 bytes | **4** (py) · **16** (js) |
| JavaScript's `%` without sign correction | **12** |
| the leading-zero branch in `b58check` | **0 from bip32** ⚠ · **2** from `base58` |

★★★ That third row is the finding. I had written that the leading-zero branch was what BIP-32's test
vectors 3 and 4 catch. **Removing it left all 42 green** — 0 of their 34 keys begin with a zero byte,
because an extended key always starts `0x0488`. ⇒ The comment was false, `vectors/base58.json` now
covers the branch, and what those vectors *actually* test is in `ser256`.

> **A green test on a path the change cannot reach is not evidence.**

★ One vector was checked for *bite*: `canon/key-order-utf8` produces a different hash under a
language's default sort than under UTF-8 byte order, **so it fails if either side gets it wrong.**
⇒ A vector that cannot fail is decoration.

## Licence

**MIT.** ⚠⚠ **Not Open BSV, and that is not a matter of taste.** Open BSV's clause 2 restricts every
derivative to the BSV Blockchain — so a core under those terms **could not be used on jetmora**, which
is the entire reason it exists. ⇒ The same trap `@bsv/sdk` turned out to be, and it would be worse to
walk into it deliberately.

## What it is built from

Verified 26 Aug 2026 **by reading the files**: bitcoinX (MIT) · electrumsv-secp256k1 (MIT/Apache-2.0) ·
ElectrumSV (MIT since January 2024). ⚠ **ElectrumSVP is not usable** (mixed / Open BSV), and **nothing
derived from `@bsv/sdk` may be used off the BSV Blockchain** — its clause 2 restricts every derivative,
which is why jetmora needs this at all.

⇒ Design: `~/Documents/wallet-core-spec.md`.
