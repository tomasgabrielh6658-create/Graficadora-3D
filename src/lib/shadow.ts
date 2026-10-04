import type { Axis, BBox, Interval } from '../types'
import { intervalsLe0 } from './roots'

export interface MinSample {
  val: number
  t: number
}

function intersectAll(lists: Interval[][]): Interval[] {
  let cur = lists[0]
  for (let k = 1; k < lists.length; k++) {
    const next: Interval[] = []
    let i = 0
    let j = 0
    const other = lists[k]
    while (i < cur.length && j < other.length) {
      const a = Math.max(cur[i].a, other[j].a)
      const b = Math.min(cur[i].b, other[j].b)
      if (b - a > 1e-9) next.push({ a, b })
      if (cur[i].b < other[j].b) i++
      else j++
    }
    cur = next
    if (!cur.length) break
  }
  return cur
}

/**
 * Mínimo de max_i fᵢ a lo largo de un rayo parametrizado por t.
 * Detecta la existencia de tramo interior por INTERSECCIÓN de los
 * intervalos de cada campo por separado: así un pinchazo fino
 * (p. ej. z ≤ r²/4 cerca del origen) no se pierde por el muestreo,
 * aunque el mínimo del máximo tenga una olla más angosta que la grilla.
 */
export function rayFieldMin(
  at: (t: number) => [number, number, number],
  fields: ((x: number, y: number, z: number) => number)[],
  t0: number,
  t1: number,
  samples = 200,
): number {
  const lists = fields.map((f) => intervalsLe0((t) => f(...at(t)), t0, t1, samples))
  if (lists.length && lists.every((l) => l.length)) {
    const inside = intersectAll(lists)
    if (inside.length) {
      // min real del campo combinado dentro de los tramos interiores
      let best = 0
      for (const iv of inside) {
        const n = 24
        for (let i = 0; i <= n; i++) {
          const t = iv.a + ((iv.b - iv.a) * i) / n
          const [x, y, z] = at(t)
          let m = -Infinity
          for (const f of fields) {
            const v = f(x, y, z)
            if (v > m) m = v
          }
          if (m < best) best = m
        }
      }
      return best
    }
  }
  // Fuera: mínimo grosero (positivo) para ubicar el contorno
  let best = Infinity
  const n = 120
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n
    const [x, y, z] = at(t)
    let m = -Infinity
    for (const f of fields) {
      const v = f(x, y, z)
      if (v > m) m = v
    }
    if (m < best) best = m
  }
  return Number.isFinite(best) ? Math.max(best, 1e-9) : 1
}

export function minAlong(
  field: (x: number, y: number, z: number) => number,
  axis: Axis,
  u: number,
  v: number,
  t0: number,
  t1: number,
  samples = 220,
): MinSample {
  let best = Infinity
  let bestT = t0
  for (let i = 0; i <= samples; i++) {
    const t = t0 + ((t1 - t0) * i) / samples
    const val =
      axis === 'x' ? field(t, u, v) : axis === 'y' ? field(u, t, v) : field(u, v, t)
    if (val < best) {
      best = val
      bestT = t
    }
  }
  return { val: best, t: bestT }
}

export function shadowField(
  fields: ((x: number, y: number, z: number) => number)[],
  pierce: Axis,
  t0: number,
  t1: number,
  samples = 200,
): (u: number, v: number) => number {
  const at =
    pierce === 'x'
      ? (t: number, u: number, v: number): [number, number, number] => [t, u, v]
      : pierce === 'y'
        ? (t: number, u: number, v: number): [number, number, number] => [u, t, v]
        : (t: number, u: number, v: number): [number, number, number] => [u, v, t]
  return (u, v) => rayFieldMin((t) => at(t, u, v), fields, t0, t1, samples)
}

export function bounds2D(
  f: (u: number, v: number) => number,
  u0: number,
  u1: number,
  v0: number,
  v1: number,
  n = 44,
): { uLo: number; uHi: number; vLo: number; vHi: number } | null {
  let uLo = Infinity, uHi = -Infinity, vLo = Infinity, vHi = -Infinity
  let found = false
  for (let j = 0; j <= n; j++) {
    const v = v0 + ((v1 - v0) * j) / n
    for (let i = 0; i <= n; i++) {
      const u = u0 + ((u1 - u0) * i) / n
      if (f(u, v) <= 0) {
        found = true
        if (u < uLo) uLo = u
        if (u > uHi) uHi = u
        if (v < vLo) vLo = v
        if (v > vHi) vHi = v
      }
    }
  }
  return found ? { uLo, uHi, vLo, vHi } : null
}

export function planeRanges(
  bbox: BBox,
  plane: 'xy' | 'yz' | 'xz',
): { u0: number; u1: number; v0: number; v1: number; t0: number; t1: number } {
  switch (plane) {
    case 'xy': return { u0: bbox.x0, u1: bbox.x1, v0: bbox.y0, v1: bbox.y1, t0: bbox.z0, t1: bbox.z1 }
    case 'yz': return { u0: bbox.y0, u1: bbox.y1, v0: bbox.z0, v1: bbox.z1, t0: bbox.x0, t1: bbox.x1 }
    case 'xz': return { u0: bbox.x0, u1: bbox.x1, v0: bbox.z0, v1: bbox.z1, t0: bbox.y0, t1: bbox.y1 }
  }
}
