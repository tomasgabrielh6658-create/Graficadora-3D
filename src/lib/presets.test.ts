import { describe, expect, it } from 'vitest'
import { PRESETS, presetRaws, type Preset } from './presets'
import { compileConstraints } from './useConstraints'
import { buildRegion, type Region } from './field'
import { fitBounds2D, fitBounds3D, SEARCH_3D } from './autofit'
import { marchingSquares } from './marchingSquares'
import { dualContour, marchingTets } from './marchingTets'
import { buildRegionMesh } from './regionMesh'
import { sweepRegion } from './sweeps'
import { rayFieldMin } from './shadow'
import { customTransform, sphForward, cylForward } from './transforms'
import { intervalsLe0 } from './roots'
import type { BBox } from '../types'

const DEFAULT_BBOX: BBox = { x0: -5, x1: 5, y0: -5, y1: 5, z0: -5, z1: 5 }

function regionOf(p: Preset): { region: Region; errors: (string | null)[] } {
  const dims = p.module >= 3 ? '3d' : '2d'
  const { cons, errors } = compileConstraints(presetRaws(p), dims)
  return { region: buildRegion(cons), errors }
}

function bboxOf(p: Preset): BBox {
  return { ...DEFAULT_BBOX, ...(p.bbox ?? {}) }
}

describe('presets: parsing', () => {
  for (const p of PRESETS) {
    it(`${p.id} compila sin errores`, () => {
      const { errors } = regionOf(p)
      expect(errors.filter(Boolean)).toEqual([])
    })
  }
})

describe('presets 2D: región no vacía y acotada', () => {
  for (const p of PRESETS.filter((q) => q.module <= 2)) {
    it(`${p.id}`, () => {
      const { region } = regionOf(p)
      const fit = fitBounds2D((x, y) => region.field(x, y, 0))
      expect(fit).not.toBeNull()
      expect(fit!.clipped).toBe(false)
      const v = fit!.view
      const ms = marchingSquares((x, y) => region.field(x, y, 0), v.x0, v.x1, v.y0, v.y1, 80, 80)
      expect(ms.triCount).toBeGreaterThan(20)
    })
  }
})

describe('presets 3D: sólido no vacío y acotado', () => {
  for (const p of PRESETS.filter((q) => q.module >= 3)) {
    it(`${p.id}`, () => {
      const { region } = regionOf(p)
      const act = region.cons
      const bb = p.bbox
        ? bboxOf(p)
        : fitBounds3D(region.field)!.bbox
      const mesh = buildRegionMesh(act.map((c) => c.field), act.map((c) => c.color), bb, 24)
      expect(mesh.vertexCount).toBeGreaterThan(5)
      expect(mesh.touchesBoundary).toBe(false)
      const fit = fitBounds3D(region.field, SEARCH_3D)
      expect(fit).not.toBeNull()
      expect(fit!.clipped).toBe(false)
    })
  }
})

