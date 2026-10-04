import type { BBox } from '../types'
import { dualContour, hexToRgb, linearizeField, type LinearField, type SolidMesh } from './marchingTets'
import { marchingSquares } from './marchingSquares'

type F3 = (x: number, y: number, z: number) => number
type V3 = [number, number, number]

/**
 * Malla del sólido por PARCHES: cada restricción aporta la porción de su
 * superficie Fᵢ = 0 que queda dentro de la región.
 *  - Restricción lineal → polígono plano exacto (cara perfectamente plana).
 *  - Restricción no lineal → dual contouring recortado por las demás
 *    restricciones (semiespacios exactos, curvas por centroide).
 * Resultado: planos lisos, curvas suaves, malla chica y sin facetas falsas.
 */
export function buildRegionMesh(
  fields: F3[],
  colors: string[],
  bbox: BBox,
  n = 36,
  res2d = 96,
): SolidMesh {
  const pos: number[] = []
  const nrm: number[] = []
  const col: number[] = []
  let touchesBoundary = false

  const lin: (LinearField | null)[] = fields.map(linearizeField)
  const eps = 1e-9
  // El propio bbox recorta la visualización (6 semiespacios extra)
  const boxFields: F3[] = [
    (x) => bbox.x0 - x, (x) => x - bbox.x1,
    (_x, y) => bbox.y0 - y, (_x, y) => y - bbox.y1,
    (_x, _y, z) => bbox.z0 - z, (_x, _y, z) => z - bbox.z1,
  ]
  const boxLin = boxFields.map((f) => linearizeField(f)!)
  const span = Math.max(bbox.x1 - bbox.x0, bbox.y1 - bbox.y0, bbox.z1 - bbox.z0)
  const tol = span * 1e-4

  const pushTri = (a: V3, b: V3, c: V3, nn: V3, rgb: [number, number, number]) => {
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2])
    for (let i = 0; i < 3; i++) nrm.push(nn[0], nn[1], nn[2])
    for (let i = 0; i < 3; i++) col.push(rgb[0], rgb[1], rgb[2])
  }

  // Recorte 2D de un polígono convexo por el semiplano s(u,v) ≤ 0
  const clipPoly2 = (poly: [number, number][], s: (u: number, v: number) => number) => {
    const out: [number, number][] = []
    const m = poly.length
    for (let t = 0; t < m; t++) {
      const p = poly[t]
      const q = poly[(t + 1) % m]
      const sp = s(p[0], p[1])
      const sq = s(q[0], q[1])
      if (sp <= 0) out.push(p)
      if ((sp <= 0) !== (sq <= 0)) {
        const k = sp === sq ? 0.5 : sp / (sp - sq)
        out.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k])
      }
    }
    return out
  }

  // Recorte 3D de un polígono por el semiespacio f ≤ 0 (Sutherland–Hodgman)
  const clipPoly3 = (poly: V3[], f: F3) => {
    const out: V3[] = []
    const m = poly.length
    for (let t = 0; t < m; t++) {
      const p = poly[t]
      const q = poly[(t + 1) % m]
      const sp = f(p[0], p[1], p[2])
      const sq = f(q[0], q[1], q[2])
      if (sp <= 0) out.push(p)
      if ((sp <= 0) !== (sq <= 0)) {
        const k = sp === sq ? 0.5 : sp / (sp - sq)
        out.push([
          p[0] + (q[0] - p[0]) * k,
          p[1] + (q[1] - p[1]) * k,
          p[2] + (q[2] - p[2]) * k,
        ])
      }
    }
    return out
  }

  const gradOf = (f: F3, h: number) => (x: number, y: number, z: number): V3 => {
    const nx = f(x + h, y, z) - f(x - h, y, z)
    const ny = f(x, y + h, z) - f(x, y - h, z)
    const nz = f(x, y, z + h) - f(x, y, z - h)
    const l = Math.hypot(nx, ny, nz)
    return l > eps && Number.isFinite(l) ? [nx / l, ny / l, nz / l] : [0, 0, 1]
  }

  for (let i = 0; i < fields.length; i++) {
    const rgb = hexToRgb(colors[i] ?? '#888888')
    const others: { f: F3; l: LinearField | null }[] = []
    for (let j = 0; j < fields.length; j++) {
      if (j !== i) others.push({ f: fields[j], l: lin[j] })
    }
    for (let b = 0; b < 6; b++) others.push({ f: boxFields[b], l: boxLin[b] })

    if (lin[i]) {
      // ---------- Cara plana ----------
      const { a, b, c, d } = lin[i]!
      const L = Math.hypot(a, b, c)
      if (L < eps) continue
      const nn: V3 = [a / L, b / L, c / L]
      const p0: V3 = [(-a * d) / (L * L), (-b * d) / (L * L), (-c * d) / (L * L)]
      // Base ortonormal en el plano
      let ux = -nn[1], uy = nn[0], uz = 0
      let ul = Math.hypot(ux, uy, uz)
      if (ul < 0.5) { ux = 1; uy = 0; uz = 0; ul = 1 }
      ux /= ul; uy /= ul; uz /= ul
      const vx = nn[1] * uz - nn[2] * uy
      const vy = nn[2] * ux - nn[0] * uz
      const vz = nn[0] * uy - nn[1] * ux
      const toUV = (x: number, y: number, z: number): [number, number] => {
        const rx = x - p0[0], ry = y - p0[1], rz = z - p0[2]
        return [rx * ux + ry * uy + rz * uz, rx * vx + ry * vy + rz * vz]
      }
      const toXYZ = (u: number, v: number): V3 => [
        p0[0] + ux * u + vx * v,
        p0[1] + uy * u + vy * v,
        p0[2] + uz * u + vz * v,
      ]
      // Dominio: proyección de las 8 esquinas del bbox
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
      for (let ci = 0; ci < 8; ci++) {
        const [u, v] = toUV(
          ci & 1 ? bbox.x1 : bbox.x0,
          ci & 2 ? bbox.y1 : bbox.y0,
          ci & 4 ? bbox.z1 : bbox.z0,
        )
        u0 = Math.min(u0, u); u1 = Math.max(u1, u)
        v0 = Math.min(v0, v); v1 = Math.max(v1, v)
      }
      const allLinear = others.every((o) => o.l !== null)
      if (allLinear) {
        // Polígono exacto: rectángulo proyectado recortado por semiplanos
        let poly: [number, number][] = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]
        for (const o of others) {
          const { a: oa, b: ob, c: oc, d: od } = o.l!
          poly = clipPoly2(poly, (u, v) => {
            const p = toXYZ(u, v)
            return oa * p[0] + ob * p[1] + oc * p[2] + od
          })
          if (!poly.length) break
        }
        if (poly.length >= 3) {
          for (let t = 1; t + 1 < poly.length; t++) {
            pushTri(toXYZ(poly[0][0], poly[0][1]), toXYZ(poly[t][0], poly[t][1]), toXYZ(poly[t + 1][0], poly[t + 1][1]), nn, rgb)
          }
        }
        // Toca borde si el polígono llega al dominio proyectado
        const span2 = Math.max(u1 - u0, v1 - v0)
        for (const [u, v] of poly) {
          const p = toXYZ(u, v)
          if (
            Math.abs(p[0] - bbox.x0) < span * 1e-3 || Math.abs(p[0] - bbox.x1) < span * 1e-3 ||
            Math.abs(p[1] - bbox.y0) < span * 1e-3 || Math.abs(p[1] - bbox.y1) < span * 1e-3 ||
            Math.abs(p[2] - bbox.z0) < span * 1e-3 || Math.abs(p[2] - bbox.z1) < span * 1e-3
          ) { void span2; touchesBoundary = true; break }
        }
      } else {
        // Máscara muestreada sobre el plano (hay cortes curvos)
        const mask = (u: number, v: number) => {
          const p = toXYZ(u, v)
          let m = -Infinity
          for (const o of others) {
            const val = o.f(p[0], p[1], p[2])
            if (val > m) m = val
          }
          return m
        }
        const ms = marchingSquares(mask, u0, u1, v0, v1, res2d, res2d)
        for (let t = 0; t < ms.tris.length; t += 6) {
          pushTri(
            toXYZ(ms.tris[t], ms.tris[t + 1]),
            toXYZ(ms.tris[t + 2], ms.tris[t + 3]),
            toXYZ(ms.tris[t + 4], ms.tris[t + 5]),
            nn, rgb,
          )
        }
        // ¿la máscara toca el borde del dominio?
        for (let t = 0; t < ms.edges.length; t += 4) {
          const p = toXYZ(ms.edges[t], ms.edges[t + 1])
          if (
            Math.abs(p[0] - bbox.x0) < span * 0.02 || Math.abs(p[0] - bbox.x1) < span * 0.02 ||
            Math.abs(p[1] - bbox.y0) < span * 0.02 || Math.abs(p[1] - bbox.y1) < span * 0.02 ||
            Math.abs(p[2] - bbox.z0) < span * 0.02 || Math.abs(p[2] - bbox.z1) < span * 0.02
          ) { touchesBoundary = true; break }
        }
      }
    } else {
      // ---------- Cara curva: dual contour + recorte ----------
      const patch = dualContour([fields[i]], [colors[i]], bbox, Math.round(n * 1.4))
      const h = span / n
      const gn = gradOf(fields[i], h * 0.5)
      const linOthers = others.filter((o) => o.l !== null)
      const nlOthers = others.filter((o) => o.l === null)
      const overlap = h * 0.3 // pequeño solape para coser costuras
      const tris3: V3[][] = []
      for (let t = 0; t < patch.positions.length; t += 9) {
        let poly: V3[] = [
          [patch.positions[t], patch.positions[t + 1], patch.positions[t + 2]],
          [patch.positions[t + 3], patch.positions[t + 4], patch.positions[t + 5]],
          [patch.positions[t + 6], patch.positions[t + 7], patch.positions[t + 8]],
        ]
        for (const o of linOthers) {
          poly = clipPoly3(poly, o.f)
          if (!poly.length) break
        }
        if (poly.length < 3) continue
        for (let k = 1; k + 1 < poly.length; k++) {
          const tri: V3[] = [poly[0], poly[k], poly[k + 1]]
          const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3
          const cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3
          const cz = (tri[0][2] + tri[1][2] + tri[2][2]) / 3
          if (nlOthers.some((o) => o.f(cx, cy, cz) > overlap)) continue
          tris3.push(tri)
        }
      }
      // Subdivisión con proyección: cada triángulo se parte en 4 y los puntos
      // medios se proyectan sobre Fᵢ = 0 (y las semirrectas de corte exactas)
      // → la superficie queda lisa, sin el "damero" de la grilla.
      const fi = fields[i]
      const seamL = linOthers.slice(0, 6) // semiespacios de corte lineales
      const hh = h * 0.5
      const project = (p: V3) => {
        for (let it = 0; it < 4; it++) {
          const nx = fi(p[0] + hh, p[1], p[2]) - fi(p[0] - hh, p[1], p[2])
          const ny = fi(p[0], p[1] + hh, p[2]) - fi(p[0], p[1] - hh, p[2])
          const nz = fi(p[0], p[1], p[2] + hh) - fi(p[0], p[1], p[2] - hh)
          const gm = Math.hypot(nx, ny, nz) / (2 * hh)
          const fv = fi(p[0], p[1], p[2])
          if (gm > 1e-9) {
            const s = fv / gm
            const il = 1 / Math.hypot(nx, ny, nz)
            p[0] -= s * nx * il; p[1] -= s * ny * il; p[2] -= s * nz * il
          }
          for (const o of seamL) {
            const v = o.f(p[0], p[1], p[2])
            if (v > 0 && o.l) {
              const { a, b, c } = o.l
              const s = v / (a * a + b * b + c * c)
              p[0] -= s * a; p[1] -= s * b; p[2] -= s * c
            }
          }
          // Vértices que violan una restricción no lineal se llevan a la
          // costura por proyección alternada (Fᵢ = 0 ∧ Fⱼ = 0).
          // g ≈ 2h·∇f → p -= f·∇f/|∇f|² = f·2h·g/|g|²
          for (const o of nlOthers) {
            const v = o.f(p[0], p[1], p[2])
            if (v > 0) {
              const gx = o.f(p[0] + hh, p[1], p[2]) - o.f(p[0] - hh, p[1], p[2])
              const gy = o.f(p[0], p[1] + hh, p[2]) - o.f(p[0], p[1] - hh, p[2])
              const gz = o.f(p[0], p[1], p[2] + hh) - o.f(p[0], p[1], p[2] - hh)
              const gl2 = gx * gx + gy * gy + gz * gz
              if (gl2 > 1e-18) {
                const s = (v * 2 * hh) / gl2
                p[0] -= s * gx; p[1] -= s * gy; p[2] -= s * gz
              }
            }
          }
        }
      }
      const vkey = (v: V3) => `${v[0].toFixed(4)}_${v[1].toFixed(4)}_${v[2].toFixed(4)}`
      const uid = new Map<string, V3>()
      const canon = (v: V3) => {
        const key = vkey(v)
        let w = uid.get(key)
        if (!w) { w = [v[0], v[1], v[2]]; uid.set(key, w) }
        return w
      }
      // Los vértices base del dual-contour pueden quedar fuera de la superficie
      // (intersección de planos tangentes); se proyectan todos a Fᵢ = 0.
      for (const tri of tris3) for (const v of tri) canon(v)
      for (const v of uid.values()) project(v)
      const mids = new Map<string, V3>()
      const mid = (a: V3, b: V3) => {
        const key = `${vkey(a)}|${vkey(b)}`
        let m = mids.get(key)
        if (!m) {
          m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
          project(m)
          mids.set(key, m)
        }
        return m
      }
      const emitTri = (a: V3, b: V3, c: V3) => {
        // descarta triángulos degenerados (slivers del recorte)
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
        const wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2]
        const cx2 = uy * wz - uz * wy, cy2 = uz * wx - ux * wz, cz2 = ux * wy - uy * wx
        if (cx2 * cx2 + cy2 * cy2 + cz2 * cz2 < 1e-14) return
        for (const v of [a, b, c]) {
          const nn = gn(v[0], v[1], v[2])
          pos.push(v[0], v[1], v[2])
          nrm.push(nn[0], nn[1], nn[2])
          col.push(rgb[0], rgb[1], rgb[2])
        }
      }
      for (const tri of tris3) {
        const [a, b, c] = [canon(tri[0]), canon(tri[1]), canon(tri[2])]
        const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a)
        emitTri(a, ab, ca)
        emitTri(ab, b, bc)
        emitTri(ca, bc, c)
        emitTri(ab, bc, ca)
      }
    }
  }
  // La región toca el borde si su campo es ≤ 0 sobre alguna cara del bbox
  if (!touchesBoundary && fields.length) {
    const R = (x: number, y: number, z: number) => {
      let m = -Infinity
      for (const f of fields) {
        const v = f(x, y, z)
        if (v > m) m = v
      }
      return m
    }
    const N = 12
    outer: for (let face = 0; face < 6; face++) {
      for (let a = 0; a <= N; a++) {
        for (let b = 0; b <= N; b++) {
          const s = a / N, t = b / N
          let x = bbox.x0 + (bbox.x1 - bbox.x0) * s
          let y = bbox.y0 + (bbox.y1 - bbox.y0) * t
          let z = bbox.z0 + (bbox.z1 - bbox.z0) * t
          if (face === 0) x = bbox.x0
          else if (face === 1) x = bbox.x1
          else if (face === 2) { y = bbox.y0; z = bbox.z0 + (bbox.z1 - bbox.z0) * s }
          else if (face === 3) { y = bbox.y1; z = bbox.z0 + (bbox.z1 - bbox.z0) * s }
          else if (face === 4) { z = bbox.z0; y = bbox.y0 + (bbox.y1 - bbox.y0) * s }
          else { z = bbox.z1; y = bbox.y0 + (bbox.y1 - bbox.y0) * s }
          if (R(x, y, z) <= 0) { touchesBoundary = true; break outer }
        }
      }
    }
  }
  void tol
  return {
    positions: new Float32Array(pos),
    normals: new Float32Array(nrm),
    colors: new Float32Array(col),
    vertexCount: pos.length / 3,
    touchesBoundary,
  }
}
