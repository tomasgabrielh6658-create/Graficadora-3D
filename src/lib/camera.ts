import type { BBox } from '../types'

export type Vec3 = [number, number, number]
export type ViewName = 'home' | 'top' | 'front' | 'side'

export const FOV = 40

export function bboxCenter(b: BBox): Vec3 {
  return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2]
}

/** Radio de la esfera que envuelve al bbox (lo que tiene que entrar en pantalla). */
export function bboxRadius(b: BBox): number {
  return Math.hypot(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0) / 2
}

/**
 * Pose de cámara para cada vista. Las vistas planas miran exactamente a lo
 * largo de un eje (en ortográfica no hay paralaje: un punto cae sobre su marca
 * del eje sin importar la profundidad). En XY se corre un ε en −y para que
 * "arriba = +z" no quede paralelo a la dirección de mirada (lookAt degenerado).
 */
export function viewPose(b: BBox, view: ViewName): { position: Vec3; target: Vec3 } {
  const c = bboxCenter(b)
  const d = bboxRadius(b) * 4
  const dir: Vec3 =
    view === 'top' ? [0, -1e-4, 1]
    : view === 'front' ? [0, -1, 0]
    : view === 'side' ? [1, 0, 0]
    : [0.62, -0.95, 0.58]
  const l = Math.hypot(...dir)
  return { position: [c[0] + (dir[0] / l) * d, c[1] + (dir[1] / l) * d, c[2] + (dir[2] / l) * d], target: c }
}

/** Zoom ortográfico (px por unidad) para que el bbox entre con margen. */
export function fitZoom(b: BBox, width: number, height: number, margin = 1.08): number {
  return Math.max(1e-3, Math.min(width, height) / (2 * bboxRadius(b) * margin))
}

/** Distancia de cámara en perspectiva para el mismo encuadre. */
export function fitDistance(b: BBox, margin = 1.08): number {
  return (bboxRadius(b) * margin) / Math.sin(((FOV / 2) * Math.PI) / 180)
}
