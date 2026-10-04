import { describe, expect, it } from 'vitest'
import { PRESETS, presetRaws, type Preset } from './presets'
import { compileConstraints } from './useConstraints'
import { buildRegion } from './field'
import { rayFieldMin, shadowField } from './shadow'
import { marchingSquares } from './marchingSquares'
import { buildRegionMesh } from './regionMesh'
import { intervalsLe0 } from './roots'
import { cylForward, sphForward } from './transforms'
import { fitBounds2D } from './autofit'
import type { Axis, BBox } from '../types'

const DEFAULT_BBOX: BBox = { x0: -5, x1: 5, y0: -5, y1: 5, z0: -5, z1: 5 }
const byId = (id: string): Preset => PRESETS.find((p) => p.id === id)!
const fieldsOf = (p: Preset) =>
  buildRegion(compileConstraints(presetRaws(p), '3d').cons).cons.map((c) => c.field)
const bboxOf = (p: Preset): BBox => ({ ...DEFAULT_BBOX, ...(p.bbox ?? {}) })

/** Ground truth independiente: barrido ultra-denso del campo combinado. */
function bruteMin(
  fields: ((x: number, y: number, z: number) => number)[],
  at: (t: number) => [number, number, number],
  t0: number,
  t1: number,
  samples = 4000,
): number {
  let best = Infinity
  for (let i = 0; i <= samples; i++) {
    const t = t0 + ((t1 - t0) * i) / samples
    const [x, y, z] = at(t)
    let m = -Infinity
    for (const f of fields) {
      const v = f(x, y, z)
      if (v > m) m = v
    }
    if (m < best) best = m
  }
  return best
}

const rayAt = (axis: Axis, u: number, v: number) =>
  axis === 'x'
    ? (t: number): [number, number, number] => [t, u, v]
    : axis === 'y'
      ? (t: number): [number, number, number] => [u, t, v]
      : (t: number): [number, number, number] => [u, v, t]

const AXES: { pierce: Axis; u: 'x' | 'y' | 'z'; v: 'x' | 'y' | 'z'; t: 'x' | 'y' | 'z' }[] = [
  { pierce: 'z', u: 'x', v: 'y', t: 'z' },
  { pierce: 'y', u: 'x', v: 'z', t: 'y' },
  { pierce: 'x', u: 'y', v: 'z', t: 'x' },
]

// ---------------------------------------------------------------------------
// A) Diferencial: la sombra rápida debe coincidir con el barrido denso
//    en TODOS los presets 3D, en las 3 direcciones de proyección.
// ---------------------------------------------------------------------------
describe('proyección: diferencial contra barrido denso', () => {
  const presets3d = PRESETS.filter((p) => p.module === 3 || p.module === 4)
  for (const p of presets3d) {
    for (const { pierce, u, v, t } of AXES) {
      it(`${p.id} · pierce ${pierce}`, () => {
        const fields = fieldsOf(p)
        const b = bboxOf(p)
        const sf = shadowField(fields, pierce, b[`${t}0`], b[`${t}1`])
        const scale = Math.max(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0)
        const N = 36
        let mismatches = 0
        for (let j = 0; j <= N; j++) {
          const vv = b[`${v}0`] + ((b[`${v}1`] - b[`${v}0`]) * j) / N
          for (let i = 0; i <= N; i++) {
            const uu = b[`${u}0`] + ((b[`${u}1`] - b[`${u}0`]) * i) / N
            const fast = sf(uu, vv) <= 0
            const truth = bruteMin(fields, rayAt(pierce, uu, vv), b[`${t}0`], b[`${t}1`]) <= 0
            if (fast !== truth) {
              // Solo se tolera desacuerdo pegado al contorno (|min| chico),
              // donde la verdad misma oscila con el muestreo.
              const mv = bruteMin(fields, rayAt(pierce, uu, vv), b[`${t}0`], b[`${t}1`], 800)
              if (Math.abs(mv) > scale * 0.02) mismatches++
            }
          }
        }
        expect(mismatches).toBe(0)
      })
    }
  }
})

