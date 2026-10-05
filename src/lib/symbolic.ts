import { derivative, parse, rationalize, simplify, type MathNode } from 'mathjs/number'

/**
 * Álgebra mínima para mostrar límites "de libro": despeja una variable de una
 * frontera F = 0 (lineal o cuadrática en esa variable) y reconoce constantes
 * exactas (enteros, fracciones, raíces, múltiplos de π). Todo resultado se
 * verifica numéricamente antes de mostrarse: si no coincide, no se usa.
 */

export type Scope = Record<string, number>

export interface Candidate {
  tex: string
  node: MathNode
  f: (s: Scope) => number
}

const OP_RE = /^(.*?)(<=|>=|<|>|=)(.*)$/

const RULES = [
  ...simplify.rules,
  'sin(n)^2 + cos(n)^2 -> 1',
  'cos(n)^2 + sin(n)^2 -> 1',
  'n1 * sin(n)^2 + n1 * cos(n)^2 -> n1',
]

function safeSimplify(n: MathNode): MathNode {
  try {
    return simplify(n, RULES as never)
  } catch {
    return n
  }
}

export function boundaryNode(raw: string): MathNode | null {
  const m = raw.trim().match(OP_RE)
  if (!m || !m[1].trim() || !m[3].trim()) return null
  try {
    return parse(`(${m[1]}) - (${m[3]})`)
  } catch {
    return null
  }
}

function compileNode(n: MathNode): (s: Scope) => number {
  const c = n.compile()
  return (s) => {
    try {
      const v = c.evaluate({ ...CONSTS, ...s })
      return typeof v === 'number' ? v : NaN
    } catch {
      return NaN
    }
  }
}

const CONSTS: Scope = { pi: Math.PI, e: Math.E }

function hasSymbol(n: MathNode, name: string): boolean {
  let found = false
  n.traverse((c) => {
    const cc = c as unknown as { isSymbolNode?: boolean; name?: string }
    if (cc.isSymbolNode && cc.name === name) found = true
  })
  return found
}

function freeVars(n: MathNode): string[] {
  const s = new Set<string>()
  n.traverse((c, _p, parent) => {
    const cc = c as unknown as { isSymbolNode?: boolean; name?: string }
    const pp = parent as unknown as { isFunctionNode?: boolean; fn?: unknown } | null
    if (cc.isSymbolNode && !(pp?.isFunctionNode && pp.fn === c) && !(cc.name! in CONSTS)) s.add(cc.name!)
  })
  return [...s]
}

export function substitute(n: MathNode, subs: Record<string, string>): MathNode {
  const parsed: Record<string, MathNode> = {}
  for (const [k, v] of Object.entries(subs)) parsed[k] = parse(`(${v})`)
  return n.transform((c, _p, parent) => {
    const cc = c as unknown as { isSymbolNode?: boolean; name?: string }
    const pp = parent as unknown as { isFunctionNode?: boolean; fn?: unknown } | null
    if (cc.isSymbolNode && parsed[cc.name!] && !(pp?.isFunctionNode && pp.fn === c)) return parsed[cc.name!].cloneDeep()
    return c
  })
}

// --- Constantes exactas -------------------------------------------------------

const SURDS = [2, 3, 5, 6, 7]

