# impl/js/bip39.mjs

BIP-39 — mnemonic ⇄ seed.

⚠⚠⚠ WHY A MNEMONIC AND NOT HEX. **Hex has no checksum**: transpose two characters and you get a
DIFFERENT VALID KEY, silently, pointing at nothing. A mnemonic is writable by hand and **checkable**.
★ It is load-bearing for the exit story — swap devices, restore, keep your threads — and that story
depends entirely on the key surviving the device change.

⚠⚠ NFKD. BIP-39 requires it before PBKDF2. ★ The English wordlist is pure ASCII, where NFKD is the
identity — so English mnemonics are unaffected. ⛔ Anything else is REFUSED rather than guessed: a
silently different seed is a wallet that cannot recover itself anywhere else, and nothing reveals it
until the day it matters.
  ★★★ THE FULL-WIDTH FOLD IS EXACT, NOT AN APPROXIMATION. A CJK input method in full-width mode turns
  `abandon` into `ａｂａｎｄｏｎ` — visually identical, 21 bytes instead of 7, not in the wordlist. NFKD
  maps U+FF01–U+FF5E to ASCII and U+3000 to a space, so for input made only of those the fold IS the
  NFKD result. ⛔ And it is CHECKED: anything non-ASCII surviving the fold is refused.

⚠ PBKDF2-HMAC-SHA512 at 2048 iterations is weak by modern standards, but it is what BIP-39 specifies
and changing it breaks every wallet in existence. A documented trade, not an oversight.
⚠⚠ `pbkdf2` USED TO BE INJECTED, and this comment said so long after it stopped being true - which is
worse than a stale document, because it sat two lines above the import that contradicts it.
  ★ It is now `@noble/hashes`, directly and SYNCHRONOUSLY, and that is the whole reason this project
    has a dependency at all: **the browser's own crypto cannot do this.** `crypto.subtle` is
    asynchronous, and a seed derivation sitting inside a synchronous key derivation cannot await.
  ⚠ Contrast `contentCrypto.ts`, which DOES use the browser's AES: there the call site can await, so
    the platform's implementation is both usable and better. The rule is not "avoid WebCrypto", it is
    "WebCrypto where the call site can await, and this one cannot".

## nfkd

⚠ ASCII passes through untouched; the full-width fold is exact; anything else is REFUSED.

At `const n = folded.normalize('NFKD')`:

★ JS has String.prototype.normalize, unlike PHP without ext-intl — use it, then re-check.

At `return n`:

⚠ non-ASCII survives: normalize() is authoritative here, so this IS the NFKD form

## fromEntropy

At `const bin = bits(entropy) + bits(sha256(entropy)).slice(0, n / 32)`:

★ THE CHECKSUM: first ENT/32 bits of sha256(entropy). It is what makes a mistyped word detectable.

## toEntropy

⛔ THROWS on a bad checksum or an unknown word — the point of the format.

## toSeed

mnemonic (+ optional passphrase) → 64-byte seed.
⚠⚠ THE SEED DOES NOT DEPEND ON THE MNEMONIC BEING VALID — BIP-39 defines this as PBKDF2 over the
  STRING. ⇒ A wallet must call `toEntropy()` to CHECK it, never infer validity from getting a seed.
★ The passphrase is a 25th word in effect: a different one is a different wallet, with nothing in the
  mnemonic to say another exists.

At `return pbkdf2(sha512, fromUtf8(nfkd(mnemonic, 'mnemonic')),`:

⚠ 2048 iterations and a 64-byte output are BIP-39's numbers. Weak by modern standards, and
  changing either breaks compatibility with every wallet in existence — a documented trade.
