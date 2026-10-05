import { describe, exactConstant, fmtDec, numberTex, type Candidate, type Scope } from './symbolic'
import { intervalsLe0 } from './roots'

/** Un límite listo para imprimir. */
export interface Lim {
  tex: string
  exact: boolean
}

export interface Piece2 {
  from: Lim
  to: Lim
  lo: Lim | null
  hi: Lim | null
  /** valores numéricos de los bordes del tramo exterior */
  a: number
  b: number
}

export interface Piece3 extends Piece2 {
  inLo: Lim | null
  inHi: Lim | null
}

export interface Slice {
  a: number
  b: number
  ka: string
  kb: string
}

const SAMPLES = [0.13, 0.31, 0.5, 0.69, 0.87]

export function snapLim(v: number, scale: number): Lim {
  const e = exactConstant(v, Math.max(2e-4 * scale, 1e-6) / Math.max(1, Math.abs(v)))
  if (e !== null) return numberTex(Number(evalExact(e)), 1e-9)
  return { tex: fmtDec(v), exact: false }
}

function evalExact(e: string): number {
  // e solo contiene enteros, /, *, pi y sqrt(n)
  const js = e.replace(/sqrt\((\d+)\)/g, 'Math.sqrt($1)').replace(/pi/g, 'Math.PI')
  return Function(`"use strict"; return (${js})`)() as number
}

/** Recorre [lo, hi] y devuelve los bloques contiguos donde key(w) ≠ null, partidos donde cambia la clave. */
export function segment(
  key: (w: number) => string | null,
  lo: number,
  hi: number,
  n = 96,
  periodic = false,
): { a: number; b: number; key: string }[] {
  const ws: number[] = []
  const ks: (string | null)[] = []
  for (let i = 0; i <= n; i++) {
    const w = lo + ((hi - lo) * i) / n
    ws.push(w)
    ks.push(key(w))
  }
  // bisección entre dos muestras con distinta clave
  const refine = (w0: number, w1: number, k0: string | null) => {
    let a = w0, b = w1
    for (let i = 0; i < 40; i++) {
      const m = (a + b) / 2
      if (key(m) === k0) a = m
      else b = m
    }
    return (a + b) / 2
  }
  const out: { a: number; b: number; key: string }[] = []
  let cur: { a: number; key: string } | null = ks[0] !== null ? { a: lo, key: ks[0]! } : null
  for (let i = 1; i <= n; i++) {
    if (ks[i] === ks[i - 1]) continue
    const cut = refine(ws[i - 1], ws[i], ks[i - 1])
    if (cur) out.push({ a: cur.a, b: cut, key: cur.key })
    cur = ks[i] !== null ? { a: cut, key: ks[i]! } : null
  }
  if (cur) out.push({ a: cur.a, b: hi, key: cur.key })
  // descarta astillas numéricas (cruces tangentes)
  const minLen = (hi - lo) * 1e-4
  const res = out.filter((s) => s.b - s.a > minLen)
  // Variable angular: un tramo que toca 2π y otro que arranca en 0 con la misma
  // clave son el mismo tramo [θ₁ − 2π, θ₂] (como −π/2 ≤ θ ≤ π/2 en el libro).
  if (periodic && res.length > 1) {
    const first = res[0], last = res[res.length - 1]
    if (first.a <= lo + minLen && last.b >= hi - minLen && first.key === last.key) {
      return [{ a: last.a - (hi - lo), b: first.b, key: first.key }, ...res.slice(1, -1)]
    }
  }
  return res
}

type Described = { tex: string; exact: boolean; f: (s: Scope) => number } | null

/** Raíz de g cerca de c por cambio de signo; null si no cruza. */
function rootOf(g: (w: number) => number, c: number, reach: number): number | null {
  let a = c - reach
  let b = c + reach
  let fa = g(a)
  const fb = g(b)
  if (!Number.isFinite(fa) || !Number.isFinite(fb) || fa * fb > 0) return null
  for (let i = 0; i < 60; i++) {
    const m = (a + b) / 2
    const fm = g(m)
    if (fa * fm <= 0) b = m
    else {
      a = m
      fa = fm
    }
  }
  return (a + b) / 2
}

/** Punto de tangencia: minimiza |g| cerca de c; null si no se acerca a 0. */
function touchOf(g: (w: number) => number, c: number, reach: number): number | null {
  let a = c - reach
  let b = c + reach
  for (let i = 0; i < 60; i++) {
    const m1 = a + (b - a) / 3
    const m2 = b - (b - a) / 3
    if (g(m1) <= g(m2)) b = m2
    else a = m1
  }
  const r = (a + b) / 2
  return g(r) < Math.max(reach * 1e-2, 1e-7) ? r : null
}

