import type { BBox } from '../types'

export interface SolidMesh {
  positions: Float32Array
  normals: Float32Array
  colors: Float32Array
  vertexCount: number
  touchesBoundary: boolean
}

const TETS: [number, number, number, number][] = [
  [0, 5, 1, 6],
  [0, 1, 2, 6],
  [0, 2, 3, 6],
  [0, 3, 7, 6],
  [0, 7, 4, 6],
  [0, 4, 5, 6],
]

const CORNER_OFFSET: [number, number, number][] = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
]

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ]
}

export interface LinearField { a: number; b: number; c: number; d: number }

/** Detecta si el campo es afín: devuelve coeficientes de a·x+b·y+c·z+d o null. */
export function linearizeField(
  f: (x: number, y: number, z: number) => number,
): LinearField | null {
  const f0 = f(0, 0, 0)
  const a = f(1, 0, 0) - f0
  const b = f(0, 1, 0) - f0
  const c = f(0, 0, 1) - f0
  const probe = f(1.3, -2.1, 0.7)
  return Number.isFinite(probe) &&
    Math.abs(probe - (f0 + a * 1.3 - b * 2.1 + c * 0.7)) < 1e-6 * (1 + Math.abs(probe))
    ? { a, b, c, d: f0 }
    : null
}

export function marchingTets(
  fields: ((x: number, y: number, z: number) => number)[],
  colors: string[],
  bbox: BBox,
  n = 44,
): SolidMesh {
  const gw = n + 1
  const size = gw * gw * gw
  const g = new Float32Array(size)
  const dom = new Uint8Array(size)
  const dx = (bbox.x1 - bbox.x0) / n
  const dy = (bbox.y1 - bbox.y0) / n
  const dz = (bbox.z1 - bbox.z0) / n
  const gx = (i: number) => bbox.x0 + dx * i
  const gy = (j: number) => bbox.y0 + dy * j
  const gz = (k: number) => bbox.z0 + dz * k
  for (let k = 0; k <= n; k++) {
    const z = gz(k)
    for (let j = 0; j <= n; j++) {
      const y = gy(j)
      for (let i = 0; i <= n; i++) {
        const x = gx(i)
        let m = -Infinity
        let di = 0
        for (let c = 0; c < fields.length; c++) {
          const v = fields[c](x, y, z)
          if (v > m) {
            m = v
            di = c
          }
        }
        const idx = (k * gw + j) * gw + i
        g[idx] = Number.isFinite(m) ? m : 1e30
        dom[idx] = di
      }
    }
  }
  const pos: number[] = []
  const col: number[] = []
  const palette = colors.map(hexToRgb)
  let touchesBoundary = false
  const cornerX = new Float64Array(8)
  const cornerY = new Float64Array(8)
  const cornerZ = new Float64Array(8)
  const cornerV = new Float64Array(8)
  const cornerD = new Uint8Array(8)

  for (let k = 0; k < n; k++) {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        let anyIn = false
        let anyOut = false
        let domOr = 0
        for (let c = 0; c < 8; c++) {
          const [oi, oj, ok] = CORNER_OFFSET[c]
          const ii = i + oi
          const jj = j + oj
          const kk = k + ok
          const gidx = (kk * gw + jj) * gw + ii
          cornerX[c] = gx(ii)
          cornerY[c] = gy(jj)
          cornerZ[c] = gz(kk)
          cornerV[c] = g[gidx]
          cornerD[c] = dom[gidx]
          domOr |= 1 << cornerD[c]
          if (cornerV[c] <= 0) {
            anyIn = true
            if (ii === 0 || ii === n || jj === 0 || jj === n || kk === 0 || kk === n) touchesBoundary = true
          } else anyOut = true
        }
        if (!anyIn || !anyOut) continue
        for (const [ta, tb, tc, td] of TETS) {
          emitTet(
            [ta, tb, tc, td], cornerX, cornerY, cornerZ, cornerV, cornerD,
            palette, pos, col, domOr,
          )
        }
      }
    }
  }
  const positions = new Float32Array(pos)
  const colorsArr = new Float32Array(col)
  // Normales suaves por gradiente del campo combinado F = max Fᵢ:
  // cada vértice hereda la normal exacta de la superficie → caras planas
  // perfectamente lisas y curvas suaves con mallas gruesas.
  const normals = new Float32Array(positions.length)
  const F = (x: number, y: number, z: number) => {
    let m = -Infinity
    for (const f of fields) {
      const v = f(x, y, z)
      if (v > m) m = v
    }
    return m
  }
  const h = Math.min(dx, dy, dz) * 0.5
  for (let t = 0; t < positions.length; t += 3) {
    const x = positions[t], y = positions[t + 1], z = positions[t + 2]
    const nx = F(x + h, y, z) - F(x - h, y, z)
    const ny = F(x, y + h, z) - F(x, y - h, z)
    const nz = F(x, y, z + h) - F(x, y, z - h)
    const len = Math.hypot(nx, ny, nz)
    if (len > 1e-9 && Number.isFinite(len)) {
      normals[t] = nx / len
      normals[t + 1] = ny / len
      normals[t + 2] = nz / len
    } else {
      normals[t + 2] = 1
    }
  }
  return { positions, normals, colors: colorsArr, vertexCount: positions.length / 3, touchesBoundary }
}

