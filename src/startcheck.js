// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
document.querySelector('script[type="module"][src="./src/app.js"]').addEventListener('error', () => {
  document.getElementById('status').hidden = true
  document.getElementById('startFailed').hidden = false
})