/**
 * Ajusta el corte entre tramos vecinos. La grilla deja el corte corrido hasta
 * el nivel de la tolerancia (2.2347 en vez de √5): una vez identificadas las
 * curvas de borde, el corte exacto es donde se igualan — o donde dos tramos
 * vecinos se tocan (corona: los dos intervalos se fusionan).
 */
function refineCuts<T extends { a: number; b: number; from: Lim; to: Lim }>(
  groups: T[][],
  bound: (p: T, side: 'lo' | 'hi') => Described,
  sc: (w: number) => Scope,
  reach: number,
  scale: number,
): void {
  for (let i = 0; i < groups.length - 1; i++) {
    const A = groups[i]
    const B = groups[i + 1]
    const cut = B[0]?.a ?? A[0]?.b
    if (cut === undefined || !A.length || !B.length) continue
    let best: number | null = null
    if (A.length === B.length) {
      outer: for (const side of ['hi', 'lo'] as const) {
        for (let k = 0; k < A.length; k++) {
          const fa = bound(A[k], side)
          const fb = bound(B[k], side)
          if (!fa || !fb || fa.tex === fb.tex) continue
          const g = (w: number) => fa.f(sc(w)) - fb.f(sc(w))
          const r = rootOf(g, cut, reach) ?? touchOf((w) => Math.abs(g(w)), cut, reach)
          if (r !== null) {
            best = r
            break outer
          }
        }
      }
    } else {
      const L = A.length > B.length ? A : B
      for (let k = 0; k + 1 < L.length; k++) {
        const hi = bound(L[k], 'hi')
        const lo = bound(L[k + 1], 'lo')
        if (!hi || !lo) continue
        const r = touchOf((w) => Math.abs(hi.f(sc(w)) - lo.f(sc(w))), cut, reach)
        if (r !== null) {
          best = r
          break
        }
      }
    }
    if (best !== null) {
      for (const p of A) {
        p.b = best
        p.to = snapLim(best, scale)
      }
      for (const p of B) {
        p.a = best
        p.from = snapLim(best, scale)
      }
    }
  }
}

/**
 * Planteo de dos niveles: ∫_{from}^{to} ∫_{lo(w)}^{hi(w)}.
 * Se parte el rango exterior donde cambia la curva de entrada o de salida, y
 * un corte con varios intervalos (coronas, anillos) genera una integral por tramo.
 */
export function plan2(o: {
  searchLo: number
  searchHi: number
  slice: (w: number) => Slice[]
  cands: Candidate[]
  outerVar: string
  innerSpan: number
  outerScale?: number
  periodic?: boolean
}): Piece2[] {
  const key = (w: number) => {
    const iv = o.slice(w)
    return iv.length ? iv.map((s) => `${s.ka}|${s.kb}`).join(';') : null
  }
  const segs = segment(key, o.searchLo, o.searchHi, 96, o.periodic)
  const scale = o.outerScale ?? o.searchHi - o.searchLo
  const tol = Math.max(o.innerSpan * 2e-4, 1e-6)
  const sc = (w: number): Scope => ({ [o.outerVar]: w })
  const step = (o.searchHi - o.searchLo) / 96
  const groups = segs.map((sg, i) => {
    const pts = SAMPLES.map((f) => sg.a + (sg.b - sg.a) * f)
    const lists = pts.map((w) => ({ w, iv: o.slice(w) })).filter((p) => p.iv.length)
    const K = Math.max(1, ...lists.map((p) => p.iv.length))
    const pieces: Piece2[] = []
    for (let k = 0; k < K; k++) {
      const sl = lists.map((p) => ({ w: p.w, s: p.iv[k] })).filter((p) => p.s) as { w: number; s: Slice }[]
      const lo = describe(sl.map((p) => ({ s: sc(p.w), value: p.s.a })), o.cands, tol)
      const hi = describe(sl.map((p) => ({ s: sc(p.w), value: p.s.b })), o.cands, tol)
      let { a, b } = sg
      // En un extremo "en punta" el corte tiende a ancho 0 y el muestreo no llega:
      // se resuelve hi(w) = lo(w) con las fórmulas ya identificadas.
      if (lo && hi) {
        const gap = (w: number) => hi.f(sc(w)) - lo.f(sc(w))
        if (i === 0 || segs[i - 1].b < sg.a - step * 1e-3) a = pinch(gap, a, -1, step * 3) ?? a
        if (i === segs.length - 1 || segs[i + 1].a > sg.b + step * 1e-3) b = pinch(gap, b, 1, step * 3) ?? b
      }
      pieces.push({ a, b, from: snapLim(a, scale), to: snapLim(b, scale), lo, hi })
    }
    return pieces
  })
  refineCuts(groups, (p, s) => (s === 'lo' ? p.lo : p.hi) as Described, sc, step * 3, scale)
  return groups.flat()
}

