# impl/js/transaction.mjs

BSV transactions — serialize · parse · txid · BIP-143 sighash.

⚠⚠ THE SILENT FAILURES THIS EXISTS TO AVOID, every one of which produces a well-formed result:
  · an **8-byte amount packed as 4** — identical below 42.9 BTC, wrong above it
  · a **varint written as one byte** past 0xfc — shifts every following field
  · **scriptCode double-prefixed** — BIP-143 PRINTS it with its length already attached
  · **SIGHASH_SINGLE past the last output** — zeros here, NOT Bitcoin's legacy `uint256(1)` bug
  · a **txid not reversed** — the wire order and the display order are opposites, always

★ FORKID changes nothing about the arithmetic: with BSV's fork id of 0, `0x41` serializes as
  `41000000` like any other type. ⇒ Which is why BIP-143's own vectors, with FORKID clear, grade
  this layout end to end.

### Tx.parse

At `const value = Number(readU64LE(b, o)); o += 8`:

⚠ 8 BYTES, not 4. A 4-byte read is identical below 42.9 BTC and silently wrong above it.

At `` if (o !== b.length) throw new Error(`${b.length - o} trailing byte(s) after the transaction`) ``:

⛔ TRAILING BYTES ARE AN ERROR. A parser that ignores them accepts two different transactions as
  the same one, and the txid it reports belongs to neither.

### Tx.txid

⚠ The txid a person reads is the hash REVERSED.

⚠ The txid a person reads is the hash REVERSED — and `reversed` copies, never mutates.

### Tx.fee

★ 100 sat/KB, never ARC's suggestion. ⚠ Rounded UP: a fee below the floor is a stuck tx.

## preimage

@param scriptCode the locking script being spent, RAW — its varint length is added here.
  ⚠⚠ BIP-143's published examples print it WITH the prefix; passing one in unchanged double-prefixes
  it and yields a preimage that is wrong and looks entirely plausible.

At `const base = sighashType & 0x1f`:

⚠ masks off FORKID (0x40) AND ANYONECANPAY (0x80)

At `if (base !== SIGHASH.SINGLE && base !== SIGHASH.NONE)`:

⚠ sequences are committed ONLY for ALL — NONE and SINGLE leave them free to change

At `hashOutputs = dsha256(outBytes(tx.outputs[inputIndex]))`:

⛔ past the last output this stays ZEROS, not Bitcoin's legacy uint256(1) bug — BIP-143 fixed it
