import { describe, expect, it } from 'vitest'
import { compileExpression, parseConstraint } from './expr'
import { compileConstraints } from './useConstraints'
import { intervalsLe0 } from './roots'
import { buildRegion } from './field'
import { marchingSquares } from './marchingSquares'
import { marchingTets } from './marchingTets'

const make = (raw: string, side: 'le' | 'ge' = 'le') => {
  const p = parseConstraint(raw, '3d')
  if (!p.ok || !p.build) throw new Error(p.error)
  const b = p.build(side)
  return { field: b.field, boundary: b.boundary }
}

describe('parseConstraint', () => {
  it('acepta desigualdades y genera campo con signo correcto', () => {
    const c = make('x^2 + y^2 <= 4')
    expect(c.field(0, 0, 0)).toBeLessThan(0)
    expect(c.field(3, 0, 0)).toBeGreaterThan(0)
  })
  it('invierte el signo con >=', () => {
    const c = make('y >= x^2')
    expect(c.field(0, 1, 0)).toBeLessThan(0)
    expect(c.field(0, -1, 0)).toBeGreaterThan(0)
  })
  it('las igualdades piden lado', () => {
    const p = parseConstraint('z = x^2 + y^2', '3d')
    expect(p.ok).toBe(true)
    expect(p.needsSide).toBe(true)
    const b = p.build!('ge')
    expect(b.field(0, 0, 1)).toBeLessThan(0) // z=1 está encima del paraboloide
  })
  it('rechaza variables fuera de dimensión', () => {
    expect(parseConstraint('z <= 1', '2d').ok).toBe(false)
  })
  it('compila a función JS rápida', () => {
    const { fn } = compileExpression('sqrt(x^2+y^2) + 2*sin(x)', '2d')
    expect(fn(0, 0, 0)).toBeCloseTo(0)
    expect(fn(1, 0, 0)).toBeCloseTo(1 + 2 * Math.sin(1))
  })
})

describe('notación del TP (polares, unicode, igualdades)', () => {
  it('r = radio polar en 2D', () => {
    const { fn } = compileExpression('r', '2d')
    expect(fn(3, 4, 0)).toBeCloseTo(5)
  })
  it('theta = atan2(y,x)', () => {
    const { fn } = compileExpression('theta', '2d')
    expect(fn(0, 1, 0)).toBeCloseTo(Math.PI / 2)
    expect(fn(-1, 0, 0)).toBeCloseTo(Math.PI)
  })
  it('rho/phi esféricas en 3D', () => {
    expect(compileExpression('rho', '3d').fn(0, 0, 2)).toBeCloseTo(2)
    expect(compileExpression('phi', '3d').fn(0, 0, 2)).toBeCloseTo(0)
  })
  it('r = 2 parsea y arma el círculo', () => {
    const p = parseConstraint('r = 2', '2d')
    expect(p.ok).toBe(true)
    expect(p.needsSide).toBe(true)
    const b = p.build!('le')
    expect(b.field(0, 0, 0)).toBeLessThan(0)
    expect(b.field(3, 0, 0)).toBeGreaterThan(0)
  })
  it('acepta caracteres unicode: ≤ ≥ θ π √ − × ÷', () => {
    const p = parseConstraint('θ ≤ π/4', '2d')
    expect(p.ok).toBe(true)
    expect(p.build!('le').field(1, 0.2, 0)).toBeLessThan(0)
    expect(p.build!('le').field(-1, 0, 0)).toBeGreaterThan(0)
    const q = parseConstraint('√(x^2+y^2) − 2×x ≤ 0', '2d')
    expect(q.ok).toBe(true)
  })
})