/** Reconoce un número "de libro". Devuelve su expresión (texto mathjs) o null. */
export function exactConstant(v: number, tol = 1e-6): string | null {
  if (!Number.isFinite(v)) return null
  const t = tol * Math.max(1, Math.abs(v))
  const sign = v < 0 ? '-' : ''
  const a = Math.abs(v)
  // Se juntan todas las formas que entran en la tolerancia y gana la de menor
  // error (a igualdad, la más simple): así π/2 no se confunde con 11/7.
  const found: { s: string; err: number; cx: number }[] = []
  const add = (s: string, val: number, cx: number) => {
    const err = Math.abs(a - val)
    if (err < t) found.push({ s, err, cx })
  }
  add(String(Math.round(a)), Math.round(a), 0)
  for (let q = 2; q <= 12; q++) {
    const p = Math.round(a * q)
    if (p > 0 && gcd(p, q) === 1) add(`${p}/${q}`, p / q, 1 + q / 100)
  }
  for (const q of [1, 2, 3, 4, 6, 8, 12]) {
    const p = Math.round((a * q) / Math.PI)
    if (p > 0 && p <= 48 && gcd(p, q) === 1) {
      const num = p === 1 ? 'pi' : `${p}*pi`
      add(q === 1 ? num : `${num}/${q}`, (p * Math.PI) / q, 1.5 + q / 100)
    }
  }
  for (const s of SURDS) {
    const root = Math.sqrt(s)
    for (let q = 1; q <= 6; q++) {
      const p = Math.round((a * q) / root)
      if (p > 0 && p <= 24 && gcd(p, q) === 1) {
        const num = p === 1 ? `sqrt(${s})` : `${p}*sqrt(${s})`
        add(q === 1 ? num : `${num}/${q}`, (p * root) / q, 2 + q / 100)
      }
    }
  }
  // k ± p·√s/q: bordes de objetos desplazados (1−√3, 2+√2/2…)
  const surdPart = (rem: number): { s: string; v: number; cx: number } | null => {
    for (const s of SURDS) {
      const root = Math.sqrt(s)
      for (let q = 1; q <= 4; q++) {
        const p = Math.round((rem * q) / root)
        if (p > 0 && p <= 12 && gcd(p, q) === 1) {
          const v = (p * root) / q
          if (Math.abs(rem - v) < t) {
            const num = p === 1 ? `sqrt(${s})` : `${p}*sqrt(${s})`
            return { s: q === 1 ? num : `${num}/${q}`, v, cx: 2 + q / 100 }
          }
        }
      }
    }
    return null
  }
  for (let k = Math.floor(a - 4); k <= Math.ceil(a + 4); k++) {
    if (k === 0) continue
    const rem = Math.abs(a - k)
    if (rem < t || Math.abs(rem - Math.round(rem)) < t) continue
    const sp = surdPart(rem)
    if (sp) {
      const e = a >= k ? `${k}+${sp.s}` : `${k}-${sp.s}`
      add(e, k + Math.sign(a - k) * sp.v, 4 + sp.cx)
    }
  }
  if (!found.length) return null
  const minErr = Math.min(...found.map((f) => f.err))
  const best = found.filter((f) => f.err <= minErr * 4 + 1e-12).sort((x, y) => x.cx - y.cx)[0]
  const body = sign && /[+-]/.test(best.s) ? `(${best.s})` : best.s
  return best.s === '0' ? '0' : `${sign}${body}`
}

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a
}

export function fmtDec(v: number, d = 3): string {
  if (!Number.isFinite(v)) return '?'
  const r = Math.round(v * 10 ** d) / 10 ** d
  return Object.is(r, -0) ? '0' : String(r)
}

/** TeX de un número: exacto si se reconoce, si no decimal con ≈. */
/** TeX de una constante exacta ("-pi/2" → −π/2, no (−π)/2). */
export function constTex(e: string): string {
  return e.startsWith('-') ? `-${prettyTex(parse(e.slice(1)))}` : prettyTex(parse(e))
}

export function numberTex(v: number, tol = 1e-6): { tex: string; exact: boolean } {
  const e = exactConstant(v, tol)
  if (e !== null) return { tex: constTex(e), exact: true }
  return { tex: `{\\approx}${fmtDec(v)}`, exact: false }
}

type Op = { isOperatorNode?: boolean; isConstantNode?: boolean; isParenthesisNode?: boolean; isFunctionNode?: boolean; fn?: unknown; op?: string; args?: MathNode[]; value?: number; content?: MathNode }

