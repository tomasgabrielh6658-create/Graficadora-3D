import { useEffect, useRef } from 'react'

type Vec = [number, number, number]
interface Patch {
  f: (u: number, v: number) => Vec
  u: [number, number]
  v: [number, number]
  nu: number
  nv: number
}

const TAU = Math.PI * 2
// De menos a más luz: puntos → operadores → símbolos de cálculo
const RAMP = '.·:-=+×≈π√∞'

const SQ2 = Math.SQRT2
const helado = (s: number, dz: number): Patch[] => [
  { f: (r, t) => [s * r * Math.cos(t), s * r * Math.sin(t), s * r + dz], u: [0, 1], v: [0, TAU], nu: 40, nv: 110 },
  {
    f: (p, t) => [s * SQ2 * Math.sin(p) * Math.cos(t), s * SQ2 * Math.sin(p) * Math.sin(t), s * SQ2 * Math.cos(p) + dz],
    u: [0, Math.PI / 4], v: [0, TAU], nu: 30, nv: 110,
  },
]

export const FIGS: Record<number, { name: string; eq: string; patches: Patch[] }> = {
  1: {
    name: 'campana',
    eq: 'z = e^(−x²−y²)',
    patches: [{
      f: (u, v) => [u * 0.7, v * 0.7, 0.95 * Math.exp(-3 * (u * u + v * v)) - 0.2],
      u: [-1, 1], v: [-1, 1], nu: 90, nv: 90,
    }],
  },
  2: {
    name: 'toro',
    eq: '(r − R)² + z² = a²',
    patches: [{
      f: (t, p) => {
        const q = 0.66 + 0.3 * Math.cos(p)
        return [q * Math.cos(t), q * Math.sin(t), 0.3 * Math.sin(p)]
      },
      u: [0, TAU], v: [0, TAU], nu: 130, nv: 56,
    }],
  },
  3: {
    name: 'paraboloide',
    eq: 'z = x² + y²',
    patches: [
      { f: (r, t) => [0.8 * r * Math.cos(t), 0.8 * r * Math.sin(t), 1.15 * r * r - 0.55], u: [0, 1], v: [0, TAU], nu: 46, nv: 120 },
    ],
  },
  4: { name: 'helado', eq: '√(x²+y²) ≤ z ≤ √(2−x²−y²)', patches: helado(0.9, -0.62) },
}

/** Muestrea las superficies una sola vez: posiciones + normales en espacio objeto. */
function bake(patches: Patch[]) {
  const pts: number[] = []
  const e = 1e-3
  for (const p of patches) {
    for (let i = 0; i <= p.nu; i++) {
      for (let j = 0; j <= p.nv; j++) {
        const u = p.u[0] + ((p.u[1] - p.u[0]) * i) / p.nu
        const v = p.v[0] + ((p.v[1] - p.v[0]) * j) / p.nv
        const a = p.f(u, v)
        const du = p.f(u + e, v)
        const dv = p.f(u, v + e)
        const ux = du[0] - a[0], uy = du[1] - a[1], uz = du[2] - a[2]
        const vx = dv[0] - a[0], vy = dv[1] - a[1], vz = dv[2] - a[2]
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
        const l = Math.hypot(nx, ny, nz) || 1
        nx /= l; ny /= l; nz /= l
        pts.push(a[0], a[1], a[2], nx, ny, nz)
      }
    }
  }
  return new Float32Array(pts)
}

const L = (() => {
  const v = [-0.45, -0.7, 0.55]
  const l = Math.hypot(...v)
  return v.map((c) => c / l) as Vec
})()

