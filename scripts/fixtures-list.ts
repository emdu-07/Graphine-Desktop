import { fileURLToPath } from 'node:url'
import process from 'node:process'
import { loadFixtureCatalog } from './fixtures/catalog.ts'

if (process.argv.length !== 2) {
  console.error('Usage: npm run fixtures:list')
  process.exitCode = 1
} else {
  try {
    const root = fileURLToPath(new URL('../tests/fixtures/alight/', import.meta.url))
    const catalog = await loadFixtureCatalog(root)
    console.log(['ID', 'CATEGORY', 'PRIMARY CONSTRUCT', 'XML AVAILABLE', 'RENDER AVAILABLE', 'PROVENANCE', 'RENDERER VERIFIED'].join('\t'))
    for (const { fixture, xmlAvailable, renderAvailable } of catalog.entries) {
      console.log([fixture.id, fixture.category, fixture.primaryConstruct, xmlAvailable, renderAvailable, fixture.provenance, fixture.rendererVerified && xmlAvailable && renderAvailable].join('\t'))
    }
    for (const error of catalog.errors) console.error(`${error.path}: ${error.message}`)
    if (catalog.errors.length) process.exitCode = 1
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
