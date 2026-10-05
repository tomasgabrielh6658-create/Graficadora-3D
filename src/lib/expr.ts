export type FieldFn = (x: number, y: number, z: number) => number

export const PALETTE = [
  '#f97316',
  '#38bdf8',
  '#a78bfa',
  '#34d399',
  '#f472b6',
  '#facc15',
  '#fb7185',
  '#4ade80',
]

const CONSTS: Record<string, number> = {
  pi: Math.PI,
  PI: Math.PI,
  e: Math.E,
  E: Math.E,
  tau: Math.PI * 2,
}

const FUNCS = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'sqrt', 'cbrt', 'abs', 'exp', 'log', 'log2', 'log10',
  'floor', 'ceil', 'round', 'min', 'max', 'pow', 'sign', 'hypot',
])

const FUNC_RENAME: Record<string, string> = { ln: 'log' }

/* ------------------------------------------------------------------ *
 *  Mini-parser de expresiones (reemplaza a mathjs en el hilo principal).
 *  Gramática compatible con mathjs para lo que usa la app:
 *    2x · x y · x(y+1) · (a)(b) · 2pi · x^-2 · -x^2 · 2^3^2 · sin x
 * ------------------------------------------------------------------ */

type Ast =
  | { t: 'num'; v: number }
  | { t: 'sym'; name: string }
  | { t: 'un'; op: '+' | '-'; a: Ast }
  | { t: 'bin'; op: '+' | '-' | '*' | '/' | '^' | '%'; a: Ast; b: Ast }
  | { t: 'call'; name: string; args: Ast[] }

type Tok =
  | { t: 'num'; v: number }
  | { t: 'id'; name: string }
  | { t: 'op'; op: string }

const isDigit = (c: string) => c >= '0' && c <= '9'
const isAlpha = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_'
const isAlnum = (c: string) => isAlpha(c) || isDigit(c)

function tokenize(src: string): Tok[] {
  const toks: Tok[] = []
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue }
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] ?? ''))) {
      let j = i
      while (j < n && (isDigit(src[j]) || src[j] === '.')) j++
      if ((src[j] === 'e' || src[j] === 'E') && (isDigit(src[j + 1] ?? '') || ((src[j + 1] === '+' || src[j + 1] === '-') && isDigit(src[j + 2] ?? '')))) {
        j++
        if (src[j] === '+' || src[j] === '-') j++
        while (j < n && isDigit(src[j])) j++
      }
      const v = Number(src.slice(i, j))
      if (!Number.isFinite(v)) throw new Error(`Número inválido: "${src.slice(i, j)}"`)
      toks.push({ t: 'num', v })
      i = j
      continue
    }
    if (isAlpha(c)) {
      let j = i
      while (j < n && isAlnum(src[j])) j++
      const name = src.slice(i, j)
      toks.push(name === 'mod' ? { t: 'op', op: '%' } : { t: 'id', name })
      i = j
      continue
    }
    if ('+-*/^%(),'.includes(c)) {
      toks.push({ t: 'op', op: c })
      i++
      continue
    }
    throw new Error(`Carácter no soportado: "${c}"`)
  }
  return toks
}

/** ¿El token puede empezar una expresión? (para la multiplicación implícita) */
const startsExpr = (t: Tok | undefined) =>
  !!t && (t.t === 'num' || t.t === 'id' || (t.t === 'op' && t.op === '('))

