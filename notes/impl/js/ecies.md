# impl/js/ecies.mjs

══ TWO-PARTY ENCRYPTION ════════════════════════════════════════════════════════════════════════════

★★★ THE FORMAT IS FIXED BY MESSAGES ALREADY SENT. It was established here by MEASURING what the
  deployed wallet produces, not by reading a specification and hoping, because a message that was
  encrypted last year has to open next year:

    S    = compressed(theirPublicKey × ourPrivateKey)          ECDH
    H    = SHA-512(S)
    iv   = H[0..16]      keyE = H[16..32]      keyM = H[32..64]
    out  = "BIE1" ‖ AES-128-CBC(iv, keyE, PKCS#7(message)) ‖ HMAC-SHA256(keyM, "BIE1" ‖ ciphertext)

⚠⚠ AES-**128**, not 256, and that is recorded rather than chosen: `keyE` is 16 bytes of the digest.
  Widening it would be a different scheme and every message already sent would stop opening.

⚠⚠⚠ AND IT IS DETERMINISTIC. The IV is derived from the shared secret, so encrypting the same message
  to the same recipient twice produces IDENTICAL BYTES. ⇒ That leaks equality: an observer can tell
  that two messages between the same pair have the same contents, without learning what they are.
  ⛔ This is a property of the deployed format, not a bug introduced here, and it cannot be fixed
    without breaking compatibility. It is written down so nobody has to rediscover it, and so nobody
    assumes a freshness this does not provide.

★ Encrypt-then-MAC, and the MAC is checked BEFORE anything is decrypted. Verifying afterwards would
  mean running a cipher over bytes an attacker chose.

## MAGIC

⚠ Four bytes of the wire format. Not a version to bump - old messages carry exactly these.

## sharedSecret

The shared secret both sides compute.
★ ECDH: `theirs × ours` gives the same point as `ours × theirs`, which is the whole trick. It is
  serialized COMPRESSED before hashing - the uncompressed form would hash differently and open
  nothing.

At `const point = decodePoint(pub)`:

⚠⚠ `decodePoint` REPORTS FAILURE BY RETURNING null, NOT BY THROWING. I wrapped this in a try/catch
  first, which never fired, so a malformed key sailed through to the multiply. ⇒ Measured, so as not
  to overstate it: `mul` also returns null, and `serP` then throws "Cannot read properties of null
  (reading 'y')". It failed - but with a curve-internals error instead of saying which argument was
  wrong, which is the difference between a caller fixing it and a caller filing a bug.

At `return sha512(serP(mulBlinded(priv, point)))`:

⚠ priv is SECRET

## encrypt

Encrypt `msg` so that the holder of `theirPub` can read it, provably from the holder of `ourPriv`.

⚠ The sender's public key is NOT embedded. The deployed format carries it alongside, in the message
  envelope, so `decrypt` has to be told who sent it. That is not an omission to fix here: adding it
  would change the bytes and break every message already sent.

At `const key = await importAes(keyE, 'encrypt')`:

⚠ WebCrypto applies PKCS#7 itself, which is what the deployed format uses - hence 0 bytes of
  plaintext still producing one full block.

## decrypt

Open a message sent to us by the holder of `theirPub`.

⛔ Throws on a bad MAC, a truncated message or a wrong magic. It never returns partial plaintext:
  the only two outcomes are the real message and an exception.

At `if (!timingSafeEquals(hmac(sha256, keyM, body), mac))`:

⚠⚠ THE MAC IS CHECKED FIRST, and with a timing-safe compare. Decrypting before verifying would run
  a cipher over attacker-chosen bytes; comparing with === would leak how much of the MAC matched.

At `throw new EciesError('the message authenticated but its padding is malformed')`:

⚠ Only reachable if the padding is wrong on bytes whose MAC verified, which means the sender
  produced them incorrectly rather than an attacker altering them.

## encryptToSelf

★ To ourselves - the shape a settings backup uses. Same scheme, both keys ours.
