export function panViewport(viewport: { x: number; y: number; scale: number }, deltaX: number, deltaY: number) {
  return { ...viewport, x: viewport.x - deltaX, y: viewport.y - deltaY }
}
