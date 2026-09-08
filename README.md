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

**Business Source License 1.1**, converting to the **Apache License 2.0** on **2030-09-09**.

⚠ Source-available, not open source — yet. You may read it, modify it, and make production use of it.
The one thing you may not do is ship a **competing** wallet, minting or token-issuance product on it.
Personal, educational, research and internal-evaluation use is always permitted, and the whole thing
becomes Apache 2.0 on the Change Date.

★★ **The balance this strikes, stated plainly.** Open licensing invites cooperation; it also lets
someone hijack the work, or subvert it into something it was not for. BSL keeps the source readable and
the door open, while the project still has to earn its living — and it sets a date after which that
protection expires rather than lasting forever.

⚠⚠ **Not Open BSV, and that is not a matter of taste.** Open BSV's clause 2 restricts every derivative
to one blockchain — so a core under those terms **could not be used on jetmora**, which is the entire
reason this exists. ⇒ Note the difference from the restriction above: **clause 2 binds the user; BSL's
Additional Use Grant binds third parties, not the Licensor.** A field-of-use restriction someone else
imposes on you is a different thing from one you set yourself.

★ **And Apache rather than MIT as the Change License, for the patents.** MIT grants copyright permission
and says nothing whatever about patents, so a contributor or a downstream user can accept it and still
assert a patent over the same code. Apache §3 grants a patent licence explicitly and terminates it for
anyone who brings a patent action over the work. ⇒ For a wallet core meant to outlive its author, that
is the difference between *"you may copy this"* and *"you may copy this and not be sued for it."*

## What it is built from

**Nothing.** Zero runtime dependencies, and no third-party source code — every line under `impl/` and
`runner/` was written for this repo, from the published specifications, against those specifications'
own test vectors.

⚠ That is a claim, so it is evidenced rather than asserted: **`PROVENANCE.md`** records the method, the
controls that show the method discriminates, the one third-party *data* file (BIP-39's official English
wordlist, verified byte-identical), and the two marker sets that could not be proven locally — reported
as unproven rather than as a pass.

★ The libraries that were **read** are listed there too, because reading a published implementation and
writing your own is not derivation, and the distinction only means something if you say which you did.

⇒ Design: `~/Documents/tack-spec.md` · changes from Phar Lap 1: `WHAT-CHANGED.md`.