// ---------------------------------------------------------------------------
// B) Valores analíticos exactos de sombras conocidas
// ---------------------------------------------------------------------------
describe('proyección: valores analíticos', () => {
  it('tetraedro 4b → triángulo x≥0, y≥0, 3x+2y≤6', () => {
    const p = byId('m3-tetra-4b')
    const b = bboxOf(p)
    const sf = shadowField(fieldsOf(p), 'z', b.z0, b.z1)
    for (const [x, y] of [
      [0.5, 0.5],
      [1.5, 0.4],
      [0.3, 2.5],
      [0.01, 0.01],
      [1.9, 0.1],
    ] as const)
      expect(sf(x, y), `(${x},${y})`).toBeLessThanOrEqual(0)
    for (const [x, y] of [
      [2.1, 0.1],
      [0.1, 3.05],
      [1.5, 1.5], // 3·1.5+2·1.5=7.5 > 6
      [-0.1, 0.5],
      [0.5, -0.1],
    ] as const)
      expect(sf(x, y), `(${x},${y})`).toBeGreaterThan(0)
  })

  it('tetraedro 4b proyectado en xz → triángulo con vértice en (0,6)', () => {
    const p = byId('m3-tetra-4b')
    const b = bboxOf(p)
    const sf = shadowField(fieldsOf(p), 'y', b.y0, b.y1)
    expect(sf(0.02, 5.9)).toBeLessThanOrEqual(0) // cerca del vértice (0,0,6)
    expect(sf(0.02, 6.05)).toBeGreaterThan(0) // por encima de la punta
    expect(sf(1.9, 0.1)).toBeLessThanOrEqual(0)
    expect(sf(1.9, 0.5)).toBeGreaterThan(0) // 3·1.9+0.5 > 6
  })

  it('paraboloide+plano → disco de radio 2 exacto', () => {
    const p = byId('m3-parab-plano')
    const b = bboxOf(p)
    const sf = shadowField(fieldsOf(p), 'z', b.z0, b.z1)
    expect(sf(1.95, 0)).toBeLessThanOrEqual(0)
    expect(sf(0, 1.95)).toBeLessThanOrEqual(0)
    expect(sf(1.4, 1.4)).toBeLessThanOrEqual(0) // r≈1.98
    expect(sf(2.05, 0)).toBeGreaterThan(0)
    expect(sf(0, -2.05)).toBeGreaterThan(0)
    expect(sf(1.5, 1.5)).toBeGreaterThan(0) // r≈2.12
  })

  it('TP14 8d: disco desplazado con pinchazo en el origen', () => {
    const p = byId('m3-tp14-8d')
    const b = bboxOf(p)
    const sf = shadowField(fieldsOf(p), 'z', b.z0, b.z1)
    // Disco (x-2)²+y²≤4. El pinchazo del sólido en el origen NO quita
    // esos puntos de la sombra (z=0 sigue adentro).
    for (const [x, y] of [
      [0.02, 0],
      [0.2, 0.2],
      [3.9, 0],
      [2, 1.95],
      [2, -1.9],
    ] as const)
      expect(sf(x, y), `(${x},${y})`).toBeLessThanOrEqual(0)
    for (const [x, y] of [
      [-0.05, 0],
      [4.05, 0],
      [2, 2.05],
      [0.1, 1.95], // (0.1-2)²+1.95² = 7.4 > 4
    ] as const)
      expect(sf(x, y), `(${x},${y})`).toBeGreaterThan(0)
  })

  it('caja 4a → rectángulo exacto', () => {
    const p = byId('m3-caja-4a')
    const b = bboxOf(p)
    const sf = shadowField(fieldsOf(p), 'z', b.z0, b.z1)
    expect(sf(1, 4)).toBeLessThanOrEqual(0)
    expect(sf(0.01, 2.01)).toBeLessThanOrEqual(0)
    expect(sf(2.01, 4)).toBeGreaterThan(0)
    expect(sf(1, 1.9)).toBeGreaterThan(0)
    expect(sf(1, 6.1)).toBeGreaterThan(0)
  })

  it('octante de esfera unitaria (TP14 5) → cuarto de disco r≤1', () => {
    const p = byId('m3-tp14-5')
    const b = bboxOf(p)
    const sf = shadowField(fieldsOf(p), 'z', b.z0, b.z1)
    expect(sf(0.7, 0.68)).toBeLessThanOrEqual(0) // r≈0.976
    expect(sf(0.05, 0.05)).toBeLessThanOrEqual(0)
    expect(sf(0.72, 0.72)).toBeGreaterThan(0) // r≈1.018
    expect(sf(-0.5, 0.5)).toBeGreaterThan(0) // fuera del octante
    expect(sf(0.5, -0.5)).toBeGreaterThan(0)
  })

  it('TP16 11: anillo en yz → la sombra es el anillo, no el disco', () => {
    const p = byId('m3-tp16-11')
    const b = bboxOf(p)
    const sf = shadowField(fieldsOf(p), 'x', b.x0, b.x1)
    expect(sf(0, 2.5)).toBeLessThanOrEqual(0) // dentro del anillo (2≤r≤3)
    expect(sf(2.9, 0)).toBeLessThanOrEqual(0)
    expect(sf(0, 0.5)).toBeGreaterThan(0) // agujero del anillo
    expect(sf(0, 3.5)).toBeGreaterThan(0) // fuera
  })
})