/**
 * Busca el w (cerca de w0, hacia dir) donde gap(w) = 0 pasando de ≥0 (adentro) a <0/NaN (afuera).
 * Devuelve null si no hay cruce: el borde lo define otra frontera y ya es preciso.
 */
function pinch(gap: (w: number) => number, w0: number, dir: 1 | -1, reach: number): number | null {
  const inside = (w: number) => gap(w) >= -1e-12
  const wIn = w0 - dir * reach * 0.5
  const wOut = w0 + dir * reach
  if (!inside(wIn) || inside(wOut)) return null
  let a = wIn, b = wOut
  for (let i = 0; i < 60; i++) {
    const m = (a + b) / 2
    if (inside(m)) a = m
    else b = m
  }
  const r = (a + b) / 2
  return Math.abs(gap(r)) < 1e-6 || !Number.isFinite(gap(b)) ? r : null
}

/** Índice del primer candidato que coincide con v en el punto s (o 'c' si parece constante). */
function matchKey(v: number, s: Scope, cands: Candidate[], tol: number): string {
  for (let i = 0; i < cands.length; i++) if (Math.abs(cands[i].f(s) - v) < tol) return String(i)
  return '?'
}

/**
 * Planteo de tres niveles: ∫_{from}^{to} ∫_{lo(w)}^{hi(w)} ∫_{inLo(w,m)}^{inHi(w,m)}.
 *  midSlice(w): intervalo de la variable media (la sombra) para el exterior w.
 *  innerSlice(w, m): intervalo de la variable perforada, con la frontera de entrada/salida.
 */
export function plan3(o: {
  searchLo: number
  searchHi: number
  midSlice: (w: number) => { a: number; b: number }[]
  innerSlice: (w: number, m: number) => Slice[]
  midCands: Candidate[]
  innerCands: Candidate[]
  outerVar: string
  midVar: string
  midSpan: number
  innerSpan: number
  outerScale?: number
  periodic?: boolean
}): { pieces: Piece3[]; innerSplit: boolean } {
  const tolM = Math.max(o.midSpan * 5e-4, 1e-6)
  const tolI = Math.max(o.innerSpan * 2e-4, 1e-6)
  const key = (w: number) => {
    const iv = o.midSlice(w)
    if (!iv.length) return null
    const sc = { [o.outerVar]: w }
    return iv.map((v) => `${matchKey(v.a, sc, o.midCands, tolM)}|${matchKey(v.b, sc, o.midCands, tolM)}`).join(';')
  }
  const segs = segment(key, o.searchLo, o.searchHi, 72, o.periodic)
  const scale = o.outerScale ?? o.searchHi - o.searchLo
  let innerSplit = false
  const step = (o.searchHi - o.searchLo) / 72
  const groups = segs.map((sg, i) => {
    const pts = SAMPLES.map((f) => sg.a + (sg.b - sg.a) * f)
    const mids = pts.map((w) => ({ w, iv: o.midSlice(w) })).filter((p) => p.iv.length)
    const scO = (w: number): Scope => ({ [o.outerVar]: w })
    const K = Math.max(1, ...mids.map((p) => p.iv.length))
    const pieces: Piece3[] = []
    for (let k = 0; k < K; k++) {
      const sl = mids.map((p) => ({ w: p.w, s: p.iv[k] })).filter((p) => p.s) as { w: number; s: { a: number; b: number } }[]
      const inner: { s: Scope; lo: number; hi: number; k: string }[] = []
      for (const p of sl.filter((_, j) => j % 2 === 0)) {
        for (const f of [0.2, 0.5, 0.8]) {
          const m = p.s.a + (p.s.b - p.s.a) * f
          const iv = o.innerSlice(p.w, m)
          if (iv.length > 1) innerSplit = true
          const s0 = iv[0]
          if (s0) inner.push({ s: { [o.outerVar]: p.w, [o.midVar]: m }, lo: s0.a, hi: s0.b, k: `${s0.ka}|${s0.kb}` })
        }
      }
      const same = inner.every((q) => q.k === inner[0]?.k)
      if (!same) innerSplit = true
      const lo = describe(sl.map((p) => ({ s: scO(p.w), value: p.s.a })), o.midCands, tolM)
      const hi = describe(sl.map((p) => ({ s: scO(p.w), value: p.s.b })), o.midCands, tolM)
      let { a, b } = sg
      if (lo && hi) {
        const gap = (w: number) => hi.f(scO(w)) - lo.f(scO(w))
        if (i === 0 || segs[i - 1].b < sg.a - step * 1e-3) a = pinch(gap, a, -1, step * 3) ?? a
        if (i === segs.length - 1 || segs[i + 1].a > sg.b + step * 1e-3) b = pinch(gap, b, 1, step * 3) ?? b
      }
      pieces.push({
        a,
        b,
        from: snapLim(a, scale),
        to: snapLim(b, scale),
        lo,
        hi,
        inLo: same ? describe(inner.map((q) => ({ s: q.s, value: q.lo })), o.innerCands, tolI) : null,
        inHi: same ? describe(inner.map((q) => ({ s: q.s, value: q.hi })), o.innerCands, tolI) : null,
      })
    }
    return pieces
  })
  const scO = (w: number): Scope => ({ [o.outerVar]: w })
  refineCuts(groups, (p, s) => (s === 'lo' ? p.lo : p.hi) as Described, scO, step * 3, scale)
  return { pieces: groups.flat(), innerSplit }
}

