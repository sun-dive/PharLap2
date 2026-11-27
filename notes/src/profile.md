# src/profile.js

PHAR LAP self-published profile (display alias + small avatar).

A key publishes ONE `RECORD_PROFILE` PushDrop output locked to its own pubkey, on its own address — the
same publish-to-self / resolve-by-scan pattern as broadcasts and seller notes. Anyone can resolve a key's
profile by deriving its address and scanning for the newest RECORD_PROFILE (latest-by-height wins), so a
reader sees a key's @name + face even without a prior message. Self-gated: only that key funds txs on its
address, so an impostor can't plant a profile there.

The avatar is a SMALL pre-downscaled image (see thumbs.downscaleToAvatar) — published once, never per
message, so it doesn't bloat ordinary messaging.

## MAX_PROFILE_SCAN

```ts
const MAX_PROFILE_SCAN = 30
```

Bound how far back we scan a key's history for its latest profile.

## publishProfile

```ts
export async function publishProfile(
  provider: WalletProvider, key: Signer,
  profile: { alias?: string; avatar?: { mimeType: string; bytes: number[] } },
): Promise<string>
```

Publish (or update) your profile: a RECORD_PROFILE output locked to your pubkey, on your address.

## resolveProfile

```ts
export async function resolveProfile(provider: WalletProvider, ownerPubKeyHex: string): Promise<ProfileFields | null>
```

Resolve a key's latest published profile by scanning its address, or null if it has none.

At `try { for (const txId of await provider.getRecentTxIdsForAddress(address)) if (!heightByTx.has(tx...`:

best-effort

At `.sort((a, b) => (b[1] || 1e12) - (a[1] || 1e12))`:

newest first; unconfirmed → top

At `if (p != null && p.ownerPubKeyHex.toLowerCase() === owner) return p.fields`:

newest-first → first hit is latest
