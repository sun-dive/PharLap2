# The vector format

A vector is a question with a known answer, expressed so that **two implementations sharing no code can
be asked the same thing and disagree loudly.**

```json
{
  "set":    "canon",
  "source": "this file — the canonical form is defined here and nowhere else",
  "vectors": [
    { "id": "canon/empty-object", "class": "ours", "op": "canon.hash",
      "in":   { "value": {} },
      "hash": "…64 hex…",
      "note": "optional, for a human" }
  ]
}
```

| field | |
|---|---|
| `id` | unique across every set. `set/thing` by convention |
| `class` | `bip` · `bsv` · `ours` — see below |
| `op` | what to call. The runner dispatches on this and nothing else |
| `in` | the input, as a canonical value (below) |
| `hash` | **sha256 of the canonical form of the expected output**, lowercase hex |
| `out` | optional, and only for humans. ⚠ **The `hash` is authoritative** |

## The three classes — who else can check this

| class | meaning |
|---|---|
| `bip` | a **published external oracle exists** (BIP-32/39/44 ship their own vectors) |
| `bsv` | checkable against a node, ElectrumSV, or a mined transaction |
| ⚠ `ours` | **no oracle can exist** — our implementation IS the definition |

★ Naming the class is the honest part: it says out loud which claims a stranger can check, and which
they must simply take from us.

## ⚠⚠ The canonical form

Every value is serialized to bytes by one rule, identical in both languages. **The hash is taken over
those bytes**, never over JSON text — JSON has key order, whitespace and number formatting, and all
three differ between languages.

```
null        00
false       01
true        02
integer     03 ‖ zigzag varint
string      04 ‖ varint(byte length) ‖ UTF-8 bytes
bytes(hex)  05 ‖ varint(length) ‖ raw bytes      ⇒ written in JSON as {"hex":"…"}
array       06 ‖ varint(count) ‖ each item
object      07 ‖ varint(count) ‖ each (key as string, then value), KEYS SORTED BY UTF-8 BYTES
```

`varint` here is unsigned LEB128. `zigzag` maps signed to unsigned as `(n << 1) ^ (n >> 63)`.

⚠⚠ **THERE ARE NO FLOATS.** A float is refused by both serializers, deliberately: IEEE round-tripping
between Python and JavaScript is exactly the silent divergence this whole harness exists to catch, and a
satoshi is an integer anyway.

## ★★ Two ways a hash gets sealed, and the class decides which

| class | sealed from |
|---|---|
| ⚠ `ours` | **two implementations agreeing** — `runner/seal.sh`. A disagreement stops the seal rather than picking a winner |
| `bip` · `bsv` | **the published answer**, carried in `out`. ⇒ No implementation is needed or wanted |

★★★ That second row is why `bip` is the right place to start: **the vectors can be written and sealed
before a single line of the wallet exists**, so both implementations are aimed at a target neither of
them defined. ⇒ An implementation that seals its own target is only testing that it is consistent with
itself.

⚠ **A fetched document is not a source until it has been checked.** The BIP-32 keys were verified before
use — base58 checksum, version bytes, depth against the path, and that each xpub/xprv pair shares its
depth, parent fingerprint, child index and chain code. A summariser mangled a licence earlier the same
day; the same care applies to test data.

## What a runner must do

1. read every `vectors/*.json`
2. for each vector, dispatch `op` with `in`
3. hash the result canonically, compare to `hash`
4. report **pass / fail / SKIPPED** — ⚠⚠ **a skip is never a pass.** Nothing is implemented on day
   one, and a harness that reports "0 failures" for an empty implementation is worse than no harness
5. exit non-zero if anything **failed**; exit zero with a loud count if anything was **skipped**

## ⚠ `--selftest`

Both runners take `--selftest`, which feeds a deliberately WRONG answer to a known vector and requires
the runner to report a failure. ⇒ **A harness nobody has watched fail is not a harness.** It is the same
rule as "a green test on a path the change cannot reach is not evidence."