function parseExpr(src: string, vars: Set<string>): Ast {
  const toks = tokenize(src)
  let pos = 0
  const peek = () => toks[pos]
  const next = () => toks[pos++]

  function parseAdd(): Ast {
    let a = parseMul()
    for (;;) {
      const t = peek()
      if (t?.t === 'op' && (t.op === '+' || t.op === '-')) {
        next()
        a = { t: 'bin', op: t.op as '+' | '-', a, b: parseMul() }
      } else return a
    }
  }

  function parseMul(): Ast {
    let a = parseUnary()
    for (;;) {
      const t = peek()
      if (t?.t === 'op' && (t.op === '*' || t.op === '/' || t.op === '%')) {
        next()
        a = { t: 'bin', op: t.op as '*' | '/' | '%', a, b: parseUnary() }
      } else if (startsExpr(t)) {
        // multiplicación implícita: 2x · x y · (a)(b) · )x
        a = { t: 'bin', op: '*', a, b: parseUnary() }
      } else return a
    }
  }

  function parseUnary(): Ast {
    const t = peek()
    if (t?.t === 'op' && (t.op === '-' || t.op === '+')) {
      next()
      return { t: 'un', op: t.op as '+' | '-', a: parseUnary() }
    }
    return parsePow()
  }

  function parsePow(): Ast {
    const base = parseAtom()
    const t = peek()
    if (t?.t === 'op' && t.op === '^') {
      next()
      return { t: 'bin', op: '^', a: base, b: parseUnary() } // asocia a la derecha, admite x^-2
    }
    return base
  }

  function parseAtom(): Ast {
    const t = next()
    if (!t) throw new Error('Expresión incompleta')
    if (t.t === 'num') return { t: 'num', v: t.v }
    if (t.t === 'id') {
      const name = FUNC_RENAME[t.name] ?? t.name
      const p = peek()
      if (FUNCS.has(name)) {
        if (p?.t === 'op' && p.op === '(') {
          next()
          const args: Ast[] = [parseAdd()]
          let sep = peek()
          while (sep?.t === 'op' && sep.op === ',') {
            next()
            args.push(parseAdd())
            sep = peek()
          }
          expect(')')
          return { t: 'call', name, args }
        }
        // sin x · log 2 (forma sin paréntesis, como mathjs)
        if (startsExpr(p)) return { t: 'call', name, args: [parseUnary()] }
        throw new Error(`La función "${t.name}" necesita argumentos`)
      }
      if (vars.has(t.name)) return { t: 'sym', name: t.name }
      if (t.name in CONSTS) return { t: 'num', v: CONSTS[t.name] }
      if (p?.t === 'op' && p.op === '(') throw new Error(`Función no soportada: "${t.name}"`)
      throw new Error(`Variable no permitida: "${t.name}"`)
    }
    if (t.t === 'op' && t.op === '(') {
      const e = parseAdd()
      expect(')')
      return e
    }
    throw new Error(`No esperaba "${t.t === 'op' ? t.op : ''}" acá`)
  }

  function expect(op: string) {
    const t = next()
    if (!t || t.t !== 'op' || t.op !== op) throw new Error(`Falta "${op}"`)
  }

  const ast = parseAdd()
  if (pos < toks.length) {
    const t = toks[pos]
    throw new Error(`Sobra "${t.t === 'op' ? t.op : t.t === 'id' ? t.name : t.v}"`)
  }
  return ast
}

/* ------------------------- AST → JS rápido ------------------------- */

function astToJs(n: Ast): string {
  switch (n.t) {
    case 'num': return `(${n.v})`
    case 'sym': return n.name
    case 'un': return n.op === '-' ? `(-(${astToJs(n.a)}))` : `(+(${astToJs(n.a)}))`
    case 'call': return `Math.${n.name}(${n.args.map(astToJs).join(',')})`
    case 'bin':
      switch (n.op) {
        case '^': return `Math.pow(${astToJs(n.a)},${astToJs(n.b)})`
        case '%': return `(${astToJs(n.a)}%${astToJs(n.b)})`
        default: return `(${astToJs(n.a)}${n.op}${astToJs(n.b)})`
      }
  }
}

/* --------------------------- AST → TeX ----------------------------- */

// precedencia para saber cuándo poner paréntesis
const PREC: Record<Ast['t'], number> = { num: 9, sym: 9, call: 9, un: 7, bin: 0 }
const BIN_PREC = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 4 } as const
const prec = (n: Ast) => (n.t === 'bin' ? BIN_PREC[n.op] : PREC[n.t])

