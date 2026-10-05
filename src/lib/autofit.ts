import type { BBox } from '../types'

export const SEARCH_3D: BBox = { x0: -10, x1: 10, y0: -10, y1: 10, z0: -10, z1: 10 }
export const SEARCH_2D = { x0: -15, x1: 15, y0: -15, y1: 15 }

export interface FitResult {
  bbox: BBox
  clipped: boolean
}

const pad = (lo: number, hi: number): [number, number] => {
  const p = Math.max((hi - lo) * 0.15, 0.6)
  return [lo - p, hi + p]
}

interface Scan3D {
  found: boolean
  bbox: BBox
  sides: [boolean, boolean, boolean, boolean, boolean, boolean]
}

function scan3D(field: (x: number, y: number, z: number) => number, box: BBox, n: number): Scan3D {
  let x0 = Infinity, x1 = -Infinity
  let y0 = Infinity, y1 = -Infinity
  let z0 = Infinity, z1 = -Infinity
  const sides: Scan3D['sides'] = [false, false, false, false, false, false]
  let found = false
  for (let k = 0; k <= n; k++) {
    const z = box.z0 + ((box.z1 - box.z0) * k) / n
    for (let j = 0; j <= n; j++) {
      const y = box.y0 + ((box.y1 - box.y0) * j) / n
      for (let i = 0; i <= n; i++) {
        const x = box.x0 + ((box.x1 - box.x0) * i) / n
        if (field(x, y, z) <= 0) {
          found = true
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          if (y > y1) y1 = y
          if (z < z0) z0 = z
          if (z > z1) z1 = z
          if (i === 0) sides[0] = true
          if (i === n) sides[1] = true
          if (j === 0) sides[2] = true
          if (j === n) sides[3] = true
          if (k === 0) sides[4] = true
          if (k === n) sides[5] = true
        }
      }
    }
  }
  const [bx0, bx1] = pad(x0, x1)
  const [by0, by1] = pad(y0, y1)
  const [bz0, bz1] = pad(z0, z1)
  return { found, bbox: { x0: bx0, x1: bx1, y0: by0, y1: by1, z0: bz0, z1: bz1 }, sides }
}

export function fitBounds3D(
  field: (x: number, y: number, z: number) => number,
  search: BBox = SEARCH_3D,
  n = 30,
): FitResult | null {
  let box = { ...search }
  let last = scan3D(field, box, n)
  // Una región chica puede caer entre los puntos de la grilla gruesa
  // (p. ej. un tetraedro de lado ~1 en la caja [-10,10]³): se reintenta fino.
  if (!last.found) last = scan3D(field, box, 80)
  if (!last.found) return null
  // Pasadas de refinamiento: la grilla gruesa puede subestimar extremos finos,
  // así que se re-escanea dentro del bbox acolchado. Si algún lado sigue
  // cortado, ese lado se expande y se reintenta.
  for (let iter = 0; iter < 4; iter++) {
    box = { ...last.bbox }
    const ex = box.x1 - box.x0, ey = box.y1 - box.y0, ez = box.z1 - box.z0
    if (last.sides[0]) box.x0 -= ex
    if (last.sides[1]) box.x1 += ex
    if (last.sides[2]) box.y0 -= ey
    if (last.sides[3]) box.y1 += ey
    if (last.sides[4]) box.z0 -= ez
    if (last.sides[5]) box.z1 += ez
    const s = scan3D(field, box, n)
    if (!s.found) break
    last = s
    if (!s.sides.some(Boolean)) {
      // una pasada más confirma que el encuadre ya no crece
      const again = scan3D(field, s.bbox, n)
      if (again.found && !again.sides.some(Boolean)) return { bbox: again.bbox, clipped: false }
      return { bbox: s.bbox, clipped: false }
    }
  }
  return { bbox: last.bbox, clipped: true }
}

export interface FitResult2D {
  view: { x0: number; x1: number; y0: number; y1: number }
  clipped: boolean
}

interface Scan2D {
  found: boolean
  view: { x0: number; x1: number; y0: number; y1: number }
  sides: [boolean, boolean, boolean, boolean]
}

function scan2D(field: (x: number, y: number) => number, box: { x0: number; x1: number; y0: number; y1: number }, n: number): Scan2D {
  let x0 = Infinity, x1 = -Infinity
  let y0 = Infinity, y1 = -Infinity
  const sides: Scan2D['sides'] = [false, false, false, false]
  let found = false
  for (let j = 0; j <= n; j++) {
    const y = box.y0 + ((box.y1 - box.y0) * j) / n
    for (let i = 0; i <= n; i++) {
      const x = box.x0 + ((box.x1 - box.x0) * i) / n
      if (field(x, y) <= 0) {
        found = true
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
        if (i === 0) sides[0] = true
        if (i === n) sides[1] = true
        if (j === 0) sides[2] = true
        if (j === n) sides[3] = true
      }
    }
  }
  const [bx0, bx1] = pad(x0, x1)
  const [by0, by1] = pad(y0, y1)
  return { found, view: { x0: bx0, x1: bx1, y0: by0, y1: by1 }, sides }
}

export function fitBounds2D(
  field: (x: number, y: number) => number,
  search = SEARCH_2D,
  n = 70,
): FitResult2D | null {
  let box = { ...search }
  let last = scan2D(field, box, n)
  if (!last.found) last = scan2D(field, box, 180)
  if (!last.found) return null
  for (let iter = 0; iter < 4; iter++) {
    box = { ...last.view }
    const ex = box.x1 - box.x0, ey = box.y1 - box.y0
    if (last.sides[0]) box.x0 -= ex
    if (last.sides[1]) box.x1 += ex
    if (last.sides[2]) box.y0 -= ey
    if (last.sides[3]) box.y1 += ey
    const s = scan2D(field, box, n)
    if (!s.found) break
    last = s
    if (!s.sides.some(Boolean)) return { view: s.view, clipped: false }
  }
  return { view: last.view, clipped: true }
}
