import { beforeAll, describe, expect, it } from 'vitest'
import { parse } from 'mathjs/number'
import { PRESETS, presetRaws, type RawConstraint } from './presets'
import { computePlan, jacobianTex, type PlanReq, type PlanRes } from './planners'
import { buildRegion, type Region } from './field'
import { compileConstraints } from './useConstraints'
import { fitBounds2D, fitBounds3D } from './autofit'
import {
  boundaryNode,
  candidatesFor,
  constTex,
  describe as describeSamples,
  exactConstant,
  numberTex,
  prettyTex,
  shadowCandidates,
  solveFor,
  substitute,
  type Scope,
} from './symbolic'
import { allExact, plan2, rayMin, segment, snapLim, span, tex2, tex3, type Piece2, type Piece3 } from './plan'
import type { IntegrationOrder3D } from '../types'

// ---------------------------------------------------------------------------
// utilidades
// ---------------------------------------------------------------------------

type LimF = { tex: string; exact: boolean; f?: (s: Scope) => number }

const RC = (raw: string, side: 'le' | 'ge' = 'le', visible = true): RawConstraint => ({ raw, side, color: '#000', visible })

const regOf = (raws: RawConstraint[], dims: '2d' | '3d'): Region =>
  buildRegion(compileConstraints(raws, dims).cons)