const numTex = (v: number) => {
  if (Number.isInteger(v)) return String(v)
  const s = v.toPrecision(10).replace(/\.?0+$/, '')
  return s
}

const TEX_FN: Record<string, string> = {
  sin: '\\sin', cos: '\\cos', tan: '\\tan',
  asin: '\\arcsin', acos: '\\arccos', atan: '\\arctan',
  sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh',
  log: '\\log', exp: '\\exp', min: '\\min', max: '\\max',
  floor: '\\lfloor', ceil: '\\lceil', round: '\\mathrm{round}',
  asinh: '\\mathrm{asinh}', acosh: '\\mathrm{acosh}', atanh: '\\mathrm{atanh}',
  atan2: '\\mathrm{atan2}', cbrt: '\\mathrm{cbrt}', log2: '\\log_2', log10: '\\log_{10}',
  pow: '\\mathrm{pow}', sign: '\\mathrm{sign}', hypot: '\\mathrm{hypot}',
}

function astToTex(n: Ast, parentPrec = 0, side: 'l' | 'r' | '' = ''): string {
  const p = prec(n)
  const wrap = (s: string, need: boolean) => (need ? `\\left(${s}\\right)` : s)
  switch (n.t) {
    case 'num': return numTex(n.v)
    case 'sym': return n.name
    case 'un': {
      const inner = astToTex(n.a, 7)
      return wrap(`${n.op}${inner}`, n.a.t === 'un')
    }
    case 'call': {
      if (n.name === 'sqrt' && n.args.length === 1) return `\\sqrt{${astToTex(n.args[0])}}`
      if (n.name === 'abs' && n.args.length === 1) return `\\left|${astToTex(n.args[0])}\\right|`
      if (n.name === 'pow' && n.args.length === 2) {
        return `${astToTex(n.args[0], 4, 'l')}^{${astToTex(n.args[1])}}`
      }
      if ((n.name === 'floor' || n.name === 'ceil') && n.args.length === 1) {
        const a = astToTex(n.args[0])
        return n.name === 'floor' ? `\\lfloor ${a} \\rfloor` : `\\lceil ${a} \\rceil`
      }
      const fn = TEX_FN[n.name] ?? `\\mathrm{${n.name}}`
      return `${fn}\\left(${n.args.map((a) => astToTex(a)).join(', ')}\\right)`
    }
    case 'bin': {
      const { a, b, op } = n
      if (op === '^') return wrap(`${astToTex(a, 4, 'l')}^{${astToTex(b)}}`, false)
      if (op === '/') return `\\frac{${astToTex(a)}}{${astToTex(b)}}`
      const l = astToTex(a, p, 'l')
      // a la derecha de -, /, % hace falta paréntesis si la prec. no es mayor
      const r = astToTex(b, op === '+' || op === '*' ? p : p + 1, 'r')
      if (op === '*') {
        const sep = b.t === 'num' || a.t === 'num' ? '\\,' : ' \\cdot '
        const bothSimple = (a.t === 'num' || a.t === 'sym' || a.t === 'call') && (b.t === 'num' || b.t === 'sym' || b.t === 'call')
        return wrap(`${l}${bothSimple ? sep : ' \\cdot '}${r}`, p < parentPrec)
      }
      if (op === '%') return wrap(`${l} \\bmod ${r}`, p < parentPrec)
      return wrap(`${l} ${op} ${r}`, p < parentPrec || (side === 'r' && p === parentPrec))
    }
  }
}

/* ------------------------- API pública ----------------------------- */

export function compileExpressionVars(
  src: string,
  varNames: string[],
): { fn: (...args: number[]) => number; tex: string } {
  const vars = new Set(varNames)
  const ast = parseExpr(src, vars)
  const tex = astToTex(ast)
  const js = astToJs(ast)
  const fast = new Function(...varNames, `"use strict"; return (${js});`) as (...a: number[]) => number
  const probe = fast(...varNames.map(() => 0.37))
  if (typeof probe !== 'number') throw new Error('evaluación inválida')
  return { fn: fast, tex }
}

