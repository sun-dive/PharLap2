# src/startcheck.js

Tells the visitor when the app did not start. A classic script, not a module, so it runs even when the app's
modules are refused; index.html loads it, with its own hash, just after the app's module script.

The browser fires `error` on the app's module script when any file in its import chain is refused (a hash that
does not match the import map) or cannot be fetched. No app code has run then, so the page would otherwise stay on
"Loading…" for good. This hides that line and shows the message index.html holds (`#startFailed`). Measured in
Chromium 158 and Firefox 160: the event fires in every refused case, whatever the cache headers.

If this file is itself changed, the browser refuses it too, and the visitor sees "Loading…" without the message.
