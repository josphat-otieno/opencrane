/**
 * Copies the control-plane's emitted OpenAPI 3.1 spec into the site's public
 * directory so VitePress can serve it and `vitepress-openapi` can render the
 * interactive API reference from it.
 *
 * The spec is the single source of truth (`apps/clustertenant-manager/openapi.json`,
 * emitted at build time and guarded by a CI drift gate), so this is a pure copy
 * — the website never hand-edits the API surface.
 */
import { copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = resolve(here, '../../apps/clustertenant-manager/openapi.json')
const dest = resolve(here, '../public/openapi.json')

if (!existsSync(source)) {
  console.error(
    `[sync-openapi] spec not found at ${source}\n` +
      `Run \`pnpm --filter @opencrane/clustertenant-manager emit-openapi\` first.`,
  )
  process.exit(1)
}

mkdirSync(dirname(dest), { recursive: true })
copyFileSync(source, dest)
console.log(`[sync-openapi] copied ${source} -> ${dest}`)