describe('igualdad con lado auto', () => {
  const raws = (list: [string, 'le' | 'ge' | 'auto'][]) =>
    list.map(([raw, side], i) => ({ raw, side, color: '#000', visible: true }))

  it('x^2+y^2=4 auto → queda el disco (le)', () => {
    const { cons } = compileConstraints(
      raws([['x^2 + y^2 = 4', 'auto']]),
      '2d',
    )
    const region = buildRegion(cons)
    expect(region.inside(0, 0, 0)).toBe(true)
    expect(region.inside(3, 0, 0)).toBe(false)
    expect(cons[0].kind).toBe('le')
    expect(cons[0].latex).toContain('=')
  })
  it('y=x^2 junto a y=x auto → encierra la lente 0≤x≤1', () => {
    const { cons } = compileConstraints(
      raws([
        ['y = x^2', 'auto'],
        ['y = x', 'auto'],
      ]),
      '2d',
    )
    const region = buildRegion(cons)
    expect(region.inside(0.5, 0.35, 0)).toBe(true) // entre parábola y recta
    expect(region.inside(0.5, 0.1, 0)).toBe(false)
    expect(region.inside(2, 2, 0)).toBe(false)
  })
  it('r=2 polar auto → disco', () => {
    const { cons } = compileConstraints(raws([['r = 2', 'auto']]), '2d')
    const region = buildRegion(cons)
    expect(region.inside(0, 0, 0)).toBe(true)
    expect(region.inside(0, 3, 0)).toBe(false)
  })
  it('el usuario puede forzar el lado manualmente', () => {
    const { cons } = compileConstraints(raws([['x^2 + y^2 = 4', 'ge']]), '2d')
    const region = buildRegion(cons)
    expect(region.inside(0, 0, 0)).toBe(false)
    expect(region.inside(3, 0, 0)).toBe(true)
  })
  it('z = x^2+y^2 auto con z=4 → paraboloide acotado', () => {
    const { cons } = compileConstraints(
      raws([
        ['z = x^2 + y^2', 'auto'],
        ['z = 4', 'auto'],
      ]),
      '3d',
    )
    const region = buildRegion(cons)
    expect(region.inside(0, 0, 2)).toBe(true)
    expect(region.inside(0, 0, 6)).toBe(false)
    expect(region.inside(0, 0, -1)).toBe(false)
  })
})

describe('intervalsLe0', () => {
  it('encuentra un intervalo simple', () => {
    const iv = intervalsLe0((t) => t * t - 1, -3, 3)
    expect(iv).toHaveLength(1)
    expect(iv[0].a).toBeCloseTo(-1, 2)
    expect(iv[0].b).toBeCloseTo(1, 2)
  })
  it('encuentra intervalos disjuntos', () => {
    const iv = intervalsLe0((t) => (t * t - 1) * (t * t - 9), -4, 4)
    expect(iv).toHaveLength(2)
    expect(iv[0].a).toBeCloseTo(-3, 1)
    expect(iv[1].b).toBeCloseTo(3, 1)
  })
  it('trata NaN como fuera', () => {
    const iv = intervalsLe0((t) => (t > 0.5 && t < 1.5 ? Math.sqrt(t - 0.5) - 1 : NaN), 0, 2)
    expect(iv.length).toBe(1)
    expect(iv[0].b).toBeCloseTo(1.5, 1)
  })
})

describe('region + marching', () => {
  const p1 = make('x^2 + y^2 <= 4')
  const p2 = make('z >= x^2 + y^2')
  const p3 = make('z <= 4')
  const region = buildRegion([
    { id: '1', raw: '', latex: '', color: '#f97316', visible: true, kind: 'le', ...p1 },
    { id: '2', raw: '', latex: '', color: '#38bdf8', visible: true, kind: 'le', ...p2 },
    { id: '3', raw: '', latex: '', color: '#a78bfa', visible: true, kind: 'le', ...p3 },
  ])

  it('campo de la región', () => {
    expect(region.field(0, 0, 2, )).toBeLessThan(0) // dentro del cilindro, entre paraboloide y plano
    expect(region.field(0, 0, -1)).toBeGreaterThan(0)
    expect(region.field(3, 0, 2)).toBeGreaterThan(0)
  })

  it('marching squares del disco', () => {
    const disk = make('x^2 + y^2 <= 1')
    const ms = marchingSquares((x, y) => disk.field(x, y, 0), -2, 2, -2, 2, 80, 80)
    expect(ms.triCount).toBeGreaterThan(100)
    let area = 0
    for (let i = 0; i < ms.triCount; i++) {
      const t = i * 6
      const [ax, ay, bx, by, cx, cy] = [
        ms.tris[t], ms.tris[t + 1], ms.tris[t + 2],
        ms.tris[t + 3], ms.tris[t + 4], ms.tris[t + 5],
      ]
      area += Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2
    }
    expect(area).toBeCloseTo(Math.PI, 1)
  })

  it('marching tets genera malla del sólido', () => {
    const mesh = marchingTets([p2.field, p3.field], ['#f97316', '#38bdf8'], {
      x0: -2.6, x1: 2.6, y0: -2.6, y1: 2.6, z0: -0.5, z1: 4.6,
    }, 32)
    expect(mesh.vertexCount).toBeGreaterThan(1000)
    expect(mesh.touchesBoundary).toBe(false)
  })
})
