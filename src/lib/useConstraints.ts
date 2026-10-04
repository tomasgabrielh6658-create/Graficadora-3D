import { useMemo } from 'react'
import { PALETTE, parseConstraint } from './expr'
import type { CompiledConstraint } from '../types'
import type { RawConstraint } from './presets'

let counter = 0
const nextId = () => `c${counter++}`

export interface CompiledList {
  cons: CompiledConstraint[]
  errors: (string | null)[]
}

export function compileConstraints(
  raws: RawConstraint[],
  dims: '2d' | '3d',
): CompiledList {
  const cons: CompiledConstraint[] = []
  const errors: (string | null)[] = []
  raws.forEach((r, i) => {
    const parsed = parseConstraint(r.raw, dims)
    if (!parsed.ok || !parsed.build) {
      errors.push(parsed.error ?? 'Expresión inválida')
      cons.push({
        id: nextId(), raw: r.raw, latex: r.raw, color: r.color,
        visible: r.visible, kind: r.side,
        field: () => 1e30, boundary: () => NaN,
      })
      return
    }
    errors.push(null)
    const built = parsed.build(r.side)
    cons.push({
      id: `${i}-${r.raw}-${r.side}`,
      raw: r.raw,
      latex: built.latex,
      color: r.color,
      visible: r.visible,
      kind: r.side,
      field: built.field,
      boundary: built.boundary,
    })
  })
  return { cons, errors }
}

export function useCompiled(raws: RawConstraint[], dims: '2d' | '3d'): CompiledList {
  return useMemo(() => compileConstraints(raws, dims), [raws, dims])
}

export const nextColor = (existing: RawConstraint[]) =>
  PALETTE[existing.length % PALETTE.length]
