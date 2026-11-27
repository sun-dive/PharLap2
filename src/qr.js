// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
import { qrcodegen } from './qrcodegen.js'

const QrCode = qrcodegen.QrCode

export function bsvPaymentUri(address, amountSats) {
  if (amountSats == null || amountSats <= 0) return address
  const bsv = (amountSats / 1e8).toFixed(8).replace(/0+$/, '').replace(/\.$/, '')
  return `bitcoin:${address}?amount=${bsv}`
}

export function qrSvg(text, opts) {
  const border = opts?.border ?? 3
  const dark = opts?.dark ?? '#000000'
  const light = opts?.light ?? '#ffffff'
  const qr = QrCode.encodeText(text, QrCode.Ecc.MEDIUM)
  const dim = qr.size + border * 2
  let path = ''
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.getModule(x, y)) path += `${path ? ' ' : ''}M${x + border},${y + border}h1v1h-1z`
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges" role="img" aria-label="QR code">` +
    `<rect width="${dim}" height="${dim}" fill="${light}"/><path d="${path}" fill="${dark}"/></svg>`
}
