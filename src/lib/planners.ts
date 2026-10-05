import { derivative, parse } from 'mathjs/number'
import { buildRegion, type Region } from './field'
import { compileConstraints } from './useConstraints'
import { fitBounds2D, fitBounds3D } from './autofit'
import { intervalsLe0 } from './roots'
import { sweepRegion } from './sweeps'
import { allExact, plan2, plan3, rayMin, span, tex2, tex3, type Piece2, type Piece3, type Slice } from './plan'
import { candidatesFor, constTex, exactConstant, prettyTex, shadowCandidates } from './symbolic'
import { ORDER_INFO, type Axis, type IntegrationOrder3D } from '../types'
import type { RawConstraint } from './presets'

/**
 * Planteo exacto de cada módulo. Funciones puras (sin React ni DOM): se usan
 * desde un Web Worker y desde los tests.
 */

export type PlanReq =
  | { kind: 'cart2'; raws: RawConstraint[]; inner: 'x' | 'y' }
  | {
      kind: 'cv2'
      raws: RawConstraint[]
      transform: 'polar' | 'elliptic' | 'linear' | 'custom'
      a?: number
      b?: number
      lin?: number[]
      custom?: { xExpr: string; yExpr: string; u0: number; u1: number; v0: number; v1: number }
    }
  | { kind: 'cart3'; raws: RawConstraint[]; order: IntegrationOrder3D }
  | { kind: 'cs3'; raws: RawConstraint[]; mode: 'cyl' | 'cyle' | 'sph'; a?: number; b?: number }

export interface PlanRes {
  tex: string
  exact: boolean
  pieces: (Piece2 | Piece3)[]
  /** el rayo interior cambia de superficie: hace falta partir el sólido */
  innerSplit: boolean
  weightTex: string
}

const TAU = Math.PI * 2
const visibleRaws = (raws: RawConstraint[]) => raws.filter((r) => r.visible)
const rawStrings = (raws: RawConstraint[]) => visibleRaws(raws).map((r) => r.raw)

function regionOf(raws: RawConstraint[], dims: '2d' | '3d'): Region {
  return buildRegion(compileConstraints(raws, dims).cons)
}

const sliceFrom = (iv: { a: number; b: number }[], ka: string, kb: string): Slice | null =>
  iv.length ? { a: iv[0].a, b: iv[iv.length - 1].b, ka, kb } : null

const constWeight = (v: number, rest: string) => {
  const e = exactConstant(v, 1e-9)
  const t = e === null ? String(Math.round(v * 1000) / 1000) : constTex(e)
  return t === '1' ? rest : `${t}\\,${rest}`
}

export function computePlan(req: PlanReq): PlanRes {
  switch (req.kind) {
    case 'cart2':
      return planCart2(req)
    case 'cv2':
      return planCV2(req)
    case 'cart3':
      return planCart3(req)
    case 'cs3':
      return planCS3(req)
  }
}

function planCart2(req: Extract<PlanReq, { kind: 'cart2' }>): PlanRes {
  const region = regionOf(req.raws, '2d')
  const fit = fitBounds2D((x, y) => region.field(x, y, 0))
  if (!fit) return empty('')
  const v = fit.view
  const inner = req.inner
  const outer: Axis = inner === 'y' ? 'x' : 'y'
  const [oLo, oHi] = outer === 'x' ? [v.x0, v.x1] : [v.y0, v.y1]
  const [iLo, iHi] = inner === 'y' ? [v.y0, v.y1] : [v.x0, v.x1]
  const pieces = plan2({
    searchLo: oLo,
    searchHi: oHi,
    slice: (w) => {
      const h = sweepRegion(region, inner, { x: w, y: w, z: 0 }, iLo, iHi)
      return sliceFrom(h.intervals, h.entry?.constraint?.id ?? '?', h.exit?.constraint?.id ?? '?')
    },
    cands: candidatesFor(rawStrings(req.raws), inner),
    outerVar: outer,
    innerSpan: iHi - iLo,
  })
  return { tex: tex2(pieces, inner, outer), exact: allExact(pieces), pieces, innerSplit: false, weightTex: '' }
}

