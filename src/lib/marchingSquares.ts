export interface MSResult {
  tris: Float32Array
  triCount: number
  edges: Float32Array
  edgeCount: number
}

export function marchingSquares(
  f: (x: number, y: number) => number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  nx = 160,
  ny = 160,
): MSResult {
  const gw = nx + 1
  const vals = new Float32Array(gw * (ny + 1))
  const dx = (x1 - x0) / nx
  const dy = (y1 - y0) / ny
  for (let j = 0; j <= ny; j++) {
    const y = y0 + dy * j
    for (let i = 0; i <= nx; i++) {
      const v = f(x0 + dx * i, y)
      vals[j * gw + i] = Number.isFinite(v) ? v : 1e30
    }
  }
  const tris: number[] = []
  const edges: number[] = []
  const px = (i: number) => x0 + dx * i
  const py = (j: number) => y0 + dy * j
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const v0 = vals[j * gw + i]
      const v1 = vals[j * gw + i + 1]
      const v2 = vals[(j + 1) * gw + i + 1]
      const v3 = vals[(j + 1) * gw + i]
      const idx = (v0 <= 0 ? 1 : 0) | (v1 <= 0 ? 2 : 0) | (v2 <= 0 ? 4 : 0) | (v3 <= 0 ? 8 : 0)
      if (idx === 0) continue
      const P0x = px(i), P0y = py(j)
      const P1x = px(i + 1), P1y = py(j)
      const P2x = px(i + 1), P2y = py(j + 1)
      const P3x = px(i), P3y = py(j + 1)
      const lerp = (ax: number, ay: number, va: number, bx: number, by: number, vb: number): [number, number] => {
        const t = va === vb ? 0.5 : va / (va - vb)
        return [ax + (bx - ax) * t, ay + (by - ay) * t]
      }
      const e0 = lerp(P0x, P0y, v0, P1x, P1y, v1)
      const e1 = lerp(P1x, P1y, v1, P2x, P2y, v2)
      const e2 = lerp(P2x, P2y, v2, P3x, P3y, v3)
      const e3 = lerp(P3x, P3y, v3, P0x, P0y, v0)
      const tri = (a: [number, number] | number[], b: number[], c: number[]) =>
        tris.push(a[0], a[1], b[0], b[1], c[0], c[1])
      const seg = (a: number[], b: number[]) => edges.push(a[0], a[1], b[0], b[1])
      switch (idx) {
        case 1: tri([P0x, P0y], e0, e3); seg(e0, e3); break
        case 2: tri([P1x, P1y], e1, e0); seg(e0, e1); break
        case 3:
          tri([P0x, P0y], [P1x, P1y], e1); tri([P0x, P0y], e1, e3); seg(e1, e3); break
        case 4: tri([P2x, P2y], e2, e1); seg(e1, e2); break
        case 5:
          tri([P0x, P0y], e0, e3); tri([P2x, P2y], e2, e1)
          seg(e0, e3); seg(e1, e2); break
        case 6:
          tri([P1x, P1y], [P2x, P2y], e2); tri([P1x, P1y], e2, e0); seg(e0, e2); break
        case 7:
          tri([P0x, P0y], [P1x, P1y], [P2x, P2y]); tri([P0x, P0y], [P2x, P2y], e2); tri([P0x, P0y], e2, e3)
          seg(e2, e3); break
        case 8: tri([P3x, P3y], e3, e2); seg(e2, e3); break
        case 9:
          tri([P0x, P0y], e0, e2); tri([P0x, P0y], e2, [P3x, P3y]); seg(e0, e2); break
        case 10:
          tri([P1x, P1y], e1, e0); tri([P3x, P3y], e3, e2)
          seg(e0, e1); seg(e2, e3); break
        case 11:
          tri([P0x, P0y], [P1x, P1y], e1); tri([P0x, P0y], e1, e2); tri([P0x, P0y], e2, [P3x, P3y])
          seg(e1, e2); break
        case 12:
          tri([P3x, P3y], [P2x, P2y], e1); tri([P3x, P3y], e1, e3); seg(e1, e3); break
        case 13:
          tri([P0x, P0y], e0, e1); tri([P0x, P0y], e1, [P2x, P2y]); tri([P0x, P0y], [P2x, P2y], [P3x, P3y])
          seg(e0, e1); break
        case 14:
          tri(e0, [P1x, P1y], [P2x, P2y]); tri(e0, [P2x, P2y], [P3x, P3y]); tri(e0, [P3x, P3y], e3)
          seg(e0, e3); break
        case 15:
          tri([P0x, P0y], [P1x, P1y], [P2x, P2y]); tri([P0x, P0y], [P2x, P2y], [P3x, P3y]); break
      }
    }
  }
  return {
    tris: new Float32Array(tris),
    triCount: tris.length / 6,
    edges: new Float32Array(edges),
    edgeCount: edges.length / 4,
  }
}