interface DcVert { x: number; y: number; z: number; nx: number; ny: number; nz: number }

/**
 * Dual contouring: cada celda con cruce obtiene un único vértice ubicado por QEF
 * en la intersección de los planos tangentes → conserva aristas y vértices
 * afilados (la punta de un tetraedro queda exacta), caras planas lisas y una
 * malla mucho más chica que marching tetrahedra.
 */
export function dualContour(
  fields: ((x: number, y: number, z: number) => number)[],
  colors: string[],
  bbox: BBox,
  n = 36,
): SolidMesh {
  const gw = n + 1
  const size = gw * gw * gw
  const g = new Float32Array(size)
  const domN = new Uint8Array(size)
  const dx = (bbox.x1 - bbox.x0) / n
  const dy = (bbox.y1 - bbox.y0) / n
  const dz = (bbox.z1 - bbox.z0) / n
  const gx = (i: number) => bbox.x0 + dx * i
  const gy = (j: number) => bbox.y0 + dy * j
  const gz = (k: number) => bbox.z0 + dz * k
  const F = (x: number, y: number, z: number) => {
    let m = -Infinity
    for (const f of fields) {
      const v = f(x, y, z)
      if (v > m) m = v
    }
    return m
  }
  const h = Math.min(dx, dy, dz) * 0.5
  const grad = (x: number, y: number, z: number): [number, number, number] => {
    const nx = F(x + h, y, z) - F(x - h, y, z)
    const ny = F(x, y + h, z) - F(x, y - h, z)
    const nz = F(x, y, z + h) - F(x, y, z - h)
    const len = Math.hypot(nx, ny, nz)
    return len > 1e-9 && Number.isFinite(len)
      ? [nx / len, ny / len, nz / len]
      : [0, 0, 1]
  }
  let touchesBoundary = false
  for (let k = 0; k <= n; k++) {
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        let m = -Infinity
        let di = 0
        for (let c = 0; c < fields.length; c++) {
          const v = fields[c](gx(i), gy(j), gz(k))
          if (v > m) { m = v; di = c }
        }
        const idx = (k * gw + j) * gw + i
        g[idx] = Number.isFinite(m) ? m : 1e30
        domN[idx] = di
        if (m <= 0 && (i === 0 || i === n || j === 0 || j === n || k === 0 || k === n)) {
          touchesBoundary = true
        }
      }
    }
  }
  // Cruces de aristas de la grilla
  const ekey = (dir: number, i: number, j: number, k: number) =>
    dir * size + (k * gw + j) * gw + i
  const edges = new Map<number, DcVert & { d: number }>()
  const nodeIdx = (i: number, j: number, k: number) => (k * gw + j) * gw + i
  for (let k = 0; k <= n; k++) {
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const v0 = g[nodeIdx(i, j, k)]
        const dirs: [number, number, number, number][] = []
        if (i < n) dirs.push([0, i + 1, j, k])
        if (j < n) dirs.push([1, i, j + 1, k])
        if (k < n) dirs.push([2, i, j, k + 1])
        for (const [dir, i1, j1, k1] of dirs) {
          const v1 = g[nodeIdx(i1, j1, k1)]
          if ((v0 <= 0) === (v1 <= 0)) continue
          const s = v0 === v1 ? 0.5 : v0 / (v0 - v1)
          const px = gx(i) + (gx(i1) - gx(i)) * s
          const py = gy(j) + (gy(j1) - gy(j)) * s
          const pz = gz(k) + (gz(k1) - gz(k)) * s
          const [nx, ny, nz] = grad(px, py, pz)
          const d = s < 0.5 ? domN[nodeIdx(i, j, k)] : domN[nodeIdx(i1, j1, k1)]
          edges.set(ekey(dir, i, j, k), { x: px, y: py, z: pz, nx, ny, nz, d })
        }
      }
    }
  }
  // Vértice por celda (QEF sobre las tangentes de los cruces de sus 12 aristas)
  const cellEdges = (i: number, j: number, k: number) => [
    ekey(0, i, j, k), ekey(0, i, j + 1, k), ekey(0, i, j, k + 1), ekey(0, i, j + 1, k + 1),
    ekey(1, i, j, k), ekey(1, i + 1, j, k), ekey(1, i, j, k + 1), ekey(1, i + 1, j, k + 1),
    ekey(2, i, j, k), ekey(2, i + 1, j, k), ekey(2, i, j + 1, k), ekey(2, i + 1, j + 1, k),
  ]
  const ckey = (i: number, j: number, k: number) => (k * n + j) * n + i
  const cellVerts = new Map<number, DcVert>()
  for (let k = 0; k < n; k++) {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const cr: DcVert[] = []
        for (const ek of cellEdges(i, j, k)) {
          const e = edges.get(ek)
          if (e) cr.push(e)
        }
        if (!cr.length) continue
        // QEF: minimizar Σ (n·(x−p))²  →  resolver 3x3
        let a00 = 0, a01 = 0, a02 = 0, a11 = 0, a12 = 0, a22 = 0
        let b0 = 0, b1 = 0, b2 = 0, mx = 0, my = 0, mz = 0
        for (const c of cr) {
          a00 += c.nx * c.nx; a01 += c.nx * c.ny; a02 += c.nx * c.nz
          a11 += c.ny * c.ny; a12 += c.ny * c.nz; a22 += c.nz * c.nz
          const d = c.nx * c.x + c.ny * c.y + c.nz * c.z
          b0 += c.nx * d; b1 += c.ny * d; b2 += c.nz * d
          mx += c.x; my += c.y; mz += c.z
        }
        mx /= cr.length; my /= cr.length; mz /= cr.length
        const reg = 1e-6 * (a00 + a11 + a22 + 1e-9)
        a00 += reg; a11 += reg; a22 += reg
        // Eliminación gaussiana 3x3
        let x = mx, y = my, z = mz
        const m01 = a01 / a00, m02 = a02 / a00
        const s11 = a11 - m01 * a01, s12 = a12 - m01 * a02, s22 = a22 - m02 * a02
        const t1 = b1 - m01 * b0, t2 = b2 - m02 * b0
        const s21 = s12 // simetría: a21' = s12
        if (Math.abs(s11) > 1e-12 && Math.abs(s22 - (s21 / s11) * s12) > 1e-12) {
          const z2 = (t2 - (s21 / s11) * t1) / (s22 - (s21 / s11) * s12)
          const y2 = (t1 - s12 * z2) / s11
          const x2 = (b0 - a01 * y2 - a02 * z2) / a00
          if (Number.isFinite(x2) && Number.isFinite(y2) && Number.isFinite(z2)) {
            x = x2; y = y2; z = z2
          }
        }
        // Restringir al interior de la celda (estabilidad del QEF)
        x = Math.min(Math.max(x, gx(i)), gx(i + 1))
        y = Math.min(Math.max(y, gy(j)), gy(j + 1))
        z = Math.min(Math.max(z, gz(k)), gz(k + 1))
        const [nx, ny, nz] = grad(x, y, z)
        cellVerts.set(ckey(i, j, k), { x, y, z, nx, ny, nz })
      }
    }
  }
  // Emisión: cada arista con cruce une los vértices de sus celdas adyacentes
  const pos: number[] = []
  const col: number[] = []
  const nrm: number[] = []
  const palette = colors.map(hexToRgb)
  const vertIndex = new Map<DcVert, number>()
  const triIdx: [number, number, number][] = []
  const vidx = (v: DcVert) => {
    let i = vertIndex.get(v)
    if (i === undefined) { i = vertIndex.size; vertIndex.set(v, i) }
    return i
  }
  const emit = (a: DcVert, b: DcVert, c: DcVert, d: number, rn: DcVert) => {
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z
    const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z
    const fnx = uy * vz - uz * vy, fny = uz * vx - ux * vz, fnz = ux * vy - uy * vx
    const verts = fnx * rn.nx + fny * rn.ny + fnz * rn.nz < 0 ? [a, c, b] : [a, b, c]
    const rgb = palette[d] ?? [0.5, 0.5, 0.5]
    triIdx.push([vidx(verts[0]), vidx(verts[1]), vidx(verts[2])])
    for (const v of verts) {
      pos.push(v.x, v.y, v.z)
      nrm.push(v.nx, v.ny, v.nz)
      col.push(rgb[0], rgb[1], rgb[2])
    }
  }
  const cell = (i: number, j: number, k: number) =>
    i >= 0 && j >= 0 && k >= 0 && i < n && j < n && k < n ? cellVerts.get(ckey(i, j, k)) : undefined
  for (const [key, cr] of edges) {
    const dir = Math.floor(key / size)
    const idx = key % size
    const i = idx % gw
    const j = Math.floor(idx / gw) % gw
    const k = Math.floor(idx / (gw * gw))
    const cand =
      dir === 0
        ? [cell(i, j - 1, k - 1), cell(i, j, k - 1), cell(i, j, k), cell(i, j - 1, k)]
        : dir === 1
          ? [cell(i - 1, j, k - 1), cell(i - 1, j, k), cell(i, j, k), cell(i, j, k - 1)]
          : [cell(i - 1, j - 1, k), cell(i - 1, j, k), cell(i, j, k), cell(i, j - 1, k)]
    const cs = cand.filter((c): c is DcVert => !!c)
    // Abanico de triángulos hacia el punto de cruce (que está sobre la
    // superficie): triangulación uniforme sin el "damero" de los quads.
    for (let t = 0; t + 1 < cs.length; t++) emit(cs[t], cs[t + 1], cr, cr.d, cr)
    if (cs.length === 4) emit(cs[3], cs[0], cr, cr.d, cr)
  }

  // --- Vértices afilados que la grilla no resolvió ---
  // Un vértice de la región (intersección de 3 restricciones) puede caer en una
  // celda cuyas 8 esquinas son exteriores → la punta se pierde a cualquier
  // resolución. Se detecta analíticamente y se cierra con un abanico hacia el
  // anillo de vértices que quedó alrededor.
  const idToVert = [...vertIndex.keys()]
  // Vértices analíticos de la región: para cada triple de restricciones
  const lin = fields.map(linearizeField)
  const solve3 = (A: number[][], b: number[]): [number, number, number] | null => {
    const [r0, r1, r2] = A
    const det =
      r0[0] * (r1[1] * r2[2] - r1[2] * r2[1]) -
      r0[1] * (r1[0] * r2[2] - r1[2] * r2[0]) +
      r0[2] * (r1[0] * r2[1] - r1[1] * r2[0])
    if (Math.abs(det) < 1e-10) return null
    const dx_ =
      b[0] * (r1[1] * r2[2] - r1[2] * r2[1]) -
      r0[1] * (b[1] * r2[2] - r1[2] * b[2]) +
      r0[2] * (b[1] * r2[1] - r1[1] * b[2])
    const dy_ =
      r0[0] * (b[1] * r2[2] - r1[2] * b[2]) -
      b[0] * (r1[0] * r2[2] - r1[2] * r2[0]) +
      r0[2] * (r1[0] * b[2] - b[1] * r2[0])
    const dz_ =
      r0[0] * (r1[1] * b[2] - b[1] * r2[1]) -
      r0[1] * (r1[0] * b[2] - b[1] * r2[0]) +
      b[0] * (r1[0] * r2[1] - r1[1] * r2[0])
    return [dx_ / det, dy_ / det, dz_ / det]
  }
  const crossings: { x: number; y: number; z: number; d: number }[] = [...edges.values()]
  const hCell = Math.max(dx, dy, dz)
  const corners: DcVert[] = []
  const feasible = (x: number, y: number, z: number) =>
    fields.every((f) => f(x, y, z) <= hCell * 0.05) &&
    x > bbox.x0 + 1e-6 && x < bbox.x1 - 1e-6 &&
    y > bbox.y0 + 1e-6 && y < bbox.y1 - 1e-6 &&
    z > bbox.z0 + 1e-6 && z < bbox.z1 - 1e-6
  for (let i = 0; i < fields.length; i++) {
    for (let j = i + 1; j < fields.length; j++) {
      for (let k = j + 1; k < fields.length; k++) {
        const candidates: [number, number, number][] = []
        const [li, lj, lk] = [lin[i], lin[j], lin[k]]
        if (li && lj && lk) {
          const s = solve3(
            [[li.a, li.b, li.c], [lj.a, lj.b, lj.c], [lk.a, lk.b, lk.c]],
            [-li.d, -lj.d, -lk.d],
          )
          if (s) candidates.push(s)
        } else {
          // Newton desde los cruces dominados por alguna de las 3 restricciones
          const tri = [fields[i], fields[j], fields[k]]
          for (const cr of crossings) {
            if (cr.d !== i && cr.d !== j && cr.d !== k) continue
            let px = cr.x, py = cr.y, pz = cr.z
            for (let it = 0; it < 8; it++) {
              const fv = tri.map((f) => f(px, py, pz))
              const J = tri.map((f) => {
                const eps = 1e-6
                return [
                  (f(px + eps, py, pz) - f(px - eps, py, pz)) / (2 * eps),
                  (f(px, py + eps, pz) - f(px, py - eps, pz)) / (2 * eps),
                  (f(px, py, pz + eps) - f(px, py, pz - eps)) / (2 * eps),
                ]
              })
              const d = solve3(J, fv)
              if (!d) break
              px -= d[0]; py -= d[1]; pz -= d[2]
            }
            const resid = Math.max(...tri.map((f) => Math.abs(f(px, py, pz))))
            if (resid < 1e-7) candidates.push([px, py, pz])
          }
        }
        for (const [cx, cy, cz] of candidates) {
          if (!feasible(cx, cy, cz)) continue
          if (corners.some((v) => Math.hypot(v.x - cx, v.y - cy, v.z - cz) < hCell * 0.3)) continue
          // Solo cerrar si su celda no tiene vértice (la grilla la perdió)
          const ci = Math.floor((cx - bbox.x0) / dx)
          const cj = Math.floor((cy - bbox.y0) / dy)
          const ck = Math.floor((cz - bbox.z0) / dz)
          if (ci >= 0 && ci < n && cj >= 0 && cj < n && ck >= 0 && ck < n) {
            if (cellVerts.has(ckey(ci, cj, ck))) continue
          }
          const [nx, ny, nz] = grad(cx, cy, cz)
          corners.push({ x: cx, y: cy, z: cz, nx, ny, nz })
        }
      }
    }
  }
  // Abanico desde la esquina hacia el anillo de vértices emitidos más cercanos
  for (const v of corners) {
    const ring = idToVert.filter(
      (w) => Math.hypot(w.x - v.x, w.y - v.y, w.z - v.z) < hCell * 2,
    )
    if (ring.length < 3) continue
    // Orden angular alrededor del eje esquina→centroide del anillo
    let ax = 0, ay = 0, az = 0
    for (const w of ring) { ax += w.x - v.x; ay += w.y - v.y; az += w.z - v.z }
    const al = Math.hypot(ax, ay, az)
    if (al < 1e-9) continue
    ax /= al; ay /= al; az /= al
    let ux = -ay, uy = ax, uz = 0
    let ul = Math.hypot(ux, uy, uz)
    if (ul < 1e-6) { ux = 1; uy = 0; uz = 0; ul = 1 }
    ux /= ul; uy /= ul; uz /= ul
    const wx = ay * uz - az * uy, wy = az * ux - ax * uz, wz = ax * uy - ay * ux
    ring.sort((p, q) => {
      const pa = Math.atan2(
        (p.x - v.x) * wx + (p.y - v.y) * wy + (p.z - v.z) * wz,
        (p.x - v.x) * ux + (p.y - v.y) * uy + (p.z - v.z) * uz,
      )
      const qa = Math.atan2(
        (q.x - v.x) * wx + (q.y - v.y) * wy + (q.z - v.z) * wz,
        (q.x - v.x) * ux + (q.y - v.y) * uy + (q.z - v.z) * uz,
      )
      return pa - qa
    })
    let di = 0
    let bestF = -Infinity
    fields.forEach((f, fi) => {
      const fv = f(v.x, v.y, v.z)
      if (fv > bestF) { bestF = fv; di = fi }
    })
    for (let t = 0; t < ring.length; t++) {
      emit(v, ring[t], ring[(t + 1) % ring.length], di, v)
    }
  }
  return {
    positions: new Float32Array(pos),
    normals: new Float32Array(nrm),
    colors: new Float32Array(col),
    vertexCount: pos.length / 3,
    touchesBoundary,
  }
}