function planCV2(req: Extract<PlanReq, { kind: 'cv2' }>): PlanRes {
  const region = regionOf(req.raws, '2d')
  const raws = rawStrings(req.raws)
  const angular = req.transform === 'polar' || req.transform === 'elliptic'
  let fwd: (u: number, v: number) => [number, number]
  let subs: Record<string, string>
  let weightTex: string
  let uRange: [number, number]
  let vRange: [number, number]
  let uVar = 'u'
  let vVar = 'v'
  const fit = fitBounds2D((x, y) => region.field(x, y, 0))
  if (!fit) return empty('')
  const fv = fit.view
  const rMaxXY = Math.max(...[[fv.x0, fv.y0], [fv.x1, fv.y0], [fv.x0, fv.y1], [fv.x1, fv.y1]].map(([x, y]) => Math.hypot(x, y)))
  if (angular) {
    const a = req.transform === 'elliptic' ? req.a ?? 1 : 1
    const b = req.transform === 'elliptic' ? req.b ?? 1 : 1
    fwd = (th, r) => [a * r * Math.cos(th), b * r * Math.sin(th)]
    subs = { x: `${a} * r * cos(theta)`, y: `${b} * r * sin(theta)` }
    weightTex = constWeight(Math.abs(a * b), 'r')
    uRange = [0, TAU]
    vRange = [0, (rMaxXY / Math.min(Math.abs(a) || 1, Math.abs(b) || 1)) * 1.05]
    uVar = 'theta'
    vVar = 'r'
  } else if (req.transform === 'linear') {
    const [a, b, c, d] = req.lin ?? [1, 0, 0, 1]
    const det = a * d - b * c
    if (Math.abs(det) < 1e-12) return empty('')
    fwd = (u, v) => [(d * u - b * v) / det, (-c * u + a * v) / det]
    subs = { x: `(${d} * u - ${b} * v) / ${det}`, y: `(${-c} * u + ${a} * v) / ${det}` }
    weightTex = constWeight(1 / Math.abs(det), '')
    const us = [[fv.x0, fv.y0], [fv.x1, fv.y0], [fv.x0, fv.y1], [fv.x1, fv.y1]].map(([x, y]) => [a * x + b * y, c * x + d * y])
    uRange = [Math.min(...us.map((p) => p[0])), Math.max(...us.map((p) => p[0]))]
    vRange = [Math.min(...us.map((p) => p[1])), Math.max(...us.map((p) => p[1]))]
  } else {
    const cs = req.custom!
    let X: (u: number, v: number) => number, Y: (u: number, v: number) => number
    try {
      const cx = parse(cs.xExpr).compile(), cy = parse(cs.yExpr).compile()
      X = (u, v) => cx.evaluate({ u, v }) as number
      Y = (u, v) => cy.evaluate({ u, v }) as number
    } catch {
      return empty('')
    }
    fwd = (u, v) => [X(u, v), Y(u, v)]
    subs = { x: cs.xExpr, y: cs.yExpr }
    weightTex = jacobianTex(cs.xExpr, cs.yExpr)
    uRange = [cs.u0, cs.u1]
    vRange = [cs.v0, cs.v1]
  }
  const g = (u: number, v: number) => {
    const [x, y] = fwd(u, v)
    return Number.isFinite(x) && Number.isFinite(y) ? region.field(x, y, 0) : NaN
  }
  const key = (u: number, v: number) => {
    if (angular && v < 1e-9) return 'O'
    const [x, y] = fwd(u, v)
    return region.dominant(x, y, 0)?.id ?? '?'
  }
  const pieces = plan2({
    searchLo: uRange[0],
    searchHi: uRange[1],
    slice: (u) => {
      const iv = intervalsLe0((v) => g(u, v), vRange[0], vRange[1], 400)
      return iv.length ? sliceFrom(iv, key(u, iv[0].a), key(u, iv[iv.length - 1].b)) : null
    },
    cands: candidatesFor(raws, vVar, subs),
    outerVar: uVar,
    innerSpan: vRange[1] - vRange[0],
    periodic: angular,
  })
  const w = weightTex ? `\\,${weightTex}` : ''
  const [it, ot] = angular ? ['r', '\\theta'] : ['v', 'u']
  return { tex: tex2(pieces, it, ot, w), exact: allExact(pieces), pieces, innerSplit: false, weightTex }
}

