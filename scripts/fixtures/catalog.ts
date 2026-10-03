import { readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { validateFixtureManifest } from './validation.ts'
import type { AlightFixture, FixtureIssue, FixtureManifest } from './types.ts'

export interface FixtureAvailability {
  fixture: AlightFixture
  xmlAvailable: boolean
  renderAvailable: boolean
  sourceMediaAvailable: boolean
}

/** Separate I/O validation also rejects missing files and symlinks escaping the corpus. */
export async function inspectFixtureAssets(manifest: FixtureManifest, root: string): Promise<{ entries: FixtureAvailability[]; errors: FixtureIssue[] }> {
  const errors: FixtureIssue[] = []
  const corpus = await realpath(root)
  const entries: FixtureAvailability[] = []
  for (const [index, fixture] of manifest.fixtures.entries()) {
    const available: Record<string, boolean> = {}
    for (const key of ['xmlPath', 'renderPath', 'sourceMediaPath'] as const) {
      const path = fixture[key]
      available[key] = false
      if (path === undefined) continue
      try {
        const asset = await realpath(resolve(corpus, path))
        const fromRoot = relative(corpus, asset)
        if (!fromRoot || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) throw new Error('Asset resolves outside the corpus')
        if (!(await stat(asset)).isFile()) throw new Error('Asset is not a regular file')
        available[key] = true
      } catch (error) {
        errors.push({ path: `$.fixtures[${index}].${key}`, message: error instanceof Error ? error.message : String(error) })
      }
    }
    entries.push({ fixture, xmlAvailable: available.xmlPath, renderAvailable: available.renderPath, sourceMediaAvailable: available.sourceMediaPath })
  }
  return { entries, errors }
}

export async function loadFixtureCatalog(root: string) {
  const parsed: unknown = JSON.parse(await readFile(resolve(root, 'fixture-manifest.json'), 'utf8'))
  const result = validateFixtureManifest(parsed)
  if (!result.valid) return { entries: [], errors: result.errors }
  return inspectFixtureAssets(result.manifest, root)
}