/** Reemplaza decimales sueltos por fracciones/raíces exactas antes de imprimir (0.5·y → y/2). */
function exactify(n: MathNode): MathNode {
  return n.transform((c) => {
    const cc = c as unknown as Op
    if (cc.isOperatorNode && cc.op === '*' && cc.args?.length === 2) {
      const k = cc.args[0] as unknown as Op
      if (k.isConstantNode && typeof k.value === 'number' && !Number.isInteger(k.value)) {
        const e = exactConstant(k.value, 1e-9)
        const m = e?.match(/^(-?)(\d+)\/(\d+)$/)
        if (m) {
          const rest = exactify(cc.args[1]).toString()
          return parse(`${m[1]}${m[2] === '1' ? `(${rest})` : `${m[2]} * (${rest})`} / ${m[3]}`)
        }
      }
    }
    if (cc.isConstantNode && typeof cc.value === 'number' && !Number.isInteger(cc.value)) {
      const e = exactConstant(cc.value, 1e-9)
      if (e) return parse(`(${e})`)
    }
    return c
  })
}

const unwrap = (n: MathNode): MathNode => {
  let c = n as unknown as Op
  while (c.isParenthesisNode && c.content) c = c.content as unknown as Op
  return c as unknown as MathNode
}
const sqrtArg = (n: MathNode): MathNode | null => {
  const c = unwrap(n) as unknown as Op & { fn?: { name?: string } }
  return c.isFunctionNode && c.fn?.name === 'sqrt' && c.args?.length === 1 ? c.args[0] : null
}

/** P − √Q = 0 → P² − Q = 0 (las raíces espurias se descartan al verificar). */
function squareOut(F: MathNode): MathNode | null {
  const only = sqrtArg(F)
  if (only) return only
  const c = unwrap(F) as unknown as Op
  if (c.isOperatorNode && c.op === '-' && c.args?.length === 1) return squareOut(c.args[0])
  if (!(c.isOperatorNode && c.op === '-' && c.args?.length === 2)) return null
  const [P, Q] = c.args
  const sp = sqrtArg(P), sq = sqrtArg(Q)
  if (sp && sq) return parse(`(${sp.toString()}) - (${sq.toString()})`)
  if (sq) return parse(`(${P.toString()})^2 - (${sq.toString()})`)
  if (sp) return parse(`(${sp.toString()}) - (${Q.toString()})^2`)
  return null
}

/** Ordena sumas para que empiecen con un término positivo: −x²/2 + 2 → 2 − x²/2. */
function reorder(n: MathNode): MathNode {
  const m = (n as unknown as { map: (cb: (c: MathNode) => MathNode) => MathNode }).map((c) => reorder(c))
  const c = m as unknown as Op
  if (!(c.isOperatorNode && (c.op === '+' || c.op === '-') && c.args?.length === 2)) return m
  const terms: { neg: boolean; s: string }[] = []
  const flat = (k: MathNode, neg: boolean) => {
    const kk = k as unknown as Op
    if (kk.isOperatorNode && (kk.op === '+' || kk.op === '-') && kk.args?.length === 2) {
      flat(kk.args[0], neg)
      flat(kk.args[1], kk.op === '-' ? !neg : neg)
      return
    }
    const s = k.toString()
    if (s.startsWith('-')) terms.push({ neg: !neg, s: s.slice(1) })
    else terms.push({ neg, s })
  }
  flat(m, false)
  if (!terms[0].neg || terms.every((t) => t.neg)) return m
  const sorted = [...terms.filter((t) => !t.neg), ...terms.filter((t) => t.neg)]
  const topAddSub = (s: string) => {
    let d = 0
    for (let i = 1; i < s.length; i++) {
      const ch = s[i]
      if (ch === '(') d++
      else if (ch === ')') d--
      else if (d === 0 && (ch === '+' || ch === '-') && s[i - 1] === ' ') return true
    }
    return false
  }
  const wrap = (t: { neg: boolean; s: string }) => (t.neg && topAddSub(t.s) ? `(${t.s})` : t.s)
  const str = sorted.map((t, i) => (i === 0 ? t.s : `${t.neg ? '-' : '+'} ${wrap(t)}`)).join(' ')
  try {
    return parse(str)
  } catch {
    return m
  }
}