/**
 * |∂(x,y)/∂(u,v)|: primero se intenta reconocer c·uⁱ·vʲ numéricamente (los
 * casos de los TP: 1/(2v), u, 1/2…); si no, se muestra el determinante simbólico.
 */
export function jacobianTex(xExpr: string, yExpr: string): string {
  try {
    const X = parse(xExpr), Y = parse(yExpr)
    const det = parse(
      `(${derivative(X, 'u').toString()}) * (${derivative(Y, 'v').toString()}) - (${derivative(X, 'v').toString()}) * (${derivative(Y, 'u').toString()})`,
    )
    const J = det.compile()
    const pts = [[1.3, 1.7], [2.1, 1.2], [1.6, 2.6], [1.15, 1.45]]
    const vals = pts.map(([u, v]) => Math.abs(J.evaluate({ u, v }) as number))
    if (vals.every(Number.isFinite)) {
      for (const [i, j] of [[0, 0], [0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, 1], [1, -1], [-1, 1], [0, -2], [-2, 0], [2, 0], [0, 2]]) {
        const cs = pts.map(([u, v], k) => vals[k] / (u ** i * v ** j))
        if (cs.every((c) => Math.abs(c - cs[0]) < 1e-7 * Math.max(1, cs[0]))) {
          const e = exactConstant(cs[0], 1e-7)
          if (e === null) break
          const pw = (s: string, k: number) => (k === 1 ? s : `${s}^${k}`)
          const fr = e.match(/^(\d+)\/(\d+)$/)
          const [p, q] = fr ? [fr[1], fr[2]] : [e, '1']
          const num = [p !== '1' || (i <= 0 && j <= 0) ? p : '', i > 0 ? pw('u', i) : '', j > 0 ? pw('v', j) : ''].filter(Boolean).join(' * ')
          const den = [q !== '1' ? q : '', i < 0 ? pw('u', -i) : '', j < 0 ? pw('v', -j) : ''].filter(Boolean).join(' * ')
          return prettyTex(parse(den ? `(${num || '1'}) / (${den})` : num))
        }
      }
    }
    return `\\left|${prettyTex(det)}\\right|`
  } catch {
    return '|J|'
  }
}

function planCart3(req: Extract<PlanReq, { kind: 'cart3' }>): PlanRes {
  const region = regionOf(req.raws, '3d')
  const fit = fitBounds3D(region.field)
  if (!fit) return empty('')
  const bb = fit.bbox
  const info = ORDER_INFO[req.order]
  const rng = (a: Axis): [number, number] => [bb[`${a}0` as 'x0'], bb[`${a}1` as 'x1']]
  const pt = (o: number, m: number, t: number) => {
    const q = { x: 0, y: 0, z: 0 }
    q[info.outer] = o
    q[info.mid] = m
    q[info.pierce] = t
    return q
  }
  const [pLo, pHi] = rng(info.pierce)
  const [mLo, mHi] = rng(info.mid)
  const [oLo, oHi] = rng(info.outer)
  const raws = rawStrings(req.raws)
  const res = plan3({
    searchLo: oLo,
    searchHi: oHi,
    midSlice: (w) =>
      span((m) => rayMin((t) => {
        const q = pt(w, m, t)
        return region.field(q.x, q.y, q.z)
      }, pLo, pHi), mLo, mHi, 120),
    innerSlice: (w, m) => {
      const h = sweepRegion(region, info.pierce, pt(w, m, 0), pLo, pHi)
      return sliceFrom(h.intervals, h.entry?.constraint?.id ?? '?', h.exit?.constraint?.id ?? '?')
    },
    midCands: shadowCandidates(raws, info.pierce, info.mid),
    innerCands: candidatesFor(raws, info.pierce),
    outerVar: info.outer,
    midVar: info.mid,
    midSpan: mHi - mLo,
    innerSpan: pHi - pLo,
  })
  return {
    tex: tex3(res.pieces, info.pierce, info.mid, info.outer),
    exact: allExact(res.pieces) && !res.innerSplit,
    pieces: res.pieces,
    innerSplit: res.innerSplit,
    weightTex: '',
  }
}

