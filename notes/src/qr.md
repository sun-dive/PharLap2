# src/qr.js

QR helpers for PHAR LAP: render text to a crisp inline-SVG QR code, and build a BSV payment URI.
Thin wrapper over the vendored Nayuki generator (qrcodegen.js).

## bsvPaymentUri

```ts
export function bsvPaymentUri(address: string, amountSats?: number): string
```

Build a BSV payment URI. Current BSV standard for an address payment request is BIP21
(`bitcoin:<address>?amount=<BSV>`, amount in whole BSV). With no amount, returns the plain address —
neutral and the most universally scannable (no `bitcoin:` scheme that could open a BTC wallet).
Isolated here so the scheme/format is a one-line change if the BSV standard ever shifts.

## qrSvg

```ts
export function qrSvg(text: string, opts?: { border?: number; dark?: string; light?: string }): string
```

Render `text` as a QR code, returned as an inline SVG string (dark modules on white, with a quiet zone).
