/** Fit imports within 180 × 180 pixels without stretching or enlarging them. */
export function fitImportedImage(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  const scale = Math.min(1, 180 / width, 180 / height)
  return { width: width * scale, height: height * scale }
}