export function compileExpression(src: string, dims: '2d' | '3d'): { fn: FieldFn; tex: string } {
  const vars = new Set(dims === '2d' ? ['x', 'y'] : ['x', 'y', 'z'])
  const ast = parseExpr(src, vars)
  const tex = astToTex(ast)
  const js = astToJs(ast)
  const fast = new Function('x', 'y', 'z', `"use strict"; return (${js});`) as FieldFn
  const probe = fast(0.37, 0.11, 0.53)
  if (typeof probe !== 'number') throw new Error('evaluación inválida')
  return { fn: fast, tex }
}

export interface ParsedConstraint {
  ok: boolean
  error?: string
  needsSide?: boolean
  sideOptions?: { value: 'le' | 'ge'; label: string }[]
  previewTex?: string
  build?: (side: 'le' | 'ge') => { field: FieldFn; boundary: FieldFn; latex: string }
}

const OP_PATTERN = ['<=', '>=', '<', '>', '=']
const OP_RE = new RegExp('^(.*?)(' + OP_PATTERN.join('|') + ')(.*)$')

export function parseConstraint(raw: string, dims: '2d' | '3d'): ParsedConstraint {
  const m = raw.trim().match(OP_RE)
  if (!m) return { ok: false, error: 'Escribí una comparación, ej: y <= x^2' }
  const [, lhsRaw, op, rhsRaw] = m
  if (!lhsRaw.trim() || !rhsRaw.trim()) return { ok: false, error: 'Falta un lado de la comparación' }
  let lhs: { fn: FieldFn; tex: string }, rhs: { fn: FieldFn; tex: string }
  try {
    lhs = compileExpression(lhsRaw, dims)
    rhs = compileExpression(rhsRaw, dims)
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
  const boundary: FieldFn = (x, y, z) => lhs.fn(x, y, z) - rhs.fn(x, y, z)
  const leTex = `${lhs.tex} \\le ${rhs.tex}`
  const geTex = `${lhs.tex} \\ge ${rhs.tex}`

  if (op === '=') {
    const lhsVar = lhsRaw.trim()
    const rhsVar = rhsRaw.trim()
    const single = (s: string) => /^[xyz]$/.test(s)
    let sideOptions: ParsedConstraint['sideOptions']
    if (single(lhsVar)) {
      sideOptions = [
        { value: 'le', label: `${lhsVar} ≤ … (acota por arriba/afuera)` },
        { value: 'ge', label: `${lhsVar} ≥ … (acota por abajo/adentro)` },
      ]
    } else if (single(rhsVar)) {
      sideOptions = [
        { value: 'ge', label: `… ≤ ${rhsVar} (acota por arriba)` },
        { value: 'le', label: `… ≥ ${rhsVar} (acota por abajo)` },
      ]
    } else {
      sideOptions = [
        { value: 'le', label: `${lhs.tex} − ${rhs.tex} ≤ 0 (zona interna)` },
        { value: 'ge', label: `${lhs.tex} − ${rhs.tex} ≥ 0 (zona externa)` },
      ]
    }
    return {
      ok: true,
      needsSide: true,
      sideOptions,
      previewTex: `${lhs.tex} = ${rhs.tex}`,
      build: (side) => ({
        field: side === 'le' ? boundary : (x, y, z) => -boundary(x, y, z),
        boundary,
        latex: side === 'le' ? leTex : geTex,
      }),
    }
  }

  const isLe = op === '<=' || op === '<'
  const kind: 'le' | 'ge' = isLe ? 'le' : 'ge'
  return {
    ok: true,
    needsSide: false,
    build: () => ({
      field: isLe ? boundary : (x, y, z) => -boundary(x, y, z),
      boundary,
      latex: isLe ? leTex : geTex,
    }),
  }
}
