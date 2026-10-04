import type { CompiledConstraint } from '../types'

export interface Region {
  cons: CompiledConstraint[]
  field: (x: number, y: number, z: number) => number
  inside: (x: number, y: number, z: number) => boolean
  dominant: (x: number, y: number, z: number) => CompiledConstraint | null
}

export function buildRegion(cons: CompiledConstraint[]): Region {
  const act = cons.filter((c) => c.visible)
  const fields = act.map((c) => c.field)
  const field = (x: number, y: number, z: number) => {
    let m = -Infinity
    for (let i = 0; i < fields.length; i++) {
      const v = fields[i](x, y, z)
      if (v > m || Number.isNaN(m)) m = v
      if (Number.isNaN(v)) return NaN
    }
    return m
  }
  const inside = (x: number, y: number, z: number) => field(x, y, z) <= 0
  const dominant = (x: number, y: number, z: number) => {
    let best = -Infinity
    let idx = -1
    for (let i = 0; i < fields.length; i++) {
      const v = fields[i](x, y, z)
      if (v > best) {
        best = v
        idx = i
      }
    }
    return idx >= 0 ? act[idx] : null
  }
  return { cons: act, field, inside, dominant }
}