// ---------------------------------------------------------------------------
// C) Consistencia malla ↔ región: ningún vértice queda claramente afuera
//    y cada vértice proyecta dentro de la sombra.
// ---------------------------------------------------------------------------
describe('proyección: consistencia con la malla', () => {
  const presets3d = PRESETS.filter((p) => p.module === 3 || p.module === 4)
  for (const p of presets3d) {
    it(`${p.id}`, { timeout: 30000 }, () => {
      const fields = fieldsOf(p)
      const b = bboxOf(p)
      const mesh = buildRegionMesh(fields, fields.map(() => '#888888'), b, 30)
      const sf = shadowField(fields, 'z', b.z0, b.z1)
      const span = Math.max(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0)
      const tol = span * 0.02
      let worst = -Infinity
      // submuestreo de vértices para mantener el test razonable
      const stride = Math.max(3, Math.floor(mesh.positions.length / 3 / 400) * 3)
      for (let i = 0; i < mesh.positions.length; i += stride * 3) {
        const x = mesh.positions[i]
        const y = mesh.positions[i + 1]
        const z = mesh.positions[i + 2]
        for (const f of fields) {
          const v = f(x, y, z)
          if (v > worst) worst = v
        }
        expect(sf(x, y)).toBeLessThanOrEqual(tol)
      }
      expect(worst).toBeLessThan(tol)
    })
  }
})

// ---------------------------------------------------------------------------
// D) Intervalos de barrido por intersección contra ground truth denso
// ---------------------------------------------------------------------------
describe('barridos: intersección por campos vs ground truth', () => {
  const cases: { id: string; axis: Axis; pts: [number, number][] }[] = [
    { id: 'm3-tetra-4b', axis: 'z', pts: [[0.4, 0.4], [1.5, 0.3], [0.2, 2.0]] },
    { id: 'm3-parab-plano', axis: 'z', pts: [[0.8, 0.6], [1.5, 0], [0, 1.5]] },
    { id: 'm3-tp14-8d', axis: 'z', pts: [[2, 0], [1, 1], [0.3, 0.2]] },
    { id: 'm3-caja-4a', axis: 'z', pts: [[1, 4]] },
    { id: 'm3-tp14-5', axis: 'z', pts: [[0.3, 0.3]] },
    { id: 'm4-tp16-9', axis: 'z', pts: [[2.5, 0.5], [3.5, 0.2]] },
    { id: 'm3-tp16-11', axis: 'x', pts: [[2.5, 0], [0, 2.5]] },
  ]
  const intersect = (lists: { a: number; b: number }[][]) => {
    let cur = lists[0] ?? []
    for (let k = 1; k < lists.length; k++) {
      const next: typeof cur = []
      let i = 0
      let j = 0
      while (i < cur.length && j < lists[k].length) {
        const a = Math.max(cur[i].a, lists[k][j].a)
        const bb = Math.min(cur[i].b, lists[k][j].b)
        if (bb - a > 1e-7) next.push({ a, b: bb })
        if (cur[i].b < lists[k][j].b) i++
        else j++
      }
      cur = next
    }
    return cur
  }
  for (const c of cases) {
    for (const [u, v] of c.pts) {
      it(`${c.id} rayo (${u},${v}) en ${c.axis}`, () => {
        const p = byId(c.id)
        const fields = fieldsOf(p)
        const b = bboxOf(p)
        const t0 = b[`${c.axis}0` as const]
        const t1 = b[`${c.axis}1` as const]
        const at = rayAt(c.axis, u, v)
        const maxF = (t: number) => {
          const [x, y, z] = at(t)
          let m = -Infinity
          for (const f of fields) {
            const vv = f(x, y, z)
            if (vv > m) m = vv
          }
          return m
        }
        const truth = intervalsLe0(maxF, t0, t1, 4000)
        const fast = intersect(
          fields.map((f) => intervalsLe0((t) => f(...at(t)), t0, t1, 400)),
        )
        expect(fast.length).toBe(truth.length)
        for (let k = 0; k < truth.length; k++) {
          expect(fast[k].a).toBeCloseTo(truth[k].a, 1)
          expect(fast[k].b).toBeCloseTo(truth[k].b, 1)
        }
      })
    }
  }
})

