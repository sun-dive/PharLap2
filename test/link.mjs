// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * Points a test at an application module itself, as the browser loads it.
 *
 * Takes the same `{ entryPoints, outfile }` a bundler call would, and writes `outfile` as a one-line module that
 * re-exports the real file. The test then imports the shipped code, with no bundle between, and every import of
 * the same file shares one copy, as on the page.
 */
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export async function link({ entryPoints, outfile }) {
  if (entryPoints?.length !== 1 || outfile == null) throw new Error('link: one entry point and an outfile')
  const url = pathToFileURL(entryPoints[0]).href
  writeFileSync(outfile, `export * from ${JSON.stringify(url)}\n`)
}
