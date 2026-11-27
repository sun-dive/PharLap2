# impl/js/signer.mjs

══ THE SIGNER — turning a key and a transaction into an unlocking script ═══════════════════════════

★ Everything under this was already built and graded. This module only ASSEMBLES it:

    sighash (BIP-143)  →  sign (RFC 6979)  →  DER + type byte  →  `<sig> <pubkey>`

⚠⚠⚠ THE SCRIPT CODE AND THE AMOUNT COME FROM THE UTXO, NEVER FROM THE TRANSACTION. A transaction does
  not contain the outputs it spends, which is precisely why BIP-143 has to be told. ⇒ Get either one
  wrong and the signature is well formed, the transaction serializes, the txid looks fine, and it is
  rejected by every node that sees it.

⚠⚠ `lowS` DEFAULTS ON HERE BECAUSE THIS SIDE BROADCASTS. It is not a protocol rule - Chronicle removed
  it, and a transaction opting in with version > 1 is valid without it - but a BROADCASTER may still
  refuse a high-s signature, and this project has had a conformant spend refused for exactly that
  (ARC error 461). Normalising costs nothing on a key signature.
  ⛔ A COVENANT IS THE OPPOSITE CASE and must not inherit this default: there the signature is
    recomputed inside the script, so grinding it changes what the covenant checks against itself.

## DEFAULT_PATH

★ The same path the sibling wallet uses, so one phrase restores the same keys in both. 236 is BSV.

### Signer.constructor

⚠⚠ `compressed` TRAVELS WITH THE KEY, and that is not a detail: the same private key spends a
  DIFFERENT address compressed and uncompressed. ⇒ Importing a WIF and then defaulting to
  compressed hands back an address holding nothing, for a key that is provably yours.

### Signer.fromWif

⛔ NEVER ASK ANYONE FOR A WIF. This exists so a user can import a key THEY produced, on their own
  machine. The standing rule is that a key is never solicited.

### Signer.fromSeed

★ From a written-down phrase. ⚠ BIP-32, not SLIP-0010 - see bip32.mjs for why they differ.

### Signer.toWif

⚠ EXPORTS THE PRIVATE KEY. The caller is showing this to its owner and to nobody else.

### Signer.lockingScript

The locking script that pays THIS key. ★ What a change output wants.

### Signer.signInput

Sign one input. Returns the DER signature **with the sighash-type byte appended**, which is what an
unlocking script actually carries.

@param scriptCode the LOCKING script of the output being spent, raw and unprefixed
@param amount     that output's satoshis

At `return concat(sign(this.d, digest, { lowS }), Uint8Array.of(sighashType))`:

★ The trailing byte is part of the signature as scripts see it, which is why `decodeDer` stayed
  STRICT by default and takes `allowTrailing` explicitly.

### Signer.unlockP2PKH

The P2PKH unlocking script: `<signature+type> <pubkey>`.

★ Both pushes go through `minimalPush`, so the encoding is the shortest legal one and matches what
  the rest of the wallet produces. ⚠ A signature is ~71-72 bytes and a public key 33 or 65, so both
  land in the direct-push range - but stating that as an assumption rather than relying on it is
  how the wrong push form gets emitted the day one of them changes.

### Signer.signP2PKH

Sign every input of a P2PKH transaction, IN PLACE.

@param utxos aligned with `tx.inputs`, each `{ txid, vout, value, script }`

⚠⚠⚠ THE ALIGNMENT IS CHECKED, NOT ASSUMED. Handing these in the wrong ORDER signs each input against
  another output's script and amount ⇒ **every signature is well formed and every one is invalid**,
  with nothing in the transaction to say so. ⇒ The outpoints are compared and a mismatch is refused.

★ Signing order does not matter. A BIP-143 preimage commits to the other inputs only through
  `hashPrevouts` and `hashSequence`, never through their unlocking scripts, so a script written into
  input 0 cannot change the digest for input 1. (Under the legacy algorithm it could, which is one
  of the things BIP-143 fixed. The suite proves it here rather than trusting the reasoning.)

### Signer.verifyInput

Verify one input's signature the way a script would.

At `return verifyDigest(sigWithType, pub, sighash(tx, inputIndex, scriptCode, amount, type), true)`:

⚠ allowTrailing: the sighash byte follows the DER, so strict parsing would reject a valid one.

## wireTxid

⚠⚠⚠ A txid IS 32 BYTES IN WIRE ORDER HERE, NOT THE HEX A BLOCK EXPLORER SHOWS. The two are reverses of
  each other, and a reversed txid is still a perfectly valid-looking 32-byte txid, so nothing
  downstream can tell them apart.
  ⇒ MEASURED, not argued: passing a UTXO whose `txid` is a display hex STRING through `coins.build()`
    produces a transaction with a **ZEROED** txid that serializes without error and reports a
    confident, wrong txid. ⇒ So a string is refused here rather than coerced, and the message says
    which direction to convert. This is the last place the mistake is still cheap.

## assertAmount

⚠ A wrong amount is the other silent failure: the signature commits to it, nothing else does.

## txidToWire

★ Convenience for the common direction: an explorer's txid into the bytes this module wants.

## wireToTxid

★ And back, for display.