function planCS3(req: Extract<PlanReq, { kind: 'cs3' }>): PlanRes {
  const region = regionOf(req.raws, '3d')
  const fit = fitBounds3D(region.field)
  if (!fit) return empty('')
  const bb = fit.bbox
  const sph = req.mode === 'sph'
  const A = req.mode === 'cyle' ? req.a ?? 1 : 1
  const B = req.mode === 'cyle' ? req.b ?? 1 : 1
  const pt = (th: number, m: number, t: number): [number, number, number] =>
    sph
      ? [t * Math.sin(m) * Math.cos(th), t * Math.sin(m) * Math.sin(th), t * Math.cos(m)]
      : [A * m * Math.cos(th), B * m * Math.sin(th), t]
  const subs: Record<string, string> = sph
    ? { x: 'rho * sin(phi) * cos(theta)', y: 'rho * sin(phi) * sin(theta)', z: 'rho * cos(phi)' }
    : { x: `${A} * r * cos(theta)`, y: `${B} * r * sin(theta)` }
  const corner = Math.max(...[bb.x0, bb.x1].flatMap((x) => [bb.y0, bb.y1].flatMap((y) => [bb.z0, bb.z1].map((z) => Math.hypot(x, y, z)))))
  const rXY = Math.max(...[bb.x0, bb.x1].flatMap((x) => [bb.y0, bb.y1].map((y) => Math.hypot(x / A, y / B))))
  // ρ arranca en un ε > 0: en el origen todas las direcciones "tocan" la región
  const [pLo, pHi] = sph ? [corner * 1e-4, corner * 1.02] : [bb.z0, bb.z1]
  const [mLo, mHi] = sph ? [0, Math.PI] : [0, rXY * 1.02]
  const [pv, mv] = sph ? ['rho', 'phi'] : ['z', 'r']
  const raws = rawStrings(req.raws)
  const origin = (t: number) => sph && t <= pLo * 1.5
  const res = plan3({
    searchLo: 0,
    searchHi: TAU,
    midSlice: (th) => span((m) => rayMin((t) => region.field(...pt(th, m, t)), pLo, pHi), mLo, mHi, 120),
    innerSlice: (th, m) => {
      const iv = intervalsLe0((t) => region.field(...pt(th, m, t)), pLo, pHi, 300)
      if (!iv.length) return null
      const ta = iv[0].a, tb = iv[iv.length - 1].b
      return sliceFrom(iv, origin(ta) ? 'O' : region.dominant(...pt(th, m, ta))?.id ?? '?', region.dominant(...pt(th, m, tb))?.id ?? '?')
    },
    midCands: shadowCandidates(raws, pv, mv, subs),
    innerCands: candidatesFor(raws, pv, subs),
    outerVar: 'theta',
    midVar: mv,
    midSpan: mHi - mLo,
    innerSpan: pHi - pLo,
    periodic: true,
  })
  // ρ que arranca en ε es ρ = 0
  for (const p of res.pieces) if (sph && p.inLo && !p.inLo.exact && /approx/.test(p.inLo.tex)) p.inLo = { tex: '0', exact: true }
  const weightTex = sph ? '\\rho^2\\sin\\phi' : constWeight(Math.abs(A * B), 'r')
  return {
    tex: tex3(res.pieces, sph ? '\\rho' : 'z', sph ? '\\phi' : 'r', '\\theta', `\\,${weightTex}`),
    exact: allExact(res.pieces) && !res.innerSplit,
    pieces: res.pieces,
    innerSplit: res.innerSplit,
    weightTex,
  }
}

/** Copia sin funciones (para mandar del worker al hilo principal). */
export function serializePlan(r: PlanRes): PlanRes {
  const lim = (l: { tex: string; exact: boolean } | null | undefined) => (l ? { tex: l.tex, exact: l.exact } : null)
  return {
    ...r,
    pieces: r.pieces.map((p) => ({
      a: p.a,
      b: p.b,
      from: lim(p.from)!,
      to: lim(p.to)!,
      lo: lim(p.lo),
      hi: lim(p.hi),
      ...('inLo' in p ? { inLo: lim(p.inLo), inHi: lim(p.inHi) } : {}),
    })),
  }
}

function empty(weightTex: string): PlanRes {
  return { tex: '', exact: false, pieces: [], innerSplit: false, weightTex }
}
