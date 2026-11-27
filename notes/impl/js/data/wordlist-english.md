# impl/js/data/wordlist-english.mjs

## WORDLIST_ENGLISH

BIP-39's official English wordlist, 2048 words.

★ SPECIFICATION DATA, not code: BIP-39 defines the mapping from index to word, so any conforming
  implementation must use exactly these words in exactly this order. Substituting any of them
  produces a wallet no other implementation can restore.
  ⇒ Verified byte-identical to `bitcoin/bips`:
    sha256 2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda

⚠ It lives in a MODULE rather than a text file because the wallet is browser-only: there is no
  filesystem to read it from, and `node:fs` cannot be bundled for a browser at all.