/**
 * Mínimo preciso de max_i f_i a lo largo de un rayo: muestreo grueso + búsqueda
 * ternaria local. La sombra calculada así no queda "comida" por la grilla.
 */
export function rayMin(g: (t: number) => number, t0: number, t1: number, n = 64): number {
  let best = Infinity
  let bi = 0
  for (let i = 0; i <= n; i++) {
    const v = g(t0 + ((t1 - t0) * i) / n)
    if (v < best) {
      best = v
      bi = i
    }
  }
  if (!Number.isFinite(best)) return 1
  const h = (t1 - t0) / n
  let a = t0 + Math.max(bi - 1, 0) * h
  let b = t0 + Math.min(bi + 1, n) * h
  for (let k = 0; k < 40; k++) {
    const m1 = a + (b - a) / 3
    const m2 = b - (b - a) / 3
    if (g(m1) <= g(m2)) b = m2
    else a = m1
  }
  return Math.min(best, g((a + b) / 2))
}

/** Intervalo [a, b] (primer inicio, último fin) de g ≤ 0 en [lo, hi], o null. */
export function span(g: (t: number) => number, lo: number, hi: number, samples = 160): { a: number; b: number } | null {
  const iv = intervalsLe0(g, lo, hi, samples)
  return iv.length ? { a: iv[0].a, b: iv[iv.length - 1].b } : null
}

// ---------------------------------------------------------------------------
// TeX
// ---------------------------------------------------------------------------

const limTex = (l: Lim | null, fallback: string) => (l ? l.tex : fallback)

export function tex2(pieces: Piece2[], inner: string, outer: string, weight = ''): string {
  if (!pieces.length) return `\\iint_D f\\,d${inner}\\,d${outer}`
  return pieces
    .map((p, i) => {
      const lo = limTex(p.lo, `g_{${2 * i + 1}}(${outer})`)
      const hi = limTex(p.hi, `g_{${2 * i + 2}}(${outer})`)
      return `\\int_{${p.from.tex}}^{${p.to.tex}}\\!\\int_{${lo}}^{${hi}} f${weight}\\,d${inner}\\,d${outer}`
    })
    .join(' \\;+\\; ')
}

export function tex3(pieces: Piece3[], inner: string, mid: string, outer: string, weight = ''): string {
  if (!pieces.length) return `\\iiint_E f\\,dV`
  return pieces
    .map((p, i) => {
      const lo = limTex(p.lo, `g_{${2 * i + 1}}(${outer})`)
      const hi = limTex(p.hi, `g_{${2 * i + 2}}(${outer})`)
      const il = limTex(p.inLo, `k_{${2 * i + 1}}(${outer},${mid})`)
      const ih = limTex(p.inHi, `k_{${2 * i + 2}}(${outer},${mid})`)
      return `\\int_{${p.from.tex}}^{${p.to.tex}}\\!\\int_{${lo}}^{${hi}}\\!\\int_{${il}}^{${ih}} f${weight}\\,d${inner}\\,d${mid}\\,d${outer}`
    })
    .join(' \\;+\\; ')
}

export const allExact = (ps: (Piece2 | Piece3)[]) =>
  ps.length > 0 &&
  ps.every((p) => p.from.exact && p.to.exact && p.lo?.exact && p.hi?.exact && (!('inLo' in p) || (p.inLo?.exact && p.inHi?.exact)))
