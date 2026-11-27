# impl/js/coins.mjs

UTXO selection.

⚖ THE POLICY BELOW WAS READ FROM A DESKTOP WALLET'S COIN SELECTOR; NOTHING WAS IMPORTED. What crossed
is **facts about behaviour** — that the fee is circular, that change below a floor is better given to
the miner, that a script's coins should be spent together — none of which is anyone's expression.

⛔⛔⛔ AND THE NUMBER THAT WAS REFUSED. Desktop wallets hard-code `dust_threshold = 546`. **Every covenant
in this project uses 1-satoshi outputs** — the breadcrumbs, the notify output, the racer payees. A
selector imposing 546 would refuse or mangle every transaction this repo builds.
★ Read closely, such a selector never second-guesses the CALLER's outputs either: 546 only decides whether
CHANGE is worth creating. ⇒ That separation is preserved exactly. `BTC_LEGACY_DUST` names its provenance;
`MIN_OUTPUT = 1` is the floor; and the floor applies to CHANGE ONLY.

⚠⚠ THE SILENT FAILURE: **fee estimated from the UNSIGNED size.** An unsigned input carries an empty
script; the signed one carries ~107 bytes. ⇒ The transaction is well-formed, under-paid, and simply
never confirms, with nothing in it to say why.

## BTC_LEGACY_DUST

⛔⛔⛔ BTC's NUMBER, AND IT DOES NOT APPLY TO BSV. Named for its PROVENANCE, not any authority here.
★ Bitcoin Core's dust threshold, correct where it comes from. **BSV REMOVED THE DUST LIMIT AT GENESIS.**
✅ MEASURED against this project's own mainnet history: nine 1-satoshi outputs across three CONFIRMED
transactions (2,927–5,932 confirmations). ⇒ **The real floor is 1.** Kept only so a reader recognises
the number and does not re-import it as a rule.

## SAT_PER_KB

★★ THE ACTUAL FLOOR — 1 satoshi, and never 0

## P2PKH_INPUT

32 txid + 4 vout + 1 varint + 107 scriptSig + 4 sequence.

⚠⚠ DO NOT DERIVE AN UNLOCKING-SCRIPT SIZE FROM THIS, and do not "correct" one against the other. The
  107 here assumes a LOW-S signature, where `s` never needs a DER padding byte, so it is the true
  maximum for a signature this wallet produces. The application's `UNLOCK_P2PKH` is 108 instead,
  because that is what the deployed wallet estimates and matching it keeps every fee identical.
  ⇒ They disagree by one byte ON PURPOSE. I once wrote `P2PKH_INPUT - 41` to get the other, and a
    three-input payment then came out one satoshi cheaper than the deployed one - invisible at one or
    two inputs, because 107x2 and 108x2 round to the same fee.

## inputSize

⚠ `unlockingSize` is the caller's business for anything not P2PKH — a covenant's can be hundreds
 of bytes, and guessing P2PKH for one under-pays the fee silently.

## fee

⚠ Rounded UP. A fee below the floor is a transaction that never confirms.

## select

At `const buckets = new Map()`:

★ THE PRIVACY RULE, read rather than invented: a script's coins are spent TOGETHER. Partially spending
  one publishes that the remainder is yours, so splitting buys nothing.

At `const k = toHex(u.script)`:

⚠ a map KEY, not display. `Uint8Array.toString('hex')` returns comma-separated decimals
  and would still have grouped correctly — wrong, and invisible to every test.

At `const ordered = [...buckets.values()].sort((a, b) => sum(b) - sum(a))`:

⚖ largest first: fewer inputs ⇒ smaller tx ⇒ smaller fee. A CHOICE, pinned by a test.

At `size = base + varint(chosen.length).length + chosen.reduce((t, c) => t + inputSize(c), 0)`:

⚠⚠ THE CIRCULARITY, resolved by re-asking after every bucket: the fee we must cover depends on
  the size we have only just changed.

At `else f = have - target`:

⛔ else it becomes fee: an output nobody will ever profitably spend is worse than paying the miner

## build

⚠ Change is appended LAST, and inputs are UNSIGNED — signing is a separate, later step.

## applyFee

Settle the change on a transaction whose inputs are ALREADY chosen.

★★ THE COMPANION TO `select`, NOT A DUPLICATE OF IT. `select` decides WHICH coins to spend; this takes
  coins someone else picked and works out what is left after the fee. The application picks its own
  funding (largest-first, with its own quarantine rules), so it needs this half and not the other.

⚠⚠ THE INPUTS ARE UNSIGNED WHEN THIS RUNS, so the size has to be ESTIMATED - a signature that does not
  exist yet still has to be paid for. `unlockingSizes` says how big each one will be: 107 for P2PKH
  (1 + 72 sig + 1 + 33 key), 73 for a bare signature. ⛔ Guessing P2PKH for something else under-pays
  the fee silently, and the transaction simply never confirms.

⚠ The change output is KEPT even when small, and is not dropped as dust. That matches the deployed
  behaviour exactly - measured - and this chain has no dust floor to drop it for. A caller that wants
  to fold a tiny change into the fee can look at the returned value and decide.

@param tx            mutated in place: `tx.outputs[changeVout].value` is set
@param inputValues   the satoshis of each input, in input order
@param changeVout    which output is the change
@returns `{ fee, change, size }`
