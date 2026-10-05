import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { bboxCenter, fitDistance, fitZoom, FOV, viewPose, type ViewName } from './camera'
import type { BBox } from '../types'

/** Generador determinístico (los tests deben dar siempre lo mismo). */
function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
}

const W = 900
const H = 600

function orthoCam(b: BBox, v: ViewName) {
  const pose = viewPose(b, v)
  const cam = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, -1e4, 1e4)
  cam.up.set(0, 0, 1)
  cam.position.set(...pose.position)
  cam.zoom = fitZoom(b, W, H)
  cam.lookAt(...pose.target)
  cam.updateProjectionMatrix()
  cam.updateMatrixWorld()
  return cam
}

function perspCam(b: BBox, v: ViewName) {
  const pose = viewPose(b, v)
  const cam = new THREE.PerspectiveCamera(FOV, W / H, 0.01, 1e4)
  const c = new THREE.Vector3(...pose.target)
  const dir = new THREE.Vector3(...pose.position).sub(c).normalize()
  cam.up.set(0, 0, 1)
  cam.position.copy(c).addScaledVector(dir, fitDistance(b))
  cam.lookAt(c)
  cam.updateProjectionMatrix()
  cam.updateMatrixWorld()
  return cam
}

const proj = (cam: THREE.Camera, p: [number, number, number]) => new THREE.Vector3(...p).project(cam)

const boxes: BBox[] = []
{
  const r = rng(7)
  for (let i = 0; i < 24; i++) {
    const x0 = (r() - 0.5) * 10, y0 = (r() - 0.5) * 10, z0 = (r() - 0.5) * 10
    boxes.push({ x0, x1: x0 + 0.5 + r() * 6, y0, y1: y0 + 0.5 + r() * 6, z0, z1: z0 + 0.5 + r() * 6 })
  }
}
const fmt = (b: BBox) => `[${b.x0.toFixed(1)},${b.x1.toFixed(1)}]×[${b.y0.toFixed(1)},${b.y1.toFixed(1)}]×[${b.z0.toFixed(1)},${b.z1.toFixed(1)}]`

describe('cámara ortográfica: sin paralaje en las vistas planas', () => {
  // Bug reportado: con perspectiva, un cuerpo fuera del plano del eje se veía
  // corrido respecto de las marcas. En ortográfica la profundidad no importa.
  boxes.forEach((b, i) => {
    it(`caja ${i} ${fmt(b)}: XY, XZ e YZ alinean cada punto con su marca`, () => {
      const r = rng(100 + i)
      const top = orthoCam(b, 'top'), front = orthoCam(b, 'front'), side = orthoCam(b, 'side')
      for (let k = 0; k < 20; k++) {
        const p: [number, number, number] = [b.x0 + r() * (b.x1 - b.x0), b.y0 + r() * (b.y1 - b.y0), b.z0 + r() * (b.z1 - b.z0)]
        const a = proj(top, p), a0 = proj(top, [p[0], p[1], 0])
        expect(Math.abs(a.x - a0.x) + Math.abs(a.y - a0.y)).toBeLessThan(1e-3)
        const f = proj(front, p), f0 = proj(front, [p[0], 0, p[2]])
        expect(Math.abs(f.x - f0.x) + Math.abs(f.y - f0.y)).toBeLessThan(1e-6)
        const s = proj(side, p), s0 = proj(side, [0, p[1], p[2]])
        expect(Math.abs(s.x - s0.x) + Math.abs(s.y - s0.y)).toBeLessThan(1e-6)
      }
    })
  })
})

describe('orientación de las vistas planas (como en el pizarrón)', () => {
  boxes.slice(0, 12).forEach((b, i) => {
    it(`caja ${i}: XY → x a la derecha, y hacia arriba; XZ → x derecha, z arriba; YZ → y derecha, z arriba`, () => {
      const c = bboxCenter(b)
      const t = orthoCam(b, 'top'), f = orthoCam(b, 'front'), s = orthoCam(b, 'side')
      const d = (cam: THREE.Camera, dv: [number, number, number]) => {
        const p0 = proj(cam, c), p1 = proj(cam, [c[0] + dv[0], c[1] + dv[1], c[2] + dv[2]])
        return [p1.x - p0.x, p1.y - p0.y]
      }
      expect(d(t, [1, 0, 0])[0]).toBeGreaterThan(0)
      expect(d(t, [0, 1, 0])[1]).toBeGreaterThan(0)
      expect(d(f, [1, 0, 0])[0]).toBeGreaterThan(0)
      expect(d(f, [0, 0, 1])[1]).toBeGreaterThan(0)
      expect(d(s, [0, 1, 0])[0]).toBeGreaterThan(0)
      expect(d(s, [0, 0, 1])[1]).toBeGreaterThan(0)
    })
  })
})

describe('encuadre: el sólido entra entero y centrado', () => {
  const views: ViewName[] = ['home', 'top', 'front', 'side']
  boxes.forEach((b, i) => {
    it(`caja ${i}: las 8 esquinas quedan dentro de la pantalla (ortográfica y perspectiva)`, () => {
      for (const v of views) {
        for (const cam of [orthoCam(b, v), perspCam(b, v)]) {
          const c = proj(cam, bboxCenter(b))
          expect(Math.abs(c.x)).toBeLessThan(1e-6)
          expect(Math.abs(c.y)).toBeLessThan(1e-6)
          for (let k = 0; k < 8; k++) {
            const p = proj(cam, [k & 1 ? b.x1 : b.x0, k & 2 ? b.y1 : b.y0, k & 4 ? b.z1 : b.z0])
            expect(Math.abs(p.x)).toBeLessThanOrEqual(1)
            expect(Math.abs(p.y)).toBeLessThanOrEqual(1)
          }
        }
      }
    })
  })
})
