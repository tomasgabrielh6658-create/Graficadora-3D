import { parse } from 'mathjs'
import type { MathNode } from 'mathjs'

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

function nodeToJs(node: MathNode, vars: Set<string>): string {
  const n = node as unknown as {
    type: string
    op?: string
    fn?: string | MathNode
    args?: MathNode[]
    name?: string
    value?: number
    content?: MathNode
  }
  switch (n.type) {
    case 'ConstantNode':
      return `(${Number(n.value)})`
    case 'SymbolNode': {
      const name = n.name!
      if (vars.has(name)) return name
      if (name in CONSTS) return `(${CONSTS[name]})`
      throw new Error(`Variable o símbolo no soportado: "${name}"`)
    }
    case 'ParenthesisNode':
      return `(${nodeToJs(n.content as MathNode, vars)})`
    case 'OperatorNode': {
      const args = (n.args ?? []).map((a) => nodeToJs(a, vars))
      const fn = (n as { fn?: string }).fn ?? ''
      switch (fn) {
        case 'add': return `(${args[0]}+${args[1]})`
        case 'subtract': return `(${args[0]}-${args[1]})`
        case 'multiply': return `(${args[0]}*${args[1]})`
        case 'divide': return `(${args[0]}/${args[1]})`
        case 'pow': return `Math.pow(${args[0]},${args[1]})`
        case 'unaryMinus': return `(-(${args[0]}))`
        case 'unaryPlus': return `(+(${args[0]}))`
        case 'mod': return `(${args[0]}%${args[1]})`
        case 'abs': return `Math.abs(${args[0]})`
        default: throw new Error(`Operador no soportado: ${fn || n.op}`)
      }
    }
    case 'FunctionNode': {
      const fnNode = n.fn as unknown as { name?: string }
      const name = FUNC_RENAME[fnNode.name ?? ''] ?? fnNode.name ?? ''
      if (!FUNCS.has(name)) throw new Error(`Función no soportada: "${fnNode.name}"`)
      const args = (n.args ?? []).map((a) => nodeToJs(a, vars))
      return `Math.${name}(${args.join(',')})`
    }
    default:
      throw new Error(`Expresión no soportada (${n.type})`)
  }
}

function coerce(v: unknown): number {
  if (typeof v === 'number') return v
  if (v && typeof v === 'object') {
    const o = v as { re?: number; im?: number }
    if (typeof o.re === 'number') return Math.abs(o.im ?? 0) < 1e-9 ? o.re : NaN
  }
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}

export function compileExpressionVars(
  src: string,
  varNames: string[],
): { fn: (...args: number[]) => number; tex: string } {
  const vars = new Set(varNames)
  const node = parse(src)
  node.traverse((n, _p, parent) => {
    const nn = n as unknown as { isSymbolNode?: boolean; name?: string }
    const pp = parent as unknown as { isFunctionNode?: boolean; fn?: unknown } | null
    if (nn.isSymbolNode) {
      const isFnName = pp?.isFunctionNode && pp.fn === n
      if (!isFnName && !vars.has(nn.name!) && !(nn.name! in CONSTS)) {
        throw new Error(`Variable no permitida: "${nn.name}"`)
      }
    }
  })
  const tex = node.toTex()
  try {
    const js = nodeToJs(node, vars)
    const fast = new Function(...varNames, `"use strict"; return (${js});`) as (...a: number[]) => number
    const probe = fast(...varNames.map(() => 0.37))
    if (typeof probe !== 'number') throw new Error('evaluación inválida')
    return { fn: fast, tex }
  } catch {
    const compiled = node.compile()
    const scope: Record<string, number> = {}
    const fn = (...args: number[]) => {
      varNames.forEach((n, i) => (scope[n] = args[i]))
      try {
        return coerce(compiled.evaluate(scope))
      } catch {
        return NaN
      }
    }
    fn(...varNames.map(() => 0.3))
    return { fn, tex }
  }
}

export function compileExpression(src: string, dims: '2d' | '3d'): { fn: FieldFn; tex: string } {
  const vars = new Set(dims === '2d' ? ['x', 'y'] : ['x', 'y', 'z'])
  const node = parse(src)
  node.traverse((n, _p, parent) => {
    const nn = n as unknown as { isSymbolNode?: boolean; name?: string }
    const pp = parent as unknown as { isFunctionNode?: boolean; fn?: unknown } | null
    if (nn.isSymbolNode) {
      const isFnName = pp?.isFunctionNode && pp.fn === n
      if (!isFnName && !vars.has(nn.name!) && !(nn.name! in CONSTS)) {
        throw new Error(`Variable no permitida en este módulo: "${nn.name}"`)
      }
    }
  })
  const tex = node.toTex()
  try {
    const js = nodeToJs(node, vars)
    const fast = new Function('x', 'y', 'z', `"use strict"; return (${js});`) as FieldFn
    const probe = fast(0.37, 0.11, 0.53)
    if (typeof probe !== 'number') throw new Error('evaluación inválida')
    return { fn: fast, tex }
  } catch {
    const compiled = node.compile()
    const scope = { x: 0, y: 0, z: 0 }
    const fn: FieldFn = (x, y, z) => {
      scope.x = x
      scope.y = y
      scope.z = z
      try {
        return coerce(compiled.evaluate(scope))
      } catch {
        return NaN
      }
    }
    fn(0.3, 0.2, 0.1)
    return { fn, tex }
  }
}

export interface ParsedConstraint {
  ok: boolean
  error?: string
  needsSide?: boolean
  sideOptions?: { value: 'le' | 'ge'; label: string }[]
  previewTex?: string
  build?: (side: 'le' | 'ge') => { field: FieldFn; boundary: FieldFn; latex: string }
}

const OP_RE = /^(.*?)(<=|>=|<|>|=)(.*)$/

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
