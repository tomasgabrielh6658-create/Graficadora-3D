import { useEffect, useMemo, useState } from 'react'
import { PALETTE, parseConstraint, type FieldFn, type ParsedConstraint } from './expr'
import { SEARCH_2D, SEARCH_3D } from './autofit'
import type { CompiledConstraint } from '../types'
import type { RawConstraint } from './presets'

let counter = 0
const nextId = () => `c${counter++}`

export interface CompiledList {
  cons: CompiledConstraint[]
  errors: (string | null)[]
}

const maxField =
  (fns: FieldFn[]): FieldFn =>
  (x, y, z) => {
    let m = -Infinity
    for (const f of fns) {
      const v = f(x, y, z)
      if (Number.isNaN(v)) return NaN
      if (v > m) m = v
    }
    return m
  }

/**
 * Sondeo rápido de la región: ¿existe en la caja de búsqueda y está acotada?
 * (un barrido grueso; el encuadre fino ya lo hace fitBounds en el módulo).
 */
function probeField(field: FieldFn, dims: '2d' | '3d'): { empty: boolean; bounded: boolean; vol: number } {
  if (dims === '2d') {
    const B = SEARCH_2D
    const n = 56
    let found = false
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    let edge = false
    for (let j = 0; j <= n; j++) {
      const y = B.y0 + ((B.y1 - B.y0) * j) / n
      for (let i = 0; i <= n; i++) {
        const x = B.x0 + ((B.x1 - B.x0) * i) / n
        if (field(x, y, 0) <= 0) {
          found = true
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          if (y > y1) y1 = y
          if (i === 0 || i === n || j === 0 || j === n) edge = true
        }
      }
    }
    return { empty: !found, bounded: found && !edge, vol: (x1 - x0) * (y1 - y0) }
  }
  const B = SEARCH_3D
  const n = 16
  let found = false
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity
  let edge = false
  for (let k = 0; k <= n; k++) {
    const z = B.z0 + ((B.z1 - B.z0) * k) / n
    for (let j = 0; j <= n; j++) {
      const y = B.y0 + ((B.y1 - B.y0) * j) / n
      for (let i = 0; i <= n; i++) {
        const x = B.x0 + ((B.x1 - B.x0) * i) / n
        if (field(x, y, z) <= 0) {
          found = true
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          if (y > y1) y1 = y
          if (z < z0) z0 = z
          if (z > z1) z1 = z
          if (i === 0 || i === n || j === 0 || j === n || k === 0 || k === n) edge = true
        }
      }
    }
  }
  return { empty: !found, bounded: found && !edge, vol: (x1 - x0) * (y1 - y0) * (z1 - z0) }
}

/**
 * Una igualdad del TP ("x^2+y^2 = 4") es una frontera: hay que decidir qué
 * lado queda adentro. `auto` lo resuelve como haría uno en el papel — prueba
 * las combinaciones y se queda con la región acotada de menor volumen.
 */
function resolveAutoSides(
  parsed: ParsedConstraint[],
  raws: RawConstraint[],
  dims: '2d' | '3d',
): Map<number, 'le' | 'ge'> {
  const resolved = new Map<number, 'le' | 'ge'>()
  const autos: number[] = []
  raws.forEach((r, i) => {
    if (r.side === 'auto' && r.visible && parsed[i].ok && parsed[i].needsSide && parsed[i].build) autos.push(i)
  })
  if (!autos.length) return resolved

  const fixed: FieldFn[] = []
  const autosSet = new Set(autos)
  raws.forEach((r, i) => {
    if (autosSet.has(i) || !r.visible || !parsed[i].ok || !parsed[i].build) return
    fixed.push(parsed[i].build!(r.side === 'ge' ? 'ge' : 'le').field)
  })
  const variants = autos.map((i) => [parsed[i].build!('le').field, parsed[i].build!('ge').field])

  const m = Math.min(autos.length, 5) // 2^5 = 32 combinaciones máx
  let bestBounded: { vol: number; mask: number } | null = null
  let bestAny: { vol: number; mask: number } | null = null
  for (let mask = 0; mask < 1 << m; mask++) {
    const fs = [...fixed]
    for (let k = 0; k < m; k++) fs.push(variants[k][(mask >> k) & 1])
    const p = probeField(maxField(fs), dims)
    if (p.empty) continue
    const cand = { vol: p.vol, mask }
    if (p.bounded) {
      if (!bestBounded || p.vol < bestBounded.vol) bestBounded = cand
    } else if (!bestAny || p.vol < bestAny.vol) bestAny = cand
  }
  const win = bestBounded ?? bestAny
  autos.forEach((idx, k) => {
    resolved.set(idx, k >= m || !win ? 'le' : (win.mask >> k) & 1 ? 'ge' : 'le')
  })
  return resolved
}

export function compileConstraints(
  raws: RawConstraint[],
  dims: '2d' | '3d',
): CompiledList {
  const parsed = raws.map((r) => parseConstraint(r.raw, dims))
  const auto = resolveAutoSides(parsed, raws, dims)
  const cons: CompiledConstraint[] = []
  const errors: (string | null)[] = []
  raws.forEach((r, i) => {
    const p = parsed[i]
    if (!p.ok || !p.build) {
      errors.push(p.error ?? 'Expresión inválida')
      cons.push({
        id: nextId(), raw: r.raw, latex: r.raw, color: r.color,
        visible: r.visible, kind: r.side === 'ge' ? 'ge' : 'le',
        field: () => 1e30, boundary: () => NaN,
      })
      return
    }
    errors.push(null)
    const side = r.side === 'auto' ? auto.get(i) ?? 'le' : r.side
    const built = p.build(side)
    cons.push({
      id: `${i}-${r.raw}-${r.side}:${side}`,
      raw: r.raw,
      // con `=` la fila muestra la ecuación del TP, no la desigualdad elegida
      latex: r.side === 'auto' && p.previewTex ? p.previewTex : built.latex,
      color: r.color,
      visible: r.visible,
      kind: side,
      field: built.field,
      boundary: built.boundary,
    })
  })
  return { cons, errors }
}

/**
 * Compila las restricciones con un pequeño debounce: teclear actualiza el
 * texto al instante y la región (marching squares, límites, encuadre) se
 * recalcula una vez que se pausa — no en cada tecla.
 */
export function useCompiled(raws: RawConstraint[], dims: '2d' | '3d'): CompiledList {
  const [lagged, setLagged] = useState(raws)
  useEffect(() => {
    if (lagged === raws) return
    const t = setTimeout(() => setLagged(raws), 240)
    return () => clearTimeout(t)
  }, [raws, lagged])
  return useMemo(() => compileConstraints(lagged, dims), [lagged, dims])
}

export const nextColor = (existing: RawConstraint[]) =>
  PALETTE[existing.length % PALETTE.length]