function emitTet(
  t: [number, number, number, number],
  cx: Float64Array, cy: Float64Array, cz: Float64Array,
  cv: Float64Array, cd: Uint8Array,
  palette: [number, number, number][],
  pos: number[], col: number[], domOr: number,
) {
  const ins: number[] = []
  const outs: number[] = []
  for (const c of t) (cv[c] <= 0 ? ins : outs).push(c)
  if (ins.length === 0 || ins.length === 4) return
  const edge = (a: number, b: number): [number, number, number, number] => {
    const va = cv[a]
    const vb = cv[b]
    const s = va === vb ? 0.5 : va / (va - vb)
    return [
      cx[a] + (cx[b] - cx[a]) * s,
      cy[a] + (cy[b] - cy[a]) * s,
      cz[a] + (cz[b] - cz[a]) * s,
      s < 0.5 ? cd[a] : cd[b],
    ]
  }
  const push = (p: [number, number, number, number]) => {
    pos.push(p[0], p[1], p[2])
    const rgb = palette[p[3]] ?? [0.5, 0.5, 0.5]
    col.push(rgb[0], rgb[1], rgb[2])
  }
  const tri = (p1: ReturnType<typeof edge>, p2: ReturnType<typeof edge>, p3: ReturnType<typeof edge>) => {
    push(p1); push(p2); push(p3)
  }
  if (ins.length === 1) {
    const i = ins[0]
    const [o1, o2, o3] = outs
    tri(edge(i, o1), edge(i, o2), edge(i, o3))
  } else if (ins.length === 3) {
    const o = outs[0]
    const [i1, i2, i3] = ins
    tri(edge(o, i1), edge(o, i3), edge(o, i2))
  } else {
    const [i1, i2] = ins
    const [o1, o2] = outs
    const a = edge(i1, o1)
    const b = edge(i1, o2)
    const c = edge(i2, o1)
    const d = edge(i2, o2)
    tri(a, b, c)
    tri(b, d, c)
  }
  void domOr
}
