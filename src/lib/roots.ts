import type { Interval } from '../types'

function refineBoundary(f: (t: number) => number, tOut: number, tIn: number): number {
  let a = tOut
  let b = tIn
  for (let i = 0; i < 40; i++) {
    const mid = (a + b) / 2
    if (f(mid) <= 0) b = mid
    else a = mid
  }
  return (a + b) / 2
}

export function intervalsLe0(
  f: (t: number) => number,
  lo: number,
  hi: number,
  samples = 400,
): Interval[] {
  const res: Interval[] = []
  const step = (hi - lo) / samples
  let prevT = lo
  let prevV = f(lo)
  let open: number | null = prevV <= 0 ? lo : null
  for (let i = 1; i <= samples; i++) {
    const t = lo + step * i
    const v = f(t)
    const inside = v <= 0
    // La bisección trata NaN como "afuera", así que también refina bordes de
    // dominio (p. ej. √x con x < 0) en lugar de quedarse a un paso de grilla.
    if (inside && open === null) {
      open = refineBoundary(f, prevT, t)
    } else if (!inside && open !== null) {
      const end = refineBoundary(f, t, prevT)
      res.push({ a: open, b: end })
      open = null
    }
    prevT = t
    prevV = v
  }
  if (open !== null) res.push({ a: open, b: hi })
  // Contactos tangentes (p. ej. f=0 exacto en un punto) producen intervalos de
  // longitud ~0 que ensucian la flecha y el conteo de integrales: se descartan.
  return res.filter((iv) => iv.b - iv.a > 1e-7)
}