export function prettyTex(n: MathNode): string {
  let r = n
  try {
    r = reorder(exactify(n))
  } catch {
    r = exactify(n)
  }
  const tex = r.toTex({ parenthesis: 'auto', implicit: 'hide' })
  return tex
    .replace(/\\cdot/g, '\\,')
    .replace(/\\mathrm\{([a-z]+)\}/g, '\\$1')
    .replace(/\\left\(/g, '(')
    .replace(/\\right\)/g, ')')
    .replace(/\{\s+/g, '{')
    .replace(/\s+\}/g, '}')
}

// --- Despeje ------------------------------------------------------------------

function sampleScopes(vars: string[], k = 5): Scope[] {
  const out: Scope[] = []
  let seed = 12345
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  for (let i = 0; i < k; i++) {
    const s: Scope = {}
    for (const v of vars) s[v] = 0.3 + rnd() * 1.4
    out.push(s)
  }
  return out
}

/** Si el nodo es numéricamente constante en las variables libres, lo reemplaza por la constante exacta. */
function constantFold(n: MathNode, vars: string[]): MathNode {
  const f = compileNode(n)
  const vals = sampleScopes(vars).map(f)
  if (vals.some((v) => !Number.isFinite(v))) return n
  if (vals.every((v) => Math.abs(v - vals[0]) < 1e-9 * Math.max(1, Math.abs(vals[0])))) {
    const e = exactConstant(vals[0], 1e-9)
    if (e !== null) return parse(e)
  }
  return n
}

function isZero(n: MathNode, vars: string[]): boolean {
  const f = compileNode(n)
  return sampleScopes(vars, 6).every((s) => Math.abs(f(s)) < 1e-10)
}

/**
 * Soluciones de F = 0 para la variable v, si F es polinomio de grado ≤ 2 en v.
 * Los coeficientes pueden depender de las otras variables.
 */
export function solveFor(F: MathNode, v: string): MathNode[] {
  const direct = solvePoly(F, v)
  if (direct.length) return direct
  const sq = squareOut(F)
  return sq ? solvePoly(safeSimplify(sq), v) : []
}

/** Grado numérico de F en v (0, 1, 2) o 3 si es mayor / no polinómico. Evita derivar árboles grandes a ciegas. */
function numericDegree(F: MathNode, v: string, vars: string[]): number {
  const f = compileNode(F)
  const ts = [0.35, 0.8, 1.25, 1.7, 2.15]
  let deg = 0
  for (const s of sampleScopes(vars, 3)) {
    const ys = ts.map((t) => f({ ...s, [v]: t }))
    if (ys.some((y) => !Number.isFinite(y))) return 3
    const scale = Math.max(1, ...ys.map(Math.abs))
    let d = ys
    for (let k = 1; k <= 4; k++) {
      d = d.slice(1).map((y, i) => y - d[i])
      if (d.some((y) => Math.abs(y) > 1e-9 * scale)) deg = Math.max(deg, k)
    }
  }
  return Math.min(deg, 3)
}

function solvePoly(F: MathNode, v: string): MathNode[] {
  if (!hasSymbol(F, v)) return []
  const vars = freeVars(F)
  const deg = numericDegree(F, v, vars)
  if (deg === 0) return []
  if (deg === 3) return solveMonomial(F, v, vars)
  let d1: MathNode, d2: MathNode, d3: MathNode
  try {
    d1 = derivative(F, v)
    d2 = derivative(d1, v)
    d3 = derivative(d2, v)
  } catch {
    return []
  }
  if (!isZero(d3, vars)) return solveMonomial(F, v, vars)
  const at0 = (n: MathNode) => constantFold(safeSimplify(substitute(n, { [v]: '0' })), vars.filter((w) => w !== v))
  const others = vars.filter((w) => w !== v)
  const a2 = constantFold(safeSimplify(parse(`(${d2.toString()}) / 2`)), vars)
  const a1 = at0(d1)
  const a0 = at0(F)
  const S = (n: MathNode) => `(${n.toString()})`
  const out: string[] = []
  if (isZero(a2, vars)) {
    if (isZero(a1, others)) return []
    out.push(`-${S(a0)} / ${S(a1)}`)
  } else if (isZero(a1, others)) {
    out.push(`-sqrt(-${S(a0)} / ${S(a2)})`, `sqrt(-${S(a0)} / ${S(a2)})`)
  } else if (isZero(a0, others)) {
    out.push('0', `-${S(a1)} / ${S(a2)}`)
  } else {
    const disc = `${S(a1)}^2 - 4 * ${S(a2)} * ${S(a0)}`
    out.push(`(-${S(a1)} - sqrt(${disc})) / (2 * ${S(a2)})`, `(-${S(a1)} + sqrt(${disc})) / (2 * ${S(a2)})`)
  }
  return out.map((s) => {
    const n = safeSimplify(parse(s))
    return constantFold(n, others)
  })
}