/** PRNG determinístico para que los muestreos sean reproducibles. */
const rng = (seed: number) => {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const evalLim = (l: LimF | null | undefined, s: Scope): number => {
  if (!l) return NaN
  if (l.f) return l.f(s)
  if (l.tex === '0') return 0
  return NaN
}

/**
 * Cobertura: un punto (w, m[, t]) está "dentro del plan" si cae en los límites
 * de alguna pieza; está "dentro de la región" si el campo es ≤ 0. Cerca de los
 * bordes se omite (franja de incertidumbre numérica).
 */
function covers2D(
  pieces: Piece2[],
  insideRegion: (a: number, b: number) => boolean,
  outerName: string,
  loW: number,
  hiW: number,
  loI: number,
  hiI: number,
  n = 900,
  seed = 7,
): { ok: boolean; bad: number } {
  const rnd = rng(seed)
  const tol = Math.max(hiW - loW, hiI - loI) * 8e-3
  let bad = 0
  for (let k = 0; k < n; k++) {
    const w = loW + (hiW - loW) * rnd()
    const v = loI + (hiI - loI) * rnd()
    let inPlan = false
    let nearEdge = false
    for (const p of pieces) {
      const dw = Math.min(Math.abs(w - p.a), Math.abs(w - p.b))
      if (w < p.a || w > p.b) {
        if (dw < tol) nearEdge = true
        continue
      }
      const L = evalLim(p.lo as LimF, { [outerName]: w })
      const H = evalLim(p.hi as LimF, { [outerName]: w })
      const di = Math.min(Math.abs(v - L), Math.abs(v - H))
      if (!Number.isFinite(L) || !Number.isFinite(H) || di < tol) nearEdge = true
      else if (v > L && v < H) inPlan = true
    }
    if (nearEdge) continue
    if (inPlan !== insideRegion(w, v)) bad++
  }
  return { ok: bad === 0, bad }
}

function covers3D(
  pieces: Piece3[],
  insideRegion: (w: number, m: number, t: number) => boolean,
  oName: string,
  mName: string,
  loW: number,
  hiW: number,
  loM: number,
  hiM: number,
  loT: number,
  hiT: number,
  n = 700,
  seed = 11,
  /** θ es periódica: las piezas pueden usar [0,2π] o [−π,π]; en cartesianas no. */
  shifts: number[] = [0],
): { ok: boolean; bad: number } {
  const rnd = rng(seed)
  const tol = Math.max(hiW - loW, hiM - loM, hiT - loT) * 8e-3
  let bad = 0
  for (let k = 0; k < n; k++) {
    const w = loW + (hiW - loW) * rnd()
    const m = loM + (hiM - loM) * rnd()
    const t = loT + (hiT - loT) * rnd()
    let inPlan = false
    let nearEdge = false
    for (const p of pieces) {
      for (const sh of shifts) {
        const ws = w + sh
        if (ws < p.a || ws > p.b) {
          if (Math.min(Math.abs(ws - p.a), Math.abs(ws - p.b)) < tol) nearEdge = true
          continue
        }
        const L = evalLim(p.lo as LimF, { [oName]: ws })
        const H = evalLim(p.hi as LimF, { [oName]: ws })
        if (!Number.isFinite(L) || !Number.isFinite(H)) {
          nearEdge = true
          continue
        }
        if (m < L || m > H) {
          if (Math.min(Math.abs(m - L), Math.abs(m - H)) < tol) nearEdge = true
          continue
        }
        const s2 = { [oName]: ws, [mName]: m }
        const IL = evalLim(p.inLo as LimF, s2)
        const IH = evalLim(p.inHi as LimF, s2)
        if (!Number.isFinite(IL) || !Number.isFinite(IH)) {
          nearEdge = true
          continue
        }
        if (Math.min(Math.abs(t - IL), Math.abs(t - IH)) < tol) nearEdge = true
        else if (t > IL && t < IH) inPlan = true
      }
    }
    if (nearEdge) continue
    if (inPlan !== insideRegion(w, m, t)) bad++
  }
  return { ok: bad === 0, bad }
}

// ---------------------------------------------------------------------------
// peticiones como las mandan los módulos
// ---------------------------------------------------------------------------

const customOf = (c: { x: string; y: string; u0: number; u1: number; v0: number; v1: number }) => ({
  xExpr: c.x,
  yExpr: c.y,
  u0: c.u0,
  u1: c.u1,
  v0: c.v0,
  v1: c.v1,
})

const reqOf = (p: (typeof PRESETS)[number]): PlanReq => {
  const raws = presetRaws(p)
  const s = p.settings ?? {}
  if (p.module === 1) return { kind: 'cart2', raws, inner: s.sweep === 'T2' ? 'x' : 'y' }
  if (p.module === 2) return { kind: 'cv2', raws, transform: s.transform!, a: s.a, b: s.b, custom: s.custom ? customOf(s.custom) : undefined }
  if (p.module === 3) return { kind: 'cart3', raws, order: s.order! }
  return { kind: 'cs3', raws, mode: s.mode!, a: s.a, b: s.b }
}

// Transformación directa (u,v) → (x,y) / (θ,m,t) → (x,y,z) para muestrear.
function fwd2(req: Extract<PlanReq, { kind: 'cv2' }>, u: number, v: number): [number, number] {
  if (req.transform === 'polar' || req.transform === 'elliptic') {
    const a = req.transform === 'elliptic' ? req.a ?? 1 : 1
    const b = req.transform === 'elliptic' ? req.b ?? 1 : 1
    return [a * v * Math.cos(u), b * v * Math.sin(u)]
  }
  if (req.transform === 'linear') {
    const [a, b, c, d] = req.lin ?? [1, 0, 0, 1]
    const det = a * d - b * c
    return [(d * u - b * v) / det, (-c * u + a * v) / det]
  }
  const c = req.custom!
  const X = parse(c.xExpr).compile()
  const Y = parse(c.yExpr).compile()
  return [X.evaluate({ u, v }) as number, Y.evaluate({ u, v }) as number]
}

function fwd3(req: Extract<PlanReq, { kind: 'cs3' }>, th: number, m: number, t: number): [number, number, number] {
  if (req.mode === 'sph') return [t * Math.sin(m) * Math.cos(th), t * Math.sin(m) * Math.sin(th), t * Math.cos(m)]
  const A = req.mode === 'cyle' ? req.a ?? 1 : 1
  const B = req.mode === 'cyle' ? req.b ?? 1 : 1
  return [A * m * Math.cos(th), B * m * Math.sin(th), t]
}

const OUTER3: Record<string, [string, string, string]> = {
  dz_dy_dx: ['x', 'y', 'z'],
  dz_dx_dy: ['y', 'x', 'z'],
  dx_dz_dy: ['y', 'z', 'x'],
  dx_dy_dz: ['z', 'y', 'x'],
  dy_dz_dx: ['x', 'z', 'y'],
  dy_dx_dz: ['z', 'x', 'y'],
}

// ---------------------------------------------------------------------------
// simbólico
// ---------------------------------------------------------------------------

describe('exactConstant: reconoce números de libro', () => {
  const cases: [number, string][] = [
    [0, '0'], [1, '1'], [2, '2'], [-3, '-3'], [7, '7'],
    [0.5, '1/2'], [1 / 3, '1/3'], [2 / 3, '2/3'], [-4 / 3, '-4/3'], [5 / 6, '5/6'],
    [1.5, '3/2'], [0.6, '3/5'], [1.7, '17/10'], [2.25, '9/4'],
    [Math.SQRT2, 'sqrt(2)'], [Math.sqrt(3), 'sqrt(3)'], [Math.sqrt(5), 'sqrt(5)'],
    [2 * Math.SQRT2, '2*sqrt(2)'], [Math.SQRT2 / 2, 'sqrt(2)/2'], [(3 * Math.sqrt(3)) / 2, '3*sqrt(3)/2'],
    [Math.PI, 'pi'], [Math.PI / 2, 'pi/2'], [Math.PI / 4, 'pi/4'], [2 * Math.PI, '2*pi'],
    [-Math.PI / 2, '-pi/2'], [(3 * Math.PI) / 4, '3*pi/4'], [Math.PI / 6, 'pi/6'],
  ]
  for (const [v, s] of cases) {
    it(`${v} → ${s}`, () => {
      expect(exactConstant(v, 1e-9)).toBe(s)
    })
  }
  it('no inventa: 0.7173891… → null', () => expect(exactConstant(0.7173891, 1e-9)).toBeNull())
  it('no inventa: e → null', () => expect(exactConstant(Math.E, 1e-9)).toBeNull())
  it('no inventa: NaN → null', () => expect(exactConstant(NaN)).toBeNull())
  it('no inventa: ∞ → null', () => expect(exactConstant(Infinity)).toBeNull())
  it('prefiere π/2 a la fracción 11/7', () => expect(exactConstant(Math.PI / 2, 1e-3)).toBe('pi/2'))
})

describe('numberTex / constTex', () => {
  it('entero exacto', () => expect(numberTex(4)).toEqual({ tex: '4', exact: true }))
  it('fracción exacta con barra de fracción', () => {
    const t = numberTex(2 / 3, 1e-9)
    expect(t.exact).toBe(true)
    expect(t.tex).toContain('frac')
  })
  it('raíz exacta', () => {
    const t = numberTex(Math.sqrt(2), 1e-9)
    expect(t.exact).toBe(true)
    expect(t.tex).toContain('sqrt')
  })
  it('π/2 exacto con símbolo', () => {
    const t = numberTex(Math.PI / 2, 1e-9)
    expect(t.exact).toBe(true)
    expect(t.tex).toContain('pi')
  })
  it('decimal raro queda aproximado', () => {
    const t = numberTex(0.7173891, 1e-9)
    expect(t.exact).toBe(false)
    expect(t.tex).toContain('approx')
  })
  it('constTex no produce (−π)/2', () => expect(constTex('-pi/2')).toBe('-\\frac{\\pi}{2}'))
  it('constTex entero', () => expect(constTex('3')).toBe('3'))
})

describe('boundaryNode / substitute', () => {
  it('extrae F = izq − der', () => {
    const F = boundaryNode('x^2 + y <= 4')!
    expect(F.evaluate({ x: 1, y: 1 })).toBeCloseTo(-2)
  })
  it('acepta igualdad', () => {
    const F = boundaryNode('z = x^2')!
    expect(F.evaluate({ x: 2, z: 4 })).toBeCloseTo(0)
  })
  it('rechaza basura', () => expect(boundaryNode('hola')).toBeNull())
  it('sustituye variables manteniendo el resto', () => {
    const F = boundaryNode('x^2 + y^2 <= 4')!
    const S = substitute(F, { x: 'r * cos(theta)', y: 'r * sin(theta)' })
    expect(S.evaluate({ r: 1, theta: 0 })).toBeCloseTo(-3)
  })
})

describe('solveFor / candidatesFor', () => {
  it('lineal: 2x − y = 0 → y = 2x', () => {
    const cs = candidatesFor(['y <= 2*x'], 'y')
    expect(cs.some((c) => Math.abs(c.f({ x: 3 }) - 6) < 1e-9)).toBe(true)
  })
  it('círculo → y = ±√(4−x²)', () => {
    const cs = candidatesFor(['x^2 + y^2 <= 4'], 'y')
    const vals = cs.map((c) => c.f({ x: 1 }))
    expect(vals.some((v) => Math.abs(v - Math.sqrt(3)) < 1e-9)).toBe(true)
    expect(vals.some((v) => Math.abs(v + Math.sqrt(3)) < 1e-9)).toBe(true)
  })
  it('círculo desplazado → y = 1 ± √(9−(x−2)²)', () => {
    const cs = candidatesFor(['(x-2)^2 + (y-1)^2 <= 9'], 'y')
    const hi = cs.map((c) => c.f({ x: 2 }))
    expect(Math.max(...hi)).toBeCloseTo(4, 9)
    expect(Math.min(...hi)).toBeCloseTo(-2, 9)
  })
  it('parábola → y = x²', () => {
    const cs = candidatesFor(['y >= x^2'], 'y')
    expect(cs[0].f({ x: 3 })).toBeCloseTo(9)
  })
  it('paraboloide → z = x² + y²', () => {
    const cs = candidatesFor(['z >= x^2 + y^2'], 'z')
    expect(cs[0].f({ x: 1, y: 2 })).toBeCloseTo(5)
  })
  it('plano → z = 4 − y', () => {
    const cs = candidatesFor(['z <= 4 - y'], 'z')
    expect(cs[0].f({ y: 3 })).toBeCloseTo(1)
  })
  it('monomio cúbico: x³ ≤ y → y = x³ y también x = ∛y', () => {
    const cy = candidatesFor(['x^3 <= y'], 'y')
    expect(cy.some((c) => Math.abs(c.f({ x: 2 }) - 8) < 1e-9)).toBe(true)
    const cx = candidatesFor(['x^3 <= y'], 'x')
    expect(cx.some((c) => Math.abs(c.f({ y: 8 }) - 2) < 1e-9)).toBe(true)
  })
  it('cilindro r=2cosθ → r = 2cosθ en polares', () => {
    const cs = candidatesFor(['x^2 + y^2 <= 4*x'], 'r', { x: 'r * cos(theta)', y: 'r * sin(theta)' })
    expect(cs.some((c) => Math.abs(c.f({ theta: 0 }) - 4) < 1e-9)).toBe(true)
    expect(cs.some((c) => Math.abs(c.f({ theta: Math.PI / 3 }) - 2) < 1e-9)).toBe(true)
  })
  it('esfera → ρ = 2 en esféricas', () => {
    const cs = candidatesFor(['x^2 + y^2 + z^2 <= 4'], 'rho', {
      x: 'rho * sin(phi) * cos(theta)',
      y: 'rho * sin(phi) * sin(theta)',
      z: 'rho * cos(phi)',
    })
    expect(cs.some((c) => Math.abs(c.f({ theta: 0, phi: 1 }) - 2) < 1e-9)).toBe(true)
  })
  it('cono → φ = π/4 (constante: la elige describe)', () => {
    const d = describeSamples(
      [{ s: { theta: 0.4 }, value: Math.PI / 4 }, { s: { theta: 1.1 }, value: Math.PI / 4 }],
      [],
      1e-6,
    )
    expect(d?.exact).toBe(true)
    expect(d!.f({})).toBeCloseTo(Math.PI / 4, 9)
  })
})

describe('shadowCandidates', () => {
  it('sombra del helado: x²+y²≤1 → y = ±√(1−x²)', () => {
    const cs = shadowCandidates(['z >= sqrt(x^2 + y^2)', 'x^2 + y^2 + z^2 <= 2'], 'z', 'y')
    const vals = cs.map((c) => c.f({ x: 0 })).filter(Number.isFinite)
    expect(vals.some((v) => Math.abs(v - 1) < 1e-6)).toBe(true)
    expect(vals.some((v) => Math.abs(v + 1) < 1e-6)).toBe(true)
  })
  it('sombra del cilindro desplazado: y = ±√(4x−x²)', () => {
    const cs = shadowCandidates(['x^2 + y^2 <= 4*x', 'z >= 0', '4*z <= x^2 + y^2'], 'z', 'y')
    const vals = cs.map((c) => c.f({ x: 2 })).filter(Number.isFinite)
    expect(vals.some((v) => Math.abs(v - 2) < 1e-6)).toBe(true)
    expect(vals.some((v) => Math.abs(v + 2) < 1e-6)).toBe(true)
  })
  it('cruces entre tapas: z=x²+y² con z=4 → y = ±√(4−x²)', () => {
    const cs = shadowCandidates(['z >= x^2 + y^2', 'z <= 4'], 'z', 'y')
    const vals = cs.map((c) => c.f({ x: 0 })).filter(Number.isFinite)
    expect(Math.max(...vals)).toBeCloseTo(2, 6)
  })
})

describe('describe: elige el candidato correcto', () => {
  it('constante exacta', () => {
    const d = describeSamples([{ s: { x: 0.3 }, value: 2 }, { s: { x: 1.1 }, value: 2 }], [], 1e-6)
    expect(d).toEqual(expect.objectContaining({ tex: '2', exact: true }))
  })
  it('constante inexacta → aprox', () => {
    const d = describeSamples([{ s: { x: 0.3 }, value: 0.7173891 }, { s: { x: 1.1 }, value: 0.7173891 }], [], 1e-6)
    expect(d?.exact).toBe(false)
  })
  it('función: elige √(4−x²) entre los candidatos', () => {
    const cs = candidatesFor(['x^2 + y^2 <= 4'], 'y')
    const samples = [0.2, 0.7, 1.3].map((x) => ({ s: { x }, value: Math.sqrt(4 - x * x) }))
    const d = describeSamples(samples, cs, 1e-6)
    expect(d?.exact).toBe(true)
    expect(d!.f({ x: 1 })).toBeCloseTo(Math.sqrt(3), 9)
  })
  it('sin muestras → null', () => expect(describeSamples([], [], 1e-6)).toBeNull())
})

describe('prettyTex', () => {
  it('x²', () => expect(prettyTex(parse('x^2'))).toBe('{x}^{2}'))
  it('fracción exacta en vez de 0.5·x', () => {
    const t = prettyTex(parse('0.5 * x'))
    expect(t).toContain('frac')
  })
})

// ---------------------------------------------------------------------------
// helpers del planificador
// ---------------------------------------------------------------------------

describe('segment: parte el dominio donde cambia la clave', () => {
  it('una sola clave → un tramo', () => {
    const s = segment(() => 'a|b', 0, 4)
    expect(s).toHaveLength(1)
    expect(s[0].a).toBe(0)
    expect(s[0].b).toBe(4)
  })
  it('dos claves → dos tramos en el punto de cambio', () => {
    const s = segment((w) => (w < 2 ? 'a|b' : 'c|b'), 0, 4)
    expect(s).toHaveLength(2)
    expect(s[0].b).toBeCloseTo(2, 1)
    expect(s[1].a).toBeCloseTo(2, 1)
  })
  it('null corta el tramo', () => {
    const s = segment((w) => (w > 1 && w < 3 ? 'a|b' : null), 0, 4)
    expect(s).toHaveLength(1)
    expect(s[0].a).toBeCloseTo(1, 1)
    expect(s[0].b).toBeCloseTo(3, 1)
  })
  it('periódico: une el tramo final con el inicial si la clave coincide', () => {
    // región en θ ∈ [−π/2, π/2] vista en [0, 2π]
    const s = segment((w) => (w < Math.PI / 2 || w > (3 * Math.PI) / 2 ? 'r' : null), 0, 2 * Math.PI, 96, true)
    expect(s).toHaveLength(1)
    expect(s[0].a).toBeCloseTo(-Math.PI / 2, 1)
    expect(s[0].b).toBeCloseTo(Math.PI / 2, 1)
  })
  it('sin periodicidad no une', () => {
    const s = segment((w) => (w < Math.PI / 2 || w > (3 * Math.PI) / 2 ? 'r' : null), 0, 2 * Math.PI, 96, false)
    expect(s).toHaveLength(2)
  })
})

describe('span / rayMin / snapLim', () => {
  it('span encuentra el tramo de g ≤ 0', () => {
    const s = span((t) => t * t - 1, -2, 2)!
    expect(s.a).toBeCloseTo(-1, 2)
    expect(s.b).toBeCloseTo(1, 2)
  })
  it('span vacío → null', () => expect(span((t) => t * t + 1, -1, 1)).toBeNull())
  it('rayMin halla el mínimo del máximo a lo largo del rayo', () => {
    const m = rayMin((t) => Math.max(t - 2, -(t - 2)), -4, 4)
    expect(m).toBeCloseTo(0, 2)
  })
  it('snapLim reconoce 2/3', () => {
    const l = snapLim(2 / 3 + 1e-7, 10)
    expect(l.tex).toContain('frac')
    expect(l.exact).toBe(true)
  })
  it('snapLim decimal raro → aprox', () => {
    const l = snapLim(1.23456789, 0.5)
    expect(l.exact).toBe(false)
  })
})

describe('plan2: piezas a partir de un barrido sintético', () => {
  it('límites lineales → una pieza exacta', () => {
    const pieces = plan2({
      searchLo: -1,
      searchHi: 3,
      slice: (w) => (w >= 0 && w <= 2 ? [{ a: w, b: 4 - w, ka: '0', kb: '1' }] : []),
      cands: candidatesFor(['y >= x', 'y <= 4 - x'], 'y'),
      outerVar: 'x',
      innerSpan: 8,
    })
    expect(pieces).toHaveLength(1)
    expect(pieces[0].from.tex).toBe('0')
    expect(pieces[0].to.tex).toBe('2')
    expect(pieces[0].lo!.tex.trim()).toBe('x')
    expect(pieces[0].hi!.tex.replace(/\s/g, '')).toBe('4-x')
    expect(allExact(pieces)).toBe(true)
  })
  it('cambio de frontera a la mitad → dos piezas', () => {
    const pieces = plan2({
      searchLo: -1,
      searchHi: 4,
      slice: (w) => (w >= 0 && w <= 3 ? [{ a: 0, b: w < 1.5 ? w : 3 - w, ka: 'k', kb: w < 1.5 ? 'a' : 'b' }] : []),
      cands: candidatesFor(['y >= 0', 'y <= x', 'y <= 3 - x'], 'y'),
      outerVar: 'x',
      innerSpan: 8,
    })
    expect(pieces).toHaveLength(2)
    expect(pieces[0].to.tex).toBe('\\frac{3}{2}')
    expect(pieces[1].from.tex).toBe('\\frac{3}{2}')
  })
})

describe('tex2 / tex3 / allExact', () => {
  const p: Piece2 = { a: 0, b: 1, from: { tex: '0', exact: true }, to: { tex: '1', exact: true }, lo: { tex: 'x', exact: true }, hi: { tex: 'x^2', exact: true } }
  it('tex2 arma la integral doble', () => {
    expect(tex2([p], 'y', 'x')).toBe('\\int_{0}^{1}\\!\\int_{x}^{x^2} f\\,dy\\,dx')
  })
  it('tex2 con peso (jacobiano)', () => {
    expect(tex2([p], 'r', '\\theta', '\\,r')).toContain('f\\,r\\,dr')
  })
  it('tex2 une piezas con +', () => {
    expect(tex2([p, p], 'y', 'x').split('+').length).toBe(2)
  })
  it('tex3 arma la triple', () => {
    const q: Piece3 = { ...p, inLo: { tex: '0', exact: true }, inHi: { tex: 'z', exact: true } }
    expect(tex3([q], 'z', 'y', 'x')).toContain('dz\\,dy\\,dx')
  })
  it('allExact exige todo exacto', () => {
    expect(allExact([p])).toBe(true)
    expect(allExact([{ ...p, hi: { tex: '{\\approx}1.23', exact: false } }])).toBe(false)
    expect(allExact([{ ...p, lo: null }])).toBe(false)
  })
})

describe('jacobianTex', () => {
  it('u=xy, v=y/x → 1/(2v)', () => {
    const t = jacobianTex('sqrt(u/v)', 'sqrt(u*v)')
    expect(t.replace(/[\\\s,]/g, '')).toContain('frac{1}{2v}')
  })
  it('x=u²−v², y=2uv → 4u²+4v² (determinante simbólico)', () => {
    const t = jacobianTex('u^2 - v^2', '2*u*v')
    expect(t.length).toBeGreaterThan(0)
  })
  it('x=u+v, y=u−v → 2', () => {
    expect(jacobianTex('u + v', 'u - v')).toBe('2')
  })
})

// ---------------------------------------------------------------------------
// presets: una pieza por orden elegido
// ---------------------------------------------------------------------------

const planCache = new Map<string, PlanRes>()
const planOf = (req: PlanReq): PlanRes => {
  const k = JSON.stringify(req)
  if (!planCache.has(k)) planCache.set(k, computePlan(req))
  return planCache.get(k)!
}

beforeAll(() => {
  for (const p of PRESETS) planOf(reqOf(p))
  // segundo orden para todos los casos del módulo 1 (regiones que hay que partir)
  for (const p of PRESETS.filter((q) => q.module === 1)) {
    planOf({ kind: 'cart2', raws: presetRaws(p), inner: 'x' })
    planOf({ kind: 'cart2', raws: presetRaws(p), inner: 'y' })
  }
}, 240_000)

describe('presets: el planteo no queda vacío', () => {
  for (const p of PRESETS) {
    it(`${p.id}`, () => {
      const r = planOf(reqOf(p))
      expect(r.pieces.length).toBeGreaterThan(0)
      expect(r.tex.length).toBeGreaterThan(0)
    })
  }
})

describe('presets: límites exactos donde hay respuesta de libro', () => {
  for (const p of PRESETS.filter((q) => q.limitsTex)) {
    it(`${p.id} exacto`, () => {
      const r = planOf(reqOf(p))
      expect(r.exact).toBe(true)
      for (const pc of r.pieces) {
        expect(pc.lo).not.toBeNull()
        expect(pc.hi).not.toBeNull()
      }
    })
  }
})

describe('presets: las piezas cubren la región (numérico)', () => {
  for (const p of PRESETS) {
    it(`${p.id}`, () => {
      const req = reqOf(p)
      const r = planOf(req)
      const raws = presetRaws(p)
      if (req.kind === 'cart2') {
        const region = regOf(raws, '2d')
        const fit = fitBounds2D((x, y) => region.field(x, y, 0))!
        const v = fit.view
        const outer = req.inner === 'y' ? 'x' : 'y'
        const [oLo, oHi] = outer === 'x' ? [v.x0, v.x1] : [v.y0, v.y1]
        const [iLo, iHi] = req.inner === 'y' ? [v.y0, v.y1] : [v.x0, v.x1]
        const c = covers2D(
          r.pieces as Piece2[],
          (w, t) => region.field(outer === 'x' ? w : t, outer === 'x' ? t : w, 0) <= 0,
          outer, oLo, oHi, iLo, iHi,
        )
        expect(c.bad, `${p.id}: ${c.bad} puntos fuera del planteo`).toBe(0)
      } else if (req.kind === 'cv2') {
        const region = regOf(raws, '2d')
        const angular = req.transform === 'polar' || req.transform === 'elliptic'
        const uVar = angular ? 'theta' : 'u'
        const uLo = Math.min(...r.pieces.map((q) => q.a))
        const uHi = Math.max(...r.pieces.map((q) => q.b))
        let vLo = 0, vHi = 0
        if (angular) {
          const fit = fitBounds2D((x, y) => region.field(x, y, 0))!.view
          const a = req.transform === 'elliptic' ? req.a ?? 1 : 1
          const b = req.transform === 'elliptic' ? req.b ?? 1 : 1
          const rMaxXY = Math.max(...[[fit.x0, fit.y0], [fit.x1, fit.y0], [fit.x0, fit.y1], [fit.x1, fit.y1]].map(([x, y]) => Math.hypot(x, y)))
          vLo = 0
          vHi = (rMaxXY / Math.min(Math.abs(a) || 1, Math.abs(b) || 1)) * 1.02
        } else if (req.transform === 'linear') {
          const fit = fitBounds2D((x, y) => region.field(x, y, 0))!.view
          const [a, b, c, d] = req.lin ?? [1, 0, 0, 1]
          const vs = [[fit.x0, fit.y0], [fit.x1, fit.y0], [fit.x0, fit.y1], [fit.x1, fit.y1]].map(([x, y]) => c * x + d * y)
          vLo = Math.min(...vs)
          vHi = Math.max(...vs)
        } else {
          vLo = req.custom!.v0
          vHi = req.custom!.v1
        }
        const c = covers2D(
          r.pieces as Piece2[],
          (w, t) => {
            const [x, y] = fwd2(req, w, t)
            return Number.isFinite(x) && Number.isFinite(y) && region.field(x, y, 0) <= 0
          },
          uVar, uLo, uHi, vLo, vHi, 700,
        )
        expect(c.bad, `${p.id}: ${c.bad} puntos fuera del planteo`).toBe(0)
      } else if (req.kind === 'cart3') {
        const region = regOf(raws, '3d')
        const fit = fitBounds3D(region.field)!
        const bb = fit.bbox
        const [oName, mName] = OUTER3[req.order]
        const rng = (a: string) => [bb[`${a}0` as 'x0'], bb[`${a}1` as 'x1']] as [number, number]
        const c = covers3D(
          r.pieces as Piece3[],
          (w, m, t) => {
            const q = { x: 0, y: 0, z: 0 } as Record<string, number>
            q[oName] = w
            q[mName] = m
            q[OUTER3[req.order][2]] = t
            return region.field(q.x, q.y, q.z) <= 0
          },
          oName, mName, ...rng(oName), ...rng(mName), ...rng(OUTER3[req.order][2]),
        )
        expect(c.bad, `${p.id}: ${c.bad} puntos fuera del planteo`).toBe(0)
      } else {
        const region = regOf(raws, '3d')
        const fit = fitBounds3D(region.field)!
        const bb = fit.bbox
        const sph = req.mode === 'sph'
        const mName = sph ? 'phi' : 'r'
        const corner = Math.max(...[bb.x0, bb.x1].flatMap((x) => [bb.y0, bb.y1].flatMap((y) => [bb.z0, bb.z1].map((z) => Math.hypot(x, y, z)))))
        const rXY = Math.max(...[bb.x0, bb.x1].flatMap((x) => [bb.y0, bb.y1].map((y) => Math.hypot(x, y))))
        const [loT, hiT] = sph ? [0, corner * 1.02] : [bb.z0, bb.z1]
        const [loM, hiM] = sph ? [0, Math.PI] : [0, rXY * 1.02]
        const c = covers3D(
          r.pieces as Piece3[],
          (w, m, t) => {
            const [x, y, z] = fwd3(req, w, m, t)
            return Number.isFinite(x) && region.field(x, y, z) <= 0
          },
          'theta', mName, 0, 2 * Math.PI, loM, hiM, loT, hiT, 700,
          11,
          [0, -2 * Math.PI, 2 * Math.PI],
        )
        expect(c.bad, `${p.id}: ${c.bad} puntos fuera del planteo`).toBe(0)
      }
    })
  }
})

describe('presets: jacobiano presente en cambios de variable', () => {
  it('polares: r', () => expect(planOf(reqOf(PRESETS.find((p) => p.id === 'm2-corona')!)).weightTex).toBe('r'))
  it('elípticas 3·2: 6r', () => expect(planOf(reqOf(PRESETS.find((p) => p.id === 'm2-elipse')!)).weightTex).toBe('6\\,r'))
  it('cilíndricas: r', () => expect(planOf(reqOf(PRESETS.find((p) => p.id === 'm4-cilindro')!)).weightTex).toBe('r'))
  it('esféricas: ρ²senφ', () => expect(planOf(reqOf(PRESETS.find((p) => p.id === 'm4-tp16-6')!)).weightTex).toBe('\\rho^2\\sin\\phi'))
  it('u=xy, v=y/x: 1/(2v)', () => {
    const t = planOf(reqOf(PRESETS.find((p) => p.id === 'm2-hiperbolas')!)).weightTex
    expect(t).toContain('frac')
    expect(t.replace(/[\\\s,]/g, '')).toContain('2v')
  })
})

describe('presets módulo 1: las dos órdenes funcionan', () => {
  for (const p of PRESETS.filter((q) => q.module === 1)) {
    for (const inner of ['y', 'x'] as const) {
      it(`${p.id} (d${inner} primero)`, () => {
        const r = planOf({ kind: 'cart2', raws: presetRaws(p), inner })
        expect(r.pieces.length).toBeGreaterThan(0)
      })
    }
  }
})

describe('presets: particiones detectadas', () => {
  it('tp13-2 en dy dx son 2 integrales', () => {
    const r = planOf({ kind: 'cart2', raws: presetRaws(PRESETS.find((p) => p.id === 'm1-tp13-2')!), inner: 'y' })
    expect(r.pieces).toHaveLength(2)
  })
  it('tp13-2 en dx dy es 1 sola', () => {
    const r = planOf({ kind: 'cart2', raws: presetRaws(PRESETS.find((p) => p.id === 'm1-tp13-2')!), inner: 'x' })
    expect(r.pieces).toHaveLength(1)
  })
  it('tp13-10 (hipérbolas) en dy dx son 3 integrales', () => {
    const r = planOf({ kind: 'cart2', raws: presetRaws(PRESETS.find((p) => p.id === 'm1-tp13-10')!), inner: 'y' })
    expect(r.pieces).toHaveLength(3)
  })
  it('lente en dx dy son 2 integrales', () => {
    const r = planOf({ kind: 'cart2', raws: presetRaws(PRESETS.find((p) => p.id === 'm1-lente')!), inner: 'x' })
    expect(r.pieces).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// familias generadas: objetos variados (desplazados incluidos)
// ---------------------------------------------------------------------------

const CASES_2D: { id: string; raws: RawConstraint[] }[] = [
  { id: 'rectángulo desplazado', raws: [RC('x >= 1'), RC('x <= 3'), RC('y >= -1'), RC('y <= 2')] },
  { id: 'rectángulo cuadrante III', raws: [RC('x >= -4'), RC('x <= -1'), RC('y >= -3'), RC('y <= -0.5')] },
  { id: 'cuadrado centrado', raws: [RC('x >= -2'), RC('x <= 2'), RC('y >= -2'), RC('y <= 2')] },
  { id: 'disco r=1', raws: [RC('x^2 + y^2 <= 1')] },
  { id: 'disco r=3 centrado en (2,1)', raws: [RC('(x-2)^2 + (y-1)^2 <= 9')] },
  { id: 'disco tangente al origen', raws: [RC('(x-2)^2 + y^2 <= 4')] },
  { id: 'elipse horizontal', raws: [RC('x^2/4 + y^2 <= 1')] },
  { id: 'bajo parábola', raws: [RC('y >= 0'), RC('y <= 4 - x^2')] },
  { id: 'parábola desplazada', raws: [RC('y >= (x-1)^2'), RC('y <= 3')] },
  { id: 'triángulo', raws: [RC('x >= 0'), RC('y >= 0'), RC('x + y <= 2')] },
  { id: 'trapecio', raws: [RC('y >= 0'), RC('y <= x'), RC('y <= 4 - x')] },
  { id: 'semicorona 1≤r≤3, y≥0', raws: [RC('x^2 + y^2 >= 1'), RC('x^2 + y^2 <= 9'), RC('y >= 0')] },
  { id: 'entre hipérbola y recta', raws: [RC('x*y >= 1'), RC('y <= 4'), RC('x <= 3'), RC('x >= 0')] },
  { id: 'banda vertical', raws: [RC('x >= -1'), RC('x <= 1'), RC('y <= x^2 + 2'), RC('y >= x^2 - 1')] },
]

describe('familias 2D: ambos órdenes, exactos y con cobertura', () => {
  const cart2 = (raws: RawConstraint[], inner: 'x' | 'y') => planOf({ kind: 'cart2', raws, inner })
  for (const c of CASES_2D) {
    for (const inner of ['y', 'x'] as const) {
      it(`${c.id} (d${inner} primero)`, () => {
        const r = cart2(c.raws, inner)
        const region = regOf(c.raws, '2d')
        const fit = fitBounds2D((x, y) => region.field(x, y, 0))!
        const v = fit.view
        const outer = inner === 'y' ? 'x' : 'y'
        const [oLo, oHi] = outer === 'x' ? [v.x0, v.x1] : [v.y0, v.y1]
        const [iLo, iHi] = inner === 'y' ? [v.y0, v.y1] : [v.x0, v.x1]
        const cov = covers2D(
          r.pieces as Piece2[],
          (w, t) => region.field(outer === 'x' ? w : t, outer === 'x' ? t : w, 0) <= 0,
          outer, oLo, oHi, iLo, iHi,
        )
        expect(cov.bad, `${c.id}: ${cov.bad} puntos fuera del planteo`).toBe(0)
        expect(r.exact, `${c.id}: debería salir exacto`).toBe(true)
      })
    }
  }
})

const CASES_3D: { id: string; raws: RawConstraint[]; order: IntegrationOrder3D }[] = [
  {
    id: 'caja desplazada',
    raws: [RC('x >= -1'), RC('x <= 2'), RC('y >= 0'), RC('y <= 3'), RC('z >= 1'), RC('z <= 4')],
    order: 'dz_dy_dx',
  },
  {
    id: 'caja desplazada (dx primero)',
    raws: [RC('x >= -1'), RC('x <= 2'), RC('y >= 0'), RC('y <= 3'), RC('z >= 1'), RC('z <= 4')],
    order: 'dx_dz_dy',
  },
  {
    id: 'tetraedro desplazado',
    raws: [RC('x + y + z <= 4'), RC('x >= 1'), RC('y >= 1'), RC('z >= 1')],
    order: 'dz_dy_dx',
  },
  {
    id: 'esfera r=2',
    raws: [RC('x^2 + y^2 + z^2 <= 4')],
    order: 'dz_dy_dx',
  },
  {
    id: 'esfera desplazada a (1,−2,1)',
    raws: [RC('(x-1)^2 + (y+2)^2 + (z-1)^2 <= 4')],
    order: 'dz_dy_dx',
  },
  {
    id: 'cilindro desplazado x²+y²≤4x, 0≤z≤5',
    raws: [RC('x^2 + y^2 <= 4*x'), RC('z >= 0'), RC('z <= 5')],
    order: 'dz_dy_dx',
  },
  {
    id: 'cilindro desplazado x²+z²≤6x (dx primero)',
    raws: [RC('x^2 + z^2 <= 6*x'), RC('y >= 0'), RC('y <= 3'), RC('z >= 0')],
    order: 'dx_dz_dy',
  },
  {
    id: 'paraboloide bajo plano',
    raws: [RC('z >= x^2 + y^2'), RC('z <= 9')],
    order: 'dz_dy_dx',
  },
  {
    id: 'cono dentro de esfera',
    raws: [RC('z >= sqrt(x^2 + y^2)'), RC('x^2 + y^2 + z^2 <= 8')],
    order: 'dz_dy_dx',
  },
  {
    id: 'cuña entre planos',
    raws: [RC('z >= 0'), RC('z <= 2 - y'), RC('x^2 + y^2 <= 9'), RC('x >= 0'), RC('y >= 0')],
    order: 'dz_dy_dx',
  },
]

describe('familias 3D cartesianas (incl. sólidos desplazados)', () => {
  for (const c of CASES_3D) {
    it(`${c.id} [${c.order}]`, () => {
      const r = planOf({ kind: 'cart3', raws: c.raws, order: c.order })
      expect(r.pieces.length).toBeGreaterThan(0)
      const region = regOf(c.raws, '3d')
      const fit = fitBounds3D(region.field)!
      const bb = fit.bbox
      const [oName, mName, tName] = OUTER3[c.order]
      const rng3 = (a: string) => [bb[`${a}0` as 'x0'], bb[`${a}1` as 'x1']] as [number, number]
      const cov = covers3D(
        r.pieces as Piece3[],
        (w, m, t) => {
          const q = { x: 0, y: 0, z: 0 } as Record<string, number>
          q[oName] = w
          q[mName] = m
          q[tName] = t
          return region.field(q.x, q.y, q.z) <= 0
        },
        oName, mName, ...rng3(oName), ...rng3(mName), ...rng3(tName),
      )
      expect(cov.bad, `${c.id}: ${cov.bad} puntos fuera del planteo`).toBe(0)
      expect(r.exact, `${c.id}: debería salir exacto`).toBe(true)
    })
  }
})

const CASES_CV2: { id: string; req: Extract<PlanReq, { kind: 'cv2' }> }[] = [
  {
    id: 'corona 1≤r≤3 en polares',
    req: { kind: 'cv2', raws: [RC('x^2 + y^2 >= 1'), RC('x^2 + y^2 <= 9')], transform: 'polar' },
  },
  {
    id: 'medio disco en polares',
    req: { kind: 'cv2', raws: [RC('x^2 + y^2 <= 4'), RC('y >= 0')], transform: 'polar' },
  },
  {
    id: 'sector bajo y=x en polares',
    req: { kind: 'cv2', raws: [RC('x^2 + y^2 <= 4'), RC('y >= 0'), RC('y <= x')], transform: 'polar' },
  },
  {
    id: 'cuarto de corona en polares',
    req: { kind: 'cv2', raws: [RC('x^2 + y^2 >= 1'), RC('x^2 + y^2 <= 4'), RC('x >= 0'), RC('y >= 0')], transform: 'polar' },
  },
  {
    id: 'elipse x²/4+y²/9≤1 en elípticas',
    req: { kind: 'cv2', raws: [RC('x^2/4 + y^2/9 <= 1')], transform: 'elliptic', a: 2, b: 3 },
  },
  {
    id: 'medio elipse en elípticas',
    req: { kind: 'cv2', raws: [RC('x^2/9 + y^2 <= 1'), RC('y >= 0')], transform: 'elliptic', a: 3, b: 1 },
  },
  {
    id: 'cuadrado con cizalladura lineal',
    req: { kind: 'cv2', raws: [RC('x - y >= 0'), RC('x - y <= 2'), RC('y >= 0'), RC('y <= 1')], transform: 'linear', lin: [1, -1, 0, 1] },
  },
  {
    id: 'rombo con rotación lineal',
    req: { kind: 'cv2', raws: [RC('x + y >= -1'), RC('x + y <= 1'), RC('x - y >= -1'), RC('x - y <= 1')], transform: 'linear', lin: [1, 1, 1, -1] },
  },
  {
    id: 'transformación afin simple (custom)',
    req: { kind: 'cv2', raws: [RC('x >= 0'), RC('x <= 2'), RC('y >= 0'), RC('y <= 2')], transform: 'custom', custom: { xExpr: 'u + v', yExpr: 'u - v', u0: -1, u1: 2, v0: -1, v1: 1 } },
  },
]

describe('familias con cambio de variables', () => {
  for (const c of CASES_CV2) {
    it(c.id, () => {
      const r = planOf(c.req)
      expect(r.pieces.length).toBeGreaterThan(0)
      const region = regOf(c.req.raws, '2d')
      const angular = c.req.transform === 'polar' || c.req.transform === 'elliptic'
      const uVar = angular ? 'theta' : 'u'
      const uLo = Math.min(...r.pieces.map((q) => q.a))
      const uHi = Math.max(...r.pieces.map((q) => q.b))
      const fit = fitBounds2D((x, y) => region.field(x, y, 0))!.view
      let vLo = 0, vHi = 0
      if (angular) {
        const a = c.req.transform === 'elliptic' ? c.req.a ?? 1 : 1
        const b = c.req.transform === 'elliptic' ? c.req.b ?? 1 : 1
        const rMaxXY = Math.max(...[[fit.x0, fit.y0], [fit.x1, fit.y0], [fit.x0, fit.y1], [fit.x1, fit.y1]].map(([x, y]) => Math.hypot(x, y)))
        vHi = (rMaxXY / Math.min(Math.abs(a) || 1, Math.abs(b) || 1)) * 1.02
      } else if (c.req.transform === 'linear') {
        const [a, b, cc, d] = c.req.lin ?? [1, 0, 0, 1]
        const vs = [[fit.x0, fit.y0], [fit.x1, fit.y0], [fit.x0, fit.y1], [fit.x1, fit.y1]].map(([x, y]) => cc * x + d * y)
        vLo = Math.min(...vs)
        vHi = Math.max(...vs)
      } else {
        vLo = c.req.custom!.v0
        vHi = c.req.custom!.v1
      }
      const cov = covers2D(
        r.pieces as Piece2[],
        (w, t) => {
          const [x, y] = fwd2(c.req, w, t)
          return Number.isFinite(x) && Number.isFinite(y) && region.field(x, y, 0) <= 0
        },
        uVar, uLo, uHi, vLo, vHi, 700,
      )
      expect(cov.bad, `${c.id}: ${cov.bad} puntos fuera del planteo`).toBe(0)
      // |J| = 1 no se imprime
      const unit = c.req.transform === 'linear' && Math.abs((c.req.lin![0] * c.req.lin![3] - c.req.lin![1] * c.req.lin![2])) === 1
      if (!unit) expect(r.weightTex.length).toBeGreaterThan(0)
      expect(r.exact, `${c.id}: debería salir exacto`).toBe(true)
    })
  }
})

const CASES_CS3: { id: string; req: Extract<PlanReq, { kind: 'cs3' }> }[] = [
  {
    id: 'cilindro r≤3, z∈[−1,2]',
    req: { kind: 'cs3', raws: [RC('x^2 + y^2 <= 9'), RC('z >= -1'), RC('z <= 2')], mode: 'cyl' },
  },
  {
    id: 'corona cilíndrica 1≤r≤2',
    req: { kind: 'cs3', raws: [RC('x^2 + y^2 >= 1'), RC('x^2 + y^2 <= 4'), RC('z >= 0'), RC('z <= 3')], mode: 'cyl' },
  },
  {
    id: 'cono z≥r hasta z=4',
    req: { kind: 'cs3', raws: [RC('z >= sqrt(x^2 + y^2)'), RC('z <= 4')], mode: 'cyl' },
  },
  {
    id: 'esfera en cilíndricas',
    req: { kind: 'cs3', raws: [RC('x^2 + y^2 + z^2 <= 9')], mode: 'cyl' },
  },
  {
    id: 'cuña esférica (θ≤π/2)',
    req: { kind: 'cs3', raws: [RC('x^2 + y^2 + z^2 <= 4'), RC('x >= 0'), RC('y >= 0')], mode: 'sph' },
  },
  {
    id: 'casquete esférico z≥1',
    req: { kind: 'cs3', raws: [RC('x^2 + y^2 + z^2 <= 4'), RC('z >= 1')], mode: 'sph' },
  },
]

describe('familias cilíndricas y esféricas', () => {
  for (const c of CASES_CS3) {
    it(c.id, () => {
      const r = planOf(c.req)
      expect(r.pieces.length).toBeGreaterThan(0)
      const region = regOf(c.req.raws, '3d')
      const fit = fitBounds3D(region.field)!
      const bb = fit.bbox
      const sph = c.req.mode === 'sph'
      const corner = Math.max(...[bb.x0, bb.x1].flatMap((x) => [bb.y0, bb.y1].flatMap((y) => [bb.z0, bb.z1].map((z) => Math.hypot(x, y, z)))))
      const rXY = Math.max(...[bb.x0, bb.x1].flatMap((x) => [bb.y0, bb.y1].map((y) => Math.hypot(x, y))))
      const [loT, hiT] = sph ? [0, corner * 1.02] : [bb.z0, bb.z1]
      const [loM, hiM] = sph ? [0, Math.PI] : [0, rXY * 1.02]
      const cov = covers3D(
        r.pieces as Piece3[],
        (w, m, t) => {
          const [x, y, z] = fwd3(c.req, w, m, t)
          return Number.isFinite(x) && region.field(x, y, z) <= 0
        },
        'theta', sph ? 'phi' : 'r', 0, 2 * Math.PI, loM, hiM, loT, hiT, 700,
        11,
        [0, -2 * Math.PI, 2 * Math.PI],
      )
      expect(cov.bad, `${c.id}: ${cov.bad} puntos fuera del planteo`).toBe(0)
      expect(r.weightTex.length).toBeGreaterThan(0)
      expect(r.exact, `${c.id}: debería salir exacto`).toBe(true)
    })
  }
})

describe('casos límite', () => {
  it('región vacía → plan vacío', () => {
    const r = planOf({ kind: 'cart2', raws: [RC('x^2 + y^2 <= -1')], inner: 'y' })
    expect(r.pieces).toHaveLength(0)
    expect(r.exact).toBe(false)
  })
  it('restricción oculta no cuenta para la región', () => {
    const r = planOf({ kind: 'cart2', raws: [RC('x >= 0'), RC('x <= 1'), RC('y >= 0'), RC('y <= 1'), RC('x <= -3', 'le', false)], inner: 'y' })
    expect(r.pieces).toHaveLength(1)
  })
  it('un solo punto de contacto (disco tangente a recta) → casi nada', () => {
    const r = planOf({ kind: 'cart2', raws: [RC('x^2 + y^2 <= 1'), RC('y >= 1')], inner: 'y' })
    const total = r.pieces.reduce((s, p) => s + (p.b - p.a), 0)
    expect(total).toBeLessThan(0.05)
  })
})
