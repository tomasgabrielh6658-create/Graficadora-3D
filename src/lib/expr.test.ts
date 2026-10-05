import { describe, expect, it } from 'vitest'
import { compileExpression, compileExpressionVars, parseConstraint } from './expr'
import { PRESETS } from './presets'

describe('parser propio de expresiones', () => {
  it('compila todas las restricciones de los presets', () => {
    for (const p of PRESETS) {
      const dims = p.module === 1 || p.module === 2 ? ('2d' as const) : ('3d' as const)
      for (const c of p.constraints) {
        const r = parseConstraint(c.raw, dims)
        expect(r.ok, `${p.id}: "${c.raw}" → ${r.error}`).toBe(true)
      }
    }
  })

  it('evalúa igual que mathjs en casos variados', async () => {
    const { parse } = await import('mathjs/number')
    const cases = [
      'x^2+y^2', 'sqrt(x^2+2*y)', '2*sin(x)-cos(y)', 'x*y+z', '-x^2',
      'x^-2', '(x+1)(x-1)', 'abs(x-y)+floor(z)', 'min(x,y)+max(y,z)',
      'atan2(y,x)+pow(x,2)', 'exp(x)/2', 'x^3^2',
    ]
    for (const s of cases) {
      const mine = compileExpression(s, '3d').fn(0.7, 1.3, -0.5)
      const theirs = parse(s).compile().evaluate({ x: 0.7, y: 1.3, z: -0.5 })
      expect(mine, s).toBeCloseTo(theirs as number, 10)
    }
  })

  it('multiplicación implícita', () => {
    expect(compileExpression('2x', '2d').fn(3, 0, 0)).toBe(6)
    expect(compileExpression('x y', '2d').fn(3, 4, 0)).toBe(12)
    expect(compileExpression('x(y+1)', '2d').fn(3, 4, 0)).toBe(15)
    expect(compileExpression('2pi', '2d').fn(0, 0, 0)).toBeCloseTo(2 * Math.PI)
  })

  it('precedencia como mathjs: -x^2 y x^-2', () => {
    expect(compileExpression('-x^2', '2d').fn(2, 0, 0)).toBe(-4)
    expect(compileExpression('x^-2', '2d').fn(2, 0, 0)).toBeCloseTo(0.25)
    expect(compileExpression('2^3^2', '2d').fn(0, 0, 0)).toBe(512)
  })

  it('produce LaTeX razonable', () => {
    expect(compileExpression('x^2 + y^2', '2d').tex).toBe('x^{2} + y^{2}')
    expect(compileExpression('sqrt(x^2+y^2)', '2d').tex).toBe('\\sqrt{x^{2} + y^{2}}')
    expect(compileExpressionVars('u^2 - v^2', ['u', 'v']).tex).toBe('u^{2} - v^{2}')
  })

  it('errores claros', () => {
    expect(parseConstraint('z <= 1', '2d').ok).toBe(false)
    expect(parseConstraint('x <=', '2d').ok).toBe(false)
    expect(parseConstraint('x ! 4', '2d').ok).toBe(false)
    expect(parseConstraint('foo(x) <= 2', '2d').ok).toBe(false)
  })
})