/** F = c·vⁿ + a₀ (un solo término en v, n ≤ 6) → v = ⁿ√(−a₀/c). */
function solveMonomial(F: MathNode, v: string, vars: string[]): MathNode[] {
  const others = vars.filter((w) => w !== v)
  const a0n = constantFold(safeSimplify(substitute(F, { [v]: '0' })), others)
  const fF = compileNode(F)
  const fa0 = compileNode(a0n)
  for (let n = 3; n <= 6; n++) {
    const ratio = (s: Scope) => (fF(s) - fa0(s)) / s[v] ** n
    const ss = sampleScopes(vars, 6)
    const r0 = ss.map(ratio)
    // c debe depender solo de las otras variables: se compara variando v
    const ok = ss.every((s, i) => {
      const s2 = { ...s, [v]: s[v] * 1.7 }
      return Number.isFinite(r0[i]) && Math.abs(ratio(s2) - r0[i]) < 1e-8 * Math.max(1, Math.abs(r0[i]))
    })
    if (!ok) continue
    const c = constantFold(safeSimplify(parse(`(${F.toString()} - (${a0n.toString()})) / ${v}^${n}`)), others)
    const arg = `-(${a0n.toString()}) / (${c.toString()})`
    if (n === 3) return [safeSimplify(parse(`cbrt(${arg})`))]
    const root = `(${arg})^(1/${n})`
    return n % 2 ? [safeSimplify(parse(root))] : [safeSimplify(parse(`-${root}`)), safeSimplify(parse(root))]
  }
  return []
}

/** Prueba formas racionalizadas (dentro de raíces también) y se queda con la más corta. */
function nicer(n: MathNode): MathNode {
  const tryRat = (m: MathNode): MathNode => {
    if (m.toString().length > 160) return m
    try {
      const r = rationalize(m) as MathNode
      return r.toString().length < m.toString().length ? r : m
    } catch {
      return m
    }
  }
  const inner = n.transform((c) => {
    const a = sqrtArg(c)
    return a ? parse(`sqrt(${tryRat(a).toString()})`) : c
  })
  return tryRat(inner)
}

const NONNEG = new Set(['r', 'rho'])

/** √(r²) → r y |r| → r para variables que por definición son ≥ 0. */
function dropNonnegAbs(n: MathNode): MathNode {
  return n.transform((c) => {
    const a = sqrtArg(c)
    if (a) {
      const s = a.toString().replace(/\s/g, '')
      const m = s.match(/^\(?([a-z]+)\)?\^2$/)
      if (m && NONNEG.has(m[1])) return parse(m[1])
    }
    const cc = c as unknown as Op & { fn?: { name?: string } }
    if (cc.isFunctionNode && cc.fn?.name === 'abs' && cc.args?.length === 1) {
      const s = cc.args[0].toString().replace(/[\s()]/g, '')
      if (NONNEG.has(s)) return parse(s)
    }
    return c
  })
}

export function toCandidate(n: MathNode): Candidate {
  const m = dropNonnegAbs(nicer(n))
  return { node: m, tex: prettyTex(m), f: compileNode(m) }
}

