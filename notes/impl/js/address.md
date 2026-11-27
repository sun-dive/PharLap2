# impl/js/address.mjs

WIF and base58check — the BSV side.

⚠⚠ THE TRAILING 0x01 IS NOT DECORATION. It means "this key is used COMPRESSED". Omitting it gives a
DIFFERENT ADDRESS for the same key, which is a classic way to lose funds that are provably yours.
⇒ So the flag TRAVELS with the key, through import and export, and is never re-defaulted.

★ NOTE FOR ANYONE ARRIVING FROM jetmora: §2c-i forbids **jetmora** emitting a base58check address, so
  its `Base58Check` has no `encode()` at all. ⛔ That rule is jetmora's and does NOT cross — this is
  the BSV side, where writing an address is the entire job.

## b58decode

@returns {{version:number, payload:Uint8Array}|null} — null rather than throwing: callers test with it

At `const lead = s.length - s.replace(/^1+/, '').length`:

⚠ leading '1's are leading ZERO BYTES, and they are data — dropping them changes the payload

## wifDecode

@returns {{key:Uint8Array, compressed:boolean, version:number}|null}

At `if (compressed && b[33] !== 0x01) return null`:

⚠ only 0x01 is a valid suffix

## scriptForAddress

A mainnet P2PKH locking script for an address, or throw.

★ Used wherever an address arrives from OUTSIDE - a recipient someone typed or pasted - which is the
  one place a bad address can reach the wallet. ⚠ It validates by DECODING: the base58 checksum, the
  payload length and the version byte all have to be right, so a typo fails here rather than building
  a transaction that pays a script nobody can ever spend.
