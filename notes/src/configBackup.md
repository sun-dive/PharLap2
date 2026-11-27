# src/configBackup.js

PHAR LAP encrypted config backup.

Most of the wallet's local state is already recoverable from the WIF + chain (holdings rebuild via
Check-incoming; your own alias/avatar live in your published profile). The one thing that ISN'T is your
**address book** — your private labels for other people's keys. This backs that up (plus your alias and UI
prefs) so it survives a device change.

A backup is a `RECORD_CONFIG` PushDrop posted to your OWN address, carrying an **ECIES-to-self** message
envelope (only your key decrypts it) of the config JSON — same publish-to-self / resolve-by-scan pattern as
profiles, but private. Each contact carries an `updatedAt`, so restore can merge newest-wins per contact.

Honest limit: no tombstones — a contact deleted on one device can reappear when another device restores an
older backup that still listed it. (Deletions don't propagate via restore.)

## MAX_CONFIG_SCAN

```ts
const MAX_CONFIG_SCAN = 30
```

Bound how far back we scan your address for the latest backup.

## ConfigBlob

```ts
export interface ConfigBlob {
  schema: number
  alias?: string
  aliasAt?: number
  contacts: Record<string, string>
  contactsAt: Record<string, number>
  prefs?: Record<string, string>
  savedAt: number
}
```

The backed-up config blob. `contacts` maps pubKeyHex → label; `contactsAt` maps pubKeyHex → updatedAt (ms).

## publishConfigBackup

```ts
export async function publishConfigBackup(
  provider: WalletProvider, key: Signer,
  cfg: { alias?: string; aliasAt?: number; contacts: Record<string, string>; contactsAt: Record<string, number>; prefs?: Record<string, string> },
  savedAt: number,
): Promise<string>
```

Publish (or update) your encrypted config backup. Returns the tx id.

At `const envelope = await buildEnvelope({`:

ECIES to SELF (encrypt:true, recipient = own pubkey) → only this key decrypts. Compressed inside buildEnvelope.

At `const funding = selected.map(u => ({ utxo: u }))`:

★ No parent transactions fetched: the script and amount are stated when signing.

At `tx.outputs.push({ value: PHARLAP_OUTPUT_SATS, script: buildConfigScript(pubHex, { envelope }).toB...`:

[0] the config record, self-locked and encrypted   [1] change

## resolveConfigBackup

```ts
export async function resolveConfigBackup(provider: WalletProvider, key: Signer): Promise<ConfigBlob | null>
```

Resolve your latest config backup from your own address, and decrypt it with your key. Null if none.

At `const address = p2pkhAddress(key.publicKey())`:

⚠ derived from the key we hold, rather than parsed back out of its own hex

At `try { for (const h of await provider.getAddressHistory(address)) heightByTx.set(h.txId, h.blockHe...`:

best-effort

At `try { for (const txId of await provider.getRecentTxIdsForAddress(address)) if (!heightByTx.has(tx...`:

best-effort

At `if (c == null || c.ownerPubKeyHex.toLowerCase() !== mine) continue`:

self-locked = your own backup

At `if (opened == null || opened.senderPubKeyHex.toLowerCase() !== mine) continue`:

sent by you

At `if (blob != null && typeof blob === 'object' && blob.contacts != null) return blob`:

newest valid one wins

At `} catch {`:

malformed — keep scanning older ones

## mergeConfig

```ts
export function mergeConfig(
  local: { alias?: string; aliasAt?: number; contacts: Record<string, string>; contactsAt: Record<string, number> },
  backup: ConfigBlob,
): { alias?: string; aliasAt?: number; contacts: Record<string, string>; contactsAt: Record<string, number>; changed: number }
```

Merge a restored backup into local state, NEWEST-WINS per contact. Pure; returns the merged result + a
 count of entries the backup contributed (added or updated), so the UI can report what changed.

At `if (lAt < 0 || bAt > lAt) {`:

not present locally, or the backup's label is newer

At `let alias = local.alias, aliasAt = local.aliasAt`:

Alias: newest-wins too.