function draw(data: Float32Array, spin: number, tilt: number, W: number, H: number, zb: Float32Array, out: number[]) {
  zb.fill(0)
  out.fill(-1)
  const ca = Math.cos(spin), sa = Math.sin(spin)
  const cb = Math.cos(tilt), sb = Math.sin(tilt)
  const kx = W * 1.12
  const ky = kx / 1.9
  for (let k = 0; k < data.length; k += 6) {
    const x = data[k], y = data[k + 1], z = data[k + 2]
    const x1 = x * ca - y * sa
    const y1 = x * sa + y * ca
    const y2 = y1 * cb - z * sb
    const z2 = y1 * sb + z * cb
    const ooz = 1 / (3 + y2)
    const sx = Math.round(W / 2 + kx * ooz * x1)
    const sy = Math.round(H / 2 - ky * ooz * z2)
    if (sx < 0 || sx >= W || sy < 0 || sy >= H) continue
    const idx = sy * W + sx
    if (ooz <= zb[idx]) continue
    zb[idx] = ooz
    const nx = data[k + 3], ny = data[k + 4], nz = data[k + 5]
    const n1x = nx * ca - ny * sa
    const n1y = nx * sa + ny * ca
    const n2y = n1y * cb - nz * sb
    const n2z = n1y * sb + nz * cb
    const lum = Math.abs(n1x * L[0] + n2y * L[1] + n2z * L[2])
    out[idx] = Math.min(RAMP.length - 1, Math.floor(Math.pow(lum, 1.35) * RAMP.length))
  }
  let s = ''
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const v = out[r * W + c]
      s += v < 0 ? ' ' : RAMP[v]
    }
    if (r < H - 1) s += '\n'
  }
  return s
}

/**
 * Sólido que gira dibujado con caracteres. Escribe directo al DOM (sin re-render de React),
 * corre a ~15 fps y se detiene cuando no está a la vista, la pestaña está oculta
 * o el sistema pide reducir movimiento.
 */
export function AsciiSolid({
  fig, cols = 48, rows = 22, className = '',
}: {
  fig: number
  cols?: number
  rows?: number
  className?: string
}) {
  const ref = useRef<HTMLPreElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const data = bake((FIGS[fig] ?? FIGS[3]).patches)
    const zb = new Float32Array(cols * rows)
    const out = new Array<number>(cols * rows)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let spin = 0.7
    let raf = 0
    let last = 0
    let inView = true
    const paint = (t: number) => {
      el.textContent = draw(data, spin, 0.42 + 0.1 * Math.sin(t / 2600), cols, rows, zb, out)
    }
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame)
      if (t - last < 66) return
      last = t
      spin += 0.04
      paint(t)
    }
    const start = () => {
      if (!raf && !reduce && inView && !document.hidden) raf = requestAnimationFrame(frame)
    }
    const stop = () => {
      cancelAnimationFrame(raf)
      raf = 0
    }
    paint(0)
    const io = new IntersectionObserver(([e]) => {
      inView = e.isIntersecting
      if (inView) start()
      else stop()
    })
    io.observe(el)
    const onVis = () => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', onVis)
    start()
    return () => {
      stop()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [fig, cols, rows])
  return (
    <pre
      ref={ref}
      aria-hidden
      className={`select-none overflow-hidden font-mono leading-[1.08] ${className}`}
    />
  )
}

/** Tarjeta "fig. 0N" estilo lámina: textura de puntos, sólido ASCII y su ecuación. */
export function AsciiFigure({ fig }: { fig: number }) {
  const f = FIGS[fig] ?? FIGS[3]
  return (
    <figure className="m-0">
      <div className="dots relative border border-line bg-white">
        <div className="absolute inset-x-0 top-0 flex justify-between px-2 pt-1.5 font-mono text-[9px] uppercase tracking-wider">
          <span className="bg-white px-0.5 text-cobalt">fig. 0{fig}</span>
          <span className="bg-white px-0.5 text-mute">{f.name}.</span>
        </div>
        <AsciiSolid fig={fig} className="px-2 pb-2 pt-5 text-center text-[9.5px] text-cobalt" />
        <span className="absolute bottom-1 right-1.5 font-mono text-[9px] text-cobalt/60">✦</span>
      </div>
      <figcaption className="mt-1.5 flex items-center justify-between gap-2 font-mono text-[9.5px] text-mute">
        <span className="truncate">{f.eq}</span>
        <span className="shrink-0 text-ink/40">∫∫∫ dV</span>
      </figcaption>
    </figure>
  )
}
