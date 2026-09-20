import assert from 'node:assert/strict'
import { afterEach, it } from 'node:test'
import { importImage } from '../src/imageImport.ts'

const originalReader = Object.getOwnPropertyDescriptor(globalThis, 'FileReader')
const originalImage = Object.getOwnPropertyDescriptor(globalThis, 'Image')
afterEach(() => {
  for (const [key, descriptor] of [['FileReader', originalReader], ['Image', originalImage]] as const) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else Reflect.deleteProperty(globalThis, key)
  }
})

function fakeBrowser(failure?: 'read' | 'decode') {
  Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: class {
    result = 'data:image/png;base64,test'
    onload = () => {}
    onerror = () => {}
    readAsDataURL() { queueMicrotask(() => failure === 'read' ? this.onerror() : this.onload()) }
  } })
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: class {
    naturalWidth = 600
    naturalHeight = 1200
    onload = () => {}
    onerror = () => {}
    set src(_value: string) { queueMicrotask(() => failure === 'decode' ? this.onerror() : this.onload()) }
  } })
}

it('imports a decoded photo with its original aspect ratio', async () => {
  fakeBrowser()
  assert.deepEqual(await importImage({} as File), { imageUrl: 'data:image/png;base64,test', width: 90, height: 180 })
})
it('reports unreadable photos instead of silently ignoring them', async () => {
  fakeBrowser('read')
  await assert.rejects(importImage({} as File), /could not be read/)
})
it('reports unsupported image formats instead of silently ignoring them', async () => {
  fakeBrowser('decode')
  await assert.rejects(importImage({} as File), /PNG or JPG/)
})
