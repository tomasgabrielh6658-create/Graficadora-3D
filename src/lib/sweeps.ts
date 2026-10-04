import type { Axis, BoundaryHit, Interval, SweepHit } from '../types'
import type { Region } from './field'
import { intervalsLe0 } from './roots'

export function sweepRegion(
  region: Region,
  axis: Axis,
  base: { x: number; y: number; z: number },
  lo: number,
  hi: number,
): SweepHit {
  const f = (t: number) =>
    axis === 'x' ? region.field(t, base.y, base.z)
    : axis === 'y' ? region.field(base.x, t, base.z)
    : region.field(base.x, base.y, t)
  const at = (t: number): BoundaryHit => ({
    t,
    constraint:
      axis === 'x' ? region.dominant(t, base.y, base.z)
      : axis === 'y' ? region.dominant(base.x, t, base.z)
      : region.dominant(base.x, base.y, t),
  })
  const intervals = intervalsLe0(f, lo, hi)
  return {
    intervals,
    entry: intervals.length ? at(intervals[0].a) : null,
    exit: intervals.length ? at(intervals[intervals.length - 1].b) : null,
  }
}

export function sweepIntervals(
  f: (t: number) => number,
  lo: number,
  hi: number,
  samples = 400,
): Interval[] {
  return intervalsLe0(f, lo, hi, samples)
}

export interface PartitionInfo {
  outerLo: number | null
  outerHi: number | null
  partitions: number
  breaks: number[]
  multiInterval: boolean
}

export function analyzeSweep(
  region: Region,
  sweepAxis: Axis,
  outerAxis: Axis,
  fixed: { x: number; y: number; z: number },
  outerLo: number,
  outerHi: number,
  sweepLo: number,
  sweepHi: number,
  steps = 64,
): PartitionInfo {
  const breaks: number[] = []
  let oLo: number | null = null
  let oHi: number | null = null
  let prevSig = ''
  let partitions = 1
  let multiInterval = false
  for (let i = 0; i <= steps; i++) {
    const w = outerLo + ((outerHi - outerLo) * i) / steps
    const base =
      outerAxis === 'x' ? { ...fixed, x: w }
      : outerAxis === 'y' ? { ...fixed, y: w }
      : { ...fixed, z: w }
    const hit = sweepRegion(region, sweepAxis, base, sweepLo, sweepHi)
    if (hit.intervals.length === 0) {
      prevSig = ''
      continue
    }
    if (oLo === null) oLo = w
    oHi = w
    if (hit.intervals.length > 1) multiInterval = true
    const sig = hit.intervals
      .map((iv) => {
        const a = atPoint(region, sweepAxis, base, iv.a)?.id ?? '?'
        const b = atPoint(region, sweepAxis, base, iv.b)?.id ?? '?'
        return `${a}>${b}`
      })
      .join(';')
    if (prevSig && sig !== prevSig) {
      breaks.push(w)
    }
    prevSig = sig
  }
  partitions = breaks.length + 1
  if (oLo === null) partitions = 0
  // Refina los bordes del rango exterior: la grilla gruesa deja el límite
  // corrido un paso hacia adentro (p. ej. [0.03,0.97] en vez de [0,1]).
  if (oLo !== null) {
    const step = (outerHi - outerLo) / steps
    const probe = (w: number) => {
      const base =
        outerAxis === 'x' ? { ...fixed, x: w }
        : outerAxis === 'y' ? { ...fixed, y: w }
        : { ...fixed, z: w }
      return sweepRegion(region, sweepAxis, base, sweepLo, sweepHi).intervals.length > 0
    }
    let lo = Math.max(oLo - step, outerLo)
    let hi = oLo
    for (let i = 0; i < 12 && hi - lo > (outerHi - outerLo) * 1e-4; i++) {
      const mid = (lo + hi) / 2
      if (probe(mid)) hi = mid
      else lo = mid
    }
    oLo = hi
    lo = oHi!
    hi = Math.min(oHi! + step, outerHi)
    for (let i = 0; i < 12 && hi - lo > (outerHi - outerLo) * 1e-4; i++) {
      const mid = (lo + hi) / 2
      if (probe(mid)) lo = mid
      else hi = mid
    }
    oHi = lo
  }
  return { outerLo: oLo, outerHi: oHi, partitions, breaks, multiInterval }
}

function atPoint(
  region: Region,
  axis: Axis,
  base: { x: number; y: number; z: number },
  t: number,
) {
  return axis === 'x'
    ? region.dominant(t, base.y, base.z)
    : axis === 'y'
      ? region.dominant(base.x, t, base.z)
      : region.dominant(base.x, base.y, t)
}
