import assert from 'node:assert/strict'
import { it } from 'node:test'
import { fitImportedImage } from '../src/imageSizing.ts'

it('scales landscape, portrait, square, and narrow images without distortion', () => {
  for (const [width, height] of [[1200, 600], [600, 1200], [900, 900], [4000, 100], [100, 4000]]) {
    const fitted = fitImportedImage(width, height)!
    assert.ok(fitted.width <= 180 && fitted.height <= 180)
    assert.ok(Math.abs(fitted.width / fitted.height - width / height) < 1e-10)
    assert.equal(Math.max(fitted.width, fitted.height), 180)
  }
})

it('keeps small imports at their original size', () => {
  assert.deepEqual(fitImportedImage(80, 120), { width: 80, height: 120 })
})

it('rejects unusable image dimensions', () => {
  for (const value of [0, -1, NaN, Infinity]) {
    assert.equal(fitImportedImage(value, 100), null)
    assert.equal(fitImportedImage(100, value), null)
  }
})