describe('valores conocidos del TP', () => {
  const byId = (id: string) => regionOf(PRESETS.find((p) => p.id === id)!).region

  it('TP14 4a: caja → z ∈ [3,5]', () => {
    const r = byId('m3-caja-4a')
    const hit = sweepRegion(r, 'z', { x: 1, y: 4, z: 0 }, -10, 10)
    expect(hit.intervals).toHaveLength(1)
    expect(hit.intervals[0].a).toBeCloseTo(3, 2)
    expect(hit.intervals[0].b).toBeCloseTo(5, 2)
  })

  it('paraboloide y plano → z ∈ [x²+y², 4]', () => {
    const r = byId('m3-parab-plano')
    const hit = sweepRegion(r, 'z', { x: 0.5, y: 0.5, z: 0 }, -10, 10)
    expect(hit.intervals[0].a).toBeCloseTo(0.5, 2)
    expect(hit.intervals[0].b).toBeCloseTo(4, 2)
    expect(hit.exit?.constraint?.raw).toBe('z <= 4')
    expect(hit.entry?.constraint?.raw).toBe('z >= x^2 + y^2')
  })

  it('TP14 4b: tetraedro → z ∈ [0, 6−3x−2y]', () => {
    const r = byId('m3-tetra-4b')
    const hit = sweepRegion(r, 'z', { x: 0.5, y: 0.5, z: 0 }, -10, 10)
    expect(hit.intervals[0].a).toBeCloseTo(0, 2)
    expect(hit.intervals[0].b).toBeCloseTo(3.5, 2)
  })

  it('TP14 4b: la malla llega hasta la punta z = 6', () => {
    const r = byId('m3-tetra-4b')
    const p = PRESETS.find((q) => q.id === 'm3-tetra-4b')!
    const mesh = buildRegionMesh(
      r.cons.map((c) => c.field),
      r.cons.map((c) => c.color),
      bboxOf(p),
      36,
    )
    let zMax = -Infinity
    for (let i = 2; i < mesh.positions.length; i += 3) {
      if (mesh.positions[i] > zMax) zMax = mesh.positions[i]
    }
    expect(zMax).toBeGreaterThan(5.9)
    expect(zMax).toBeLessThanOrEqual(6.01)
  })

  it('TP14 8d: cilindro desplazado y paraboloide', () => {
    const r = byId('m3-tp14-8d')
    const hit = sweepRegion(r, 'z', { x: 2, y: 0, z: 0 }, -1, 6)
    expect(hit.intervals).toHaveLength(1)
    expect(hit.intervals[0].a).toBeCloseTo(0, 2)
    expect(hit.intervals[0].b).toBeCloseTo(1, 2) // z = (x²+y²)/4 = 1
  })

  it('TP14 8d: la sombra incluye el pinchazo cerca del origen', () => {
    const r = byId('m3-tp14-8d')
    const fields = r.cons.map((c) => c.field)
    // El sólido se adelgaza a z ≤ (x²+y²)/4: en (0.05, 0) el tramo mide
    // ~0.0006 — el muestreo del máximo lo perdía y la sombra salía mordida.
    expect(rayFieldMin((t) => [0.05, 0, t], fields, -0.5, 5)).toBeLessThanOrEqual(0)
    expect(rayFieldMin((t) => [-0.5, 0, t], fields, -0.5, 5)).toBeGreaterThan(0)
  })

  it('TP16 9: corona entre cilindros desplazados → r ∈ [2,4] en θ=0', () => {
    const r = byId('m4-tp16-9')
    const f = (rr: number) => {
      const [x, y] = cylForward(rr, 0, 0)
      let m = Infinity
      for (let i = 0; i <= 60; i++) {
        const z = -0.5 + (3.8 * i) / 60
        const v = r.field(x, y, z)
        if (v < m) m = v
      }
      return m
    }
    const iv = intervalsLe0(f, 0, 6)
    expect(iv).toHaveLength(1)
    expect(iv[0].a).toBeCloseTo(2, 1)
    expect(iv[0].b).toBeCloseTo(4, 1)
  })

  it('TP16 8: esfera exterior al cono → ρ ∈ [0,1] para φ>π/4', () => {
    const r = byId('m4-tp16-8')
    const iv = intervalsLe0(
      (rho) => r.field(...sphForward(rho, 0.6, Math.PI / 3)),
      0,
      2,
    )
    expect(iv).toHaveLength(1)
    expect(iv[0].b).toBeCloseTo(1, 2)
    const empty = intervalsLe0(
      (rho) => r.field(...sphForward(rho, 0.6, Math.PI / 6)),
      0,
      2,
    )
    expect(empty).toHaveLength(0) // dentro del cono → fuera de la región
  })

  it('transformación custom hipérbolas: u=xy, v=y/x', () => {
    const res = customTransform({
      xExpr: 'sqrt(u/v)', yExpr: 'sqrt(u*v)', u0: 0.5, u1: 2.5, v0: 0.5, v1: 4.5,
    })
    expect('T' in res).toBe(true)
    if (!('T' in res)) return
    const T = res.T
    const [x, y] = T.forward(1.5, 2)
    expect(x * y).toBeCloseTo(1.5, 6)
    expect(y / x).toBeCloseTo(2, 6)
    const [u, v] = T.inverse(x, y)
    expect(u).toBeCloseTo(1.5, 4)
    expect(v).toBeCloseTo(2, 4)
    expect(T.jacobianAt!(1.5, 2)).toBeCloseTo(0.25, 3)
  })

  it('región hipérbolas en (u,v) es un rectángulo', () => {
    const p = PRESETS.find((q) => q.id === 'm2-hiperbolas')!
    const { region } = regionOf(p)
    const res = customTransform({
      xExpr: 'sqrt(u/v)', yExpr: 'sqrt(u*v)', u0: 0.5, u1: 2.5, v0: 0.5, v1: 4.5,
    })
    if (!('T' in res)) throw new Error('customTransform falló')
    const f = (u: number, v: number) => {
      const [x, y] = res.T.forward(u, v)
      return region.field(x, y, 0)
    }
    expect(f(1.5, 2.5)).toBeLessThan(0) // interior del rectángulo
    expect(f(0.8, 2.5)).toBeGreaterThan(0) // u<1 fuera
    expect(f(1.5, 0.8)).toBeGreaterThan(0) // v<1 fuera
    expect(f(1.5, 4.2)).toBeGreaterThan(0) // v>4 fuera
  })
})
