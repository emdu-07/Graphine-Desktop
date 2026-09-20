import { fitImportedImage } from './imageSizing.ts'

export function importImage(file: File): Promise<{ imageUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('This photo could not be read. Download it to your computer and try again.'))
    reader.onabort = () => reject(new Error('Photo import was interrupted. Please try again.'))
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('This photo could not be read. Please try again.'))
        return
      }
      const imageUrl = reader.result
      const image = new Image()
      image.onerror = () => reject(new Error('This photo could not be opened. Try exporting it as a PNG or JPG and importing that file.'))
      image.onload = () => {
        const dimensions = fitImportedImage(image.naturalWidth, image.naturalHeight)
        if (!dimensions) {
          reject(new Error('This photo has no usable dimensions. Try a PNG or JPG version.'))
          return
        }
        resolve({ imageUrl, ...dimensions })
      }
      image.src = imageUrl
    }
    reader.readAsDataURL(file)
  })
}