// ---------------------------------------------------------------------------
// E) Marching squares 2D: el fill no debe salirse de la región
// ---------------------------------------------------------------------------
describe('marching squares 2D: fill dentro de la región', () => {
  const presets2d = PRESETS.filter((p) => p.module === 1)
  for (const p of presets2d) {
    it(p.id, () => {
      const { cons } = compileConstraints(presetRaws(p), '2d')
      const act = cons.filter((c) => c.visible)
      const field2 = (x: number, y: number) => {
        let m = -Infinity
        for (const c of act) {
          const v = c.field(x, y, 0)
          if (v > m) m = v
        }
        return m
      }
      const fit = fitBounds2D(field2)
      expect(fit).not.toBeNull()
      const v = fit!.view
      const ms = marchingSquares(field2, v.x0, v.x1, v.y0, v.y1, 60, 60)
      const tol = Math.max(v.x1 - v.x0, v.y1 - v.y0) * 0.05
      for (let i = 0; i < ms.tris.length; i += 2) {
        expect(field2(ms.tris[i], ms.tris[i + 1])).toBeLessThanOrEqual(tol)
      }
    })
  }
})

// ---------------------------------------------------------------------------
// F) Paneles transformados del Módulo 4 (θ,r) / (θ,φ)
// ---------------------------------------------------------------------------
describe('M4: paneles transformados', () => {
  it('TP16 9: región (θ,r) = entre 2cosθ y 4cosθ', () => {
    const p = byId('m4-tp16-9')
    const fields = fieldsOf(p)
    const b = bboxOf(p)
    const f = (th: number, r: number) => {
      const [x, y] = cylForward(r, th, 0)
      return rayFieldMin((t) => [x, y, t], fields, b.z0, b.z1, 120)
    }
    expect(f(0, 3)).toBeLessThanOrEqual(0) // r=3 ∈ [2,4]
    expect(f(0, 1)).toBeGreaterThan(0) // hueco del cilindro interno
    expect(f(0, 5)).toBeGreaterThan(0)
    expect(f(Math.PI / 3, 1.5)).toBeLessThanOrEqual(0) // r ∈ [1, 2]
    expect(f(Math.PI / 3, 2.3)).toBeGreaterThan(0) // fuera (4cos=2)
    expect(f((Math.PI * 3) / 4, 1)).toBeGreaterThan(0) // cos<0 → sin región
  })

  it('TP16 8: región (θ,φ) = φ ∈ [π/4, π/2]', () => {
    const p = byId('m4-tp16-8')
    const fields = fieldsOf(p)
    const f = (th: number, ph: number) =>
      rayFieldMin((rho) => sphForward(rho, th, ph), fields, 0, 3, 120)
    expect(f(0.3, Math.PI * 0.4)).toBeLessThanOrEqual(0) // entre cono y equador
    expect(f(2.0, Math.PI * 0.49)).toBeLessThanOrEqual(0)
    expect(f(0.3, Math.PI / 8)).toBeGreaterThan(0) // dentro del cono
    expect(f(0.3, Math.PI * 0.8)).toBeGreaterThan(0) // bajo el plano (z<0)
  })

  it('TP16 17: cono hasta z=1 → región (θ,r) = r∈[0,1]', () => {
    const p = byId('m4-tp16-17')
    const fields = fieldsOf(p)
    const b = bboxOf(p)
    const f = (th: number, r: number) => {
      const [x, y] = cylForward(r, th, 0)
      return rayFieldMin((t) => [x, y, t], fields, b.z0, b.z1, 120)
    }
    expect(f(1.0, 0.5)).toBeLessThanOrEqual(0)
    expect(f(2.0, 0.9)).toBeLessThanOrEqual(0)
    expect(f(1.0, 1.1)).toBeGreaterThan(0)
  })
})
