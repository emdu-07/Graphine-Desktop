import assert from 'node:assert/strict'
import { it } from 'node:test'
import { panViewport } from '../src/viewport.ts'

it('pans beyond every canvas edge at any zoom level', () => {
  for (const scale of [.35, 1, 3]) {
    const initial = { x: 0, y: 0, scale }
    const negative = panViewport(initial, 10000, 12000)
    assert.deepEqual(negative, { x: -10000, y: -12000, scale })
    assert.deepEqual(panViewport(negative, -20000, -24000), { x: 10000, y: 12000, scale })
    assert.deepEqual(initial, { x: 0, y: 0, scale })
  }
})