/** Candidatos para la variable v a partir de las fronteras (opcionalmente con cambio de variables). */
export function candidatesFor(raws: string[], v: string, subs?: Record<string, string>): Candidate[] {
  const out: Candidate[] = []
  const seen = new Set<string>()
  for (const raw of raws) {
    let F = boundaryNode(raw)
    if (!F) continue
    if (subs) F = substitute(F, subs)
    for (const sol of solveFor(F, v)) {
      const c = toCandidate(sol)
      if (!seen.has(c.tex)) {
        seen.add(c.tex)
        out.push(c)
      }
    }
  }
  return out
}

/**
 * Curvas de la "sombra": fronteras que no dependen de la variable perforada
 * más las intersecciones entre pares de superficies (k_i = k_j), despejadas
 * para la variable media.
 */
export function shadowCandidates(raws: string[], pierce: string, mid: string, subs?: Record<string, string>): Candidate[] {
  const out: Candidate[] = []
  const seen = new Set<string>()
  const push = (n: MathNode) => {
    const c = toCandidate(n)
    if (!seen.has(c.tex)) {
      seen.add(c.tex)
      out.push(c)
    }
  }
  const surf: MathNode[] = []
  const surfF: MathNode[] = []
  for (const raw of raws) {
    let F = boundaryNode(raw)
    if (!F) continue
    if (subs) F = substitute(F, subs)
    if (!hasSymbol(F, pierce)) {
      for (const s of solveFor(F, mid)) push(s)
    } else {
      surf.push(...solveFor(F, pierce))
      surfF.push(F)
    }
  }
  // "Ecuador" de cada superficie cuadrática en la perforada: la sombra termina
  // donde el discriminante se anula (una sola esfera proyecta su círculo).
  for (const F of surfF) {
    try {
      const vars = freeVars(F)
      if (numericDegree(F, pierce, vars) !== 2) continue
      const others = vars.filter((w) => w !== pierce)
      const d1 = derivative(F, pierce)
      const d2 = derivative(d1, pierce)
      const a2 = constantFold(safeSimplify(parse(`(${d2.toString()}) / 2`)), vars)
      if (isZero(a2, vars)) continue
      const a1 = constantFold(safeSimplify(substitute(d1, { [pierce]: '0' })), others)
      const a0 = constantFold(safeSimplify(substitute(F, { [pierce]: '0' })), others)
      const disc = safeSimplify(parse(`(${a1.toString()})^2 - 4 * (${a2.toString()}) * (${a0.toString()})`))
      for (const s of solveFor(disc, mid)) push(s)
    } catch {
      /* superficie rara: quedan los otros candidatos */
    }
  }
  for (let i = 0; i < surf.length; i++) {
    for (let j = i + 1; j < surf.length; j++) {
      const eq = parse(`(${surf[i].toString()}) - (${surf[j].toString()})`)
      for (const s of solveFor(safeSimplify(eq), mid)) push(s)
    }
  }
  return out
}

/**
 * Elige la descripción de g que coincide con todas las muestras:
 * constante exacta, o candidato simbólico verificado. null si nada coincide.
 */
export function describe(
  samples: { s: Scope; value: number }[],
  cands: Candidate[],
  tol: number,
): { tex: string; exact: boolean; f: (s: Scope) => number } | null {
  if (!samples.length) return null
  const v0 = samples[0].value
  if (samples.every((p) => Math.abs(p.value - v0) < tol)) {
    const e = exactConstant(v0, Math.max(tol, 1e-6))
    if (e !== null) {
      const c = compileNode(parse(e))({})
      return { tex: constTex(e), exact: true, f: () => c }
    }
  }
  const ok = cands
    .filter((c) => samples.every((p) => Math.abs(c.f(p.s) - p.value) < tol))
    .sort((a, b) => a.tex.length - b.tex.length)
  if (ok.length) return { tex: ok[0].tex, exact: true, f: ok[0].f }
  if (samples.every((p) => Math.abs(p.value - v0) < tol)) return { tex: `{\\approx}${fmtDec(v0)}`, exact: false, f: () => v0 }
  return null
}
