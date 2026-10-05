import { useEffect, useRef, useState } from 'react'
import { Maximize, Minus, Plus } from 'lucide-react'
import type { Interval } from '../types'
import { LOW_POWER } from '../lib/lowpower'
import { marchingSquares, type MSResult } from '../lib/marchingSquares'

// Densidad del marching squares: en dispositivos débiles baja ~2x el cómputo.
const MS_FILL = LOW_POWER ? 100 : 150
const MS_CURVE = LOW_POWER ? 110 : 160
// La capa estática cubre STATIC_MARGIN× la vista visible: pans y zooms chicos
// quedan dentro del bitmap y se blitean sin recalcular el marching squares.
const STATIC_MARGIN = 1.5

function expand(v: Props['view'], m: number): Props['view'] {
  const cx = (v.x0 + v.x1) / 2
  const cy = (v.y0 + v.y1) / 2
  const hx = ((v.x1 - v.x0) * m) / 2
  const hy = ((v.y1 - v.y0) * m) / 2
  return { x0: cx - hx, x1: cx + hx, y0: cy - hy, y1: cy + hy }
}

/** ¿La vista actual sigue cubierta por la capa estática? (centro cerca y escala similar) */
function covered(st: { view: Props['view'] } | null, v: Props['view']): boolean {
  if (!st) return false
  const sv = st.view
  const sw = sv.x1 - sv.x0
  const sh = sv.y1 - sv.y0
  if (Math.abs((v.x0 + v.x1) / 2 - (sv.x0 + sv.x1) / 2) > sw * 0.25) return false
  if (Math.abs((v.y0 + v.y1) / 2 - (sv.y0 + sv.y1) / 2) > sh * 0.25) return false
  const cw = v.x1 - v.x0
  const ch = v.y1 - v.y0
  if (cw < sw * 0.5 || cw > sw * 1.1 || ch < sh * 0.5 || ch > sh * 1.1) return false
  return true
}

export interface CurveSpec {
  f: (x: number, y: number) => number
  color: string
  label?: string
  clip?: (x: number, y: number) => number
}

export interface SweepSpec {
  axis: 'h' | 'v'
  pos: number
  intervals: Interval[]
}

export interface Mark {
  x: number
  y: number
  color: string
  label?: string
}

interface Props {
  view: { x0: number; x1: number; y0: number; y1: number }
  field?: ((x: number, y: number) => number) | null
  geom?: MSResult | null
  fill?: string
  curves?: CurveSpec[]
  sweep?: SweepSpec | null
  marks?: Mark[]
  cursor?: { x: number; y: number } | null
  onCursor?: (p: { x: number; y: number } | null) => void
  onSweep?: (pos: number) => void
  extras?: (ctx: CanvasRenderingContext2D, toPx: (x: number, y: number) => [number, number]) => void
  axisLabels?: [string, string]
  fmtX?: (v: number) => string
  fmtY?: (v: number) => string
  className?: string
  showGrid?: boolean
  clickToSet?: boolean
  onView?: (v: { x0: number; x1: number; y0: number; y1: number }) => void
  /** botón "encuadrar": si no se pasa, vuelve a la vista original */
  onHome?: () => void
  /** nombres para la lectura de coordenadas del cursor */
  coordNames?: [string, string]
}

function niceStep(range: number, target = 6): number {
  const raw = range / target
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * mag) return m * mag
  return 10 * mag
}

export function Plot2D(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [panView, setPanView] = useState<Props['view'] | null>(null)
  const effView = panView ?? props.view
  const propsRef = useRef(props)
  propsRef.current = { ...props, view: effView }
  const dragMode = useRef<null | 'sweep' | 'pan'>(null)
  const startPt = useRef<{ px: number; py: number; view: Props['view'] } | null>(null)
  const geom = useRef<{ s: number; ox: number; oy: number; w: number; h: number } | null>(null)
  // Capa estática offscreen: la región y las curvas (marching squares, lo caro)
  // se dibujan una sola vez; durante el arrastre solo se reubica la imagen.
  const staticRef = useRef<{
    cv: HTMLCanvasElement
    view: Props['view']
    w: number
    h: number
    dpr: number
  } | null>(null)
  const staticDeps = useRef<readonly unknown[] | null>(null)
  const interacting = useRef(false)
  const settleTimer = useRef(0)
  // Tras soltar el arrastre la capa se redibuja ~50 ms después: el blit cubre
  // el gap y la UI no se congela en el instante del release.
  const pendingCrisp = useRef(false)
  const crispTimer = useRef(0)
  const committedRef = useRef(props.view)
  committedRef.current = props.view
  // Los eventos de puntero pueden llegar a >120 Hz: se colapsan a uno por frame
  const rafPending = useRef(0)
  const queuedSweep = useRef<number | null>(null)
  const queuedCursor = useRef<{ x: number; y: number } | null | undefined>(undefined)
  const queuedView = useRef<Props['view'] | null>(null)
  const flushCallbacks = () => {
    rafPending.current = 0
    const p = propsRef.current
    if (queuedView.current) {
      setPanView(queuedView.current)
      queuedView.current = null
    }
    if (queuedSweep.current !== null) {
      p.onSweep?.(queuedSweep.current)
      queuedSweep.current = null
    }
    if (queuedCursor.current !== undefined) {
      p.onCursor?.(queuedCursor.current)
      queuedCursor.current = undefined
    }
  }
  const fireSweep = (pos: number) => {
    queuedSweep.current = pos
    if (!rafPending.current) rafPending.current = requestAnimationFrame(flushCallbacks)
  }
  const fireCursor = (pt: { x: number; y: number } | null) => {
    queuedCursor.current = pt
    if (!rafPending.current) rafPending.current = requestAnimationFrame(flushCallbacks)
  }
  const fireView = (v: Props['view']) => {
    queuedView.current = v
    if (!rafPending.current) rafPending.current = requestAnimationFrame(flushCallbacks)
  }

  // El pan/zoom interno se resetea cuando el padre cambia la vista (auto-encuadre, preset…)
  const viewKey = `${props.view.x0},${props.view.x1},${props.view.y0},${props.view.y1}`
  useEffect(() => {
    queuedView.current = null
    setPanView(null)
  }, [viewKey])

  // Región + curvas sobre un canvas aparte: se reutiliza como imagen durante
  // el arrastre y solo se recalcula al soltar, cambiar de tamaño o cambiar
  // los datos (identidad de field/geom/curves/fill).
  const renderStatic = (p: Props, v: Props['view'], w: number, h: number, dpr: number) => {
    let st = staticRef.current
    if (!st || st.w !== w || st.h !== h || st.dpr !== dpr) {
      st = { cv: document.createElement('canvas'), view: v, w, h, dpr }
      staticRef.current = st
    }
    st.view = { ...v }
    st.cv.width = Math.round(w * dpr)
    st.cv.height = Math.round(h * dpr)
    const c2 = st.cv.getContext('2d')
    if (!c2) return
    c2.setTransform(dpr, 0, 0, dpr, 0, 0)
    c2.clearRect(0, 0, w, h)
    const pad = 8
    const s = Math.min((w - 2 * pad) / (v.x1 - v.x0), (h - 2 * pad) / (v.y1 - v.y0))
    const ox = (w - s * (v.x1 - v.x0)) / 2
    const oy = (h - s * (v.y1 - v.y0)) / 2
    const toPx = (x: number, y: number): [number, number] => [
      ox + (x - v.x0) * s,
      h - (oy + (y - v.y0) * s),
    ]
    if (p.geom || p.field) {
      const ms =
        p.geom ??
        marchingSquares(p.field!, v.x0, v.x1, v.y0, v.y1, Math.round(MS_FILL * STATIC_MARGIN), Math.round(MS_FILL * STATIC_MARGIN))
      c2.fillStyle = p.fill ?? 'rgba(31,59,245,0.16)'
      c2.beginPath()
      for (let i = 0; i < ms.triCount; i++) {
        const t = i * 6
        const [ax, ay] = toPx(ms.tris[t], ms.tris[t + 1])
        const [bx, by] = toPx(ms.tris[t + 2], ms.tris[t + 3])
        const [cx, cy] = toPx(ms.tris[t + 4], ms.tris[t + 5])
        c2.moveTo(ax, ay)
        c2.lineTo(bx, by)
        c2.lineTo(cx, cy)
        c2.closePath()
      }
      c2.fill()
    }
    for (const c of p.curves ?? []) {
      const ms = marchingSquares(c.f, v.x0, v.x1, v.y0, v.y1, Math.round(MS_CURVE * STATIC_MARGIN), Math.round(MS_CURVE * STATIC_MARGIN))
      c2.strokeStyle = c.color
      c2.globalAlpha = 0.28
      c2.lineWidth = 1.2
      c2.beginPath()
      for (let i = 0; i < ms.edgeCount; i++) {
        const t = i * 4
        const [ax, ay] = toPx(ms.edges[t], ms.edges[t + 1])
        const [bx, by] = toPx(ms.edges[t + 2], ms.edges[t + 3])
        c2.moveTo(ax, ay)
        c2.lineTo(bx, by)
      }
      c2.stroke()
      if (c.clip) {
        c2.globalAlpha = 1
        c2.lineWidth = 2.4
        c2.beginPath()
        for (let i = 0; i < ms.edgeCount; i++) {
          const t = i * 4
          const mx = (ms.edges[t] + ms.edges[t + 2]) / 2
          const my = (ms.edges[t + 1] + ms.edges[t + 3]) / 2
          if (c.clip(mx, my) <= 0) {
            const [ax, ay] = toPx(ms.edges[t], ms.edges[t + 1])
            const [bx, by] = toPx(ms.edges[t + 2], ms.edges[t + 3])
            c2.moveTo(ax, ay)
            c2.lineTo(bx, by)
          }
        }
        c2.stroke()
      }
      c2.globalAlpha = 1
    }
  }

  const draw = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const p = propsRef.current
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (w === 0 || h === 0) return
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    const { x0, x1, y0, y1 } = p.view
    const pad = 8
    const s = Math.min((w - 2 * pad) / (x1 - x0), (h - 2 * pad) / (y1 - y0))
    const ox = (w - s * (x1 - x0)) / 2
    const oy = (h - s * (y1 - y0)) / 2
    geom.current = { s, ox, oy, w, h }
    const toPx = (x: number, y: number): [number, number] => [
      ox + (x - x0) * s,
      h - (oy + (y - y0) * s),
    ]
    const toMath = (px: number, py: number): { x: number; y: number } => ({
      x: x0 + (px - ox) / s,
      y: y0 + (h - py - oy) / s,
    })

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)

    if (p.showGrid !== false) {
      const step = niceStep(Math.max(x1 - x0, y1 - y0))
      ctx.strokeStyle = '#efeff3'
      ctx.lineWidth = 1
      ctx.font = '10px ui-monospace, Consolas, monospace'
      ctx.fillStyle = '#8a8a96'
      for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
        const [px] = toPx(x, 0)
        ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke()
        const label = (p.fmtX ?? ((v) => String(Math.round(v * 100) / 100)))(x)
        ctx.fillText(label, px + 2, h - 4)
      }
      for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
        const [, py] = toPx(0, y)
        ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke()
        const label = (p.fmtY ?? ((v) => String(Math.round(v * 100) / 100)))(y)
        ctx.fillText(label, 3, py - 2)
      }
      ctx.strokeStyle = '#0b0b10'
      ctx.lineWidth = 1.1
      if (y0 <= 0 && y1 >= 0) {
        const [, py] = toPx(0, 0)
        ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke()
      }
      if (x0 <= 0 && x1 >= 0) {
        const [px] = toPx(0, 0)
        ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke()
      }
      if (p.axisLabels) {
        ctx.fillStyle = '#0b0b10'
        ctx.font = 'italic 13px serif'
        ctx.fillText(p.axisLabels[0], w - 12, toPx(0, 0)[1] - 4 < 14 ? 14 : toPx(0, 0)[1] - 4)
        ctx.fillText(p.axisLabels[1], toPx(0, 0)[0] + 6, 12)
      }
    }

    // Capa estática: región + curvas rasterizadas sobre una vista 1.5x más
    // grande que la visible — los pans/zooms chicos quedan cubiertos por el
    // blit y no recalculan nada; solo se re-renderiza al salir de la zona.
    const deps = [p.field, p.geom, p.curves, p.fill]
    const prevDeps = staticDeps.current
    const depsChanged = !prevDeps || deps.some((d, i) => d !== prevDeps[i])
    if (depsChanged) staticDeps.current = deps
    let st = staticRef.current
    const sizeOk = !!st && st.w === w && st.h === h && st.dpr === dpr
    if (!sizeOk || depsChanged || (!interacting.current && !pendingCrisp.current && !covered(st, p.view))) {
      renderStatic(p, expand(p.view, STATIC_MARGIN), w, h, dpr)
      st = staticRef.current
    }
    if (st) {
      const sv = st.view
      const sS = Math.min((st.w - 2 * pad) / (sv.x1 - sv.x0), (st.h - 2 * pad) / (sv.y1 - sv.y0))
      const oxS = (st.w - sS * (sv.x1 - sv.x0)) / 2
      const oyS = (st.h - sS * (sv.y1 - sv.y0)) / 2
      const k = s / sS
      ctx.save()
      // recortar al rectángulo de la vista: el margen extra de la capa (1.5x)
      // no debe derramar en el letterbox del canvas
      ctx.beginPath()
      ctx.rect(ox, oy, s * (x1 - x0), s * (y1 - y0))
      ctx.clip()
      ctx.translate(ox - k * oxS + s * (sv.x0 - x0), k * oyS - oy + s * (y0 - sv.y0) + h * (1 - k))
      ctx.scale(k, k)
      ctx.drawImage(st.cv, 0, 0, st.w, st.h)
      ctx.restore()
    }

    const sw = p.sweep
    if (sw && sw.intervals.length) {
      for (const iv of sw.intervals) {
        const [ax, ay] = sw.axis === 'v' ? toPx(sw.pos, iv.a) : toPx(iv.a, sw.pos)
        const [bx, by] = sw.axis === 'v' ? toPx(sw.pos, iv.b) : toPx(iv.b, sw.pos)
        ctx.strokeStyle = '#a855f7'
        ctx.lineWidth = 2.5
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke()
        const dx = bx - ax
        const dy = by - ay
        const len = Math.hypot(dx, dy) || 1
        const ux = dx / len
        const uy = dy / len
        const hs = 7
        ctx.fillStyle = '#a855f7'
        ctx.beginPath()
        ctx.moveTo(bx + ux * 2, by + uy * 2)
        ctx.lineTo(bx - uy * hs * 0.5 - ux * hs, by + ux * hs * 0.5 - uy * hs)
        ctx.lineTo(bx + uy * hs * 0.5 - ux * hs, by - ux * hs * 0.5 - uy * hs)
        ctx.closePath(); ctx.fill()
        ctx.fillStyle = '#16a34a'
        ctx.beginPath(); ctx.arc(ax, ay, 4.5, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#dc2626'
        ctx.beginPath(); ctx.arc(bx, by, 4.5, 0, Math.PI * 2); ctx.fill()
      }
      ctx.setLineDash([5, 4])
      ctx.strokeStyle = '#a855f799'
      ctx.lineWidth = 1
      ctx.beginPath()
      if (sw.axis === 'v') {
        const [px] = toPx(sw.pos, 0)
        ctx.moveTo(px, 0); ctx.lineTo(px, h)
      } else {
        const [, py] = toPx(0, sw.pos)
        ctx.moveTo(0, py); ctx.lineTo(w, py)
      }
      ctx.stroke()
      ctx.setLineDash([])
      // mango arrastrable al final de la línea guía
      const hx = sw.axis === 'v' ? toPx(sw.pos, 0)[0] : w - 16
      const hy = sw.axis === 'v' ? h - 16 : toPx(0, sw.pos)[1]
      ctx.fillStyle = '#a855f7'
      ctx.beginPath(); ctx.arc(hx, hy, 6, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.stroke()
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(hx - 2.5, hy - 2); ctx.lineTo(hx - 2.5, hy + 2)
      ctx.moveTo(hx + 2.5, hy - 2); ctx.lineTo(hx + 2.5, hy + 2)
      ctx.stroke()
    }

    for (const m of p.marks ?? []) {
      const [px, py] = toPx(m.x, m.y)
      ctx.fillStyle = m.color
      ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke()
      if (m.label) {
        ctx.fillStyle = '#0b0b10'
        ctx.font = '10px ui-monospace, monospace'
        ctx.fillText(m.label, px + 6, py - 6)
      }
    }

    if (p.cursor) {
      const [px, py] = toPx(p.cursor.x, p.cursor.y)
      ctx.strokeStyle = '#1f3bf5'
      ctx.lineWidth = 1.4
      ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(px - 9, py); ctx.lineTo(px + 9, py); ctx.moveTo(px, py - 9); ctx.lineTo(px, py + 9); ctx.stroke()
    }

    p.extras?.(ctx, toPx)
    ctx.strokeStyle = '#e4e4ea'
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1)
    void toMath
  }

  // Fin de la interacción: redibuja la capa estática nítida en la vista final
  // y avisa la vista al padre una sola vez (no en cada movimiento del drag).
  const endInteraction = () => {
    window.clearTimeout(settleTimer.current)
    if (!interacting.current) return
    interacting.current = false
    if (queuedView.current) {
      propsRef.current = { ...propsRef.current, view: queuedView.current }
      setPanView(queuedView.current)
      queuedView.current = null
    }
    // Blit inmediato en la vista final; el re-render nítido se agenda ~50 ms
    // después para no bloquear el primer input tras soltar.
    pendingCrisp.current = true
    draw()
    const p = propsRef.current
    const v = p.view
    const cv = committedRef.current
    if (p.onView && (v.x0 !== cv.x0 || v.x1 !== cv.x1 || v.y0 !== cv.y0 || v.y1 !== cv.y1)) {
      p.onView(v)
    }
    window.clearTimeout(crispTimer.current)
    crispTimer.current = window.setTimeout(() => {
      pendingCrisp.current = false
      draw()
    }, 50)
  }
  // Marca "interactuando" y pospone el settle (rueda del mouse / botones).
  const poke = () => {
    interacting.current = true
    window.clearTimeout(settleTimer.current)
    settleTimer.current = window.setTimeout(endInteraction, 170)
  }

  useEffect(() => {
    draw()
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(draw)
    ro.observe(canvas)
    return () => ro.disconnect()
  })

  const evtToMath = (e: React.PointerEvent | WheelEvent) => {
    const g = geom.current
    const canvas = canvasRef.current
    if (!g || !canvas) return null
    const rect = canvas.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const p = propsRef.current
    return {
      x: p.view.x0 + (px - g.ox) / g.s,
      y: p.view.y0 + (g.h - py - g.oy) / g.s,
      px, py,
    }
  }

  // Zoom con rueda anclado al cursor (listener nativo: React pasa wheel como passive)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const m = evtToMath(e)
      if (!m) return
      const p = propsRef.current
      const f = Math.exp(e.deltaY * 0.0012)
      const v = p.view
      const nv = {
        x0: m.x - (m.x - v.x0) * f,
        x1: m.x + (v.x1 - m.x) * f,
        y0: m.y - (m.y - v.y0) * f,
        y1: m.y + (v.y1 - m.y) * f,
      }
      fireView(nv)
      poke()
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      canvas.removeEventListener('wheel', onWheel)
      window.clearTimeout(settleTimer.current)
      window.clearTimeout(crispTimer.current)
      cancelAnimationFrame(rafPending.current)
    }
  }, [])

  const sweepDistPx = (px: number, py: number): number => {
    const p = propsRef.current
    const g = geom.current
    if (!p.sweep || !g) return Infinity
    const sxp = g.ox + (p.sweep.pos - p.view.x0) * g.s
    const syp = g.h - (g.oy + (p.sweep.pos - p.view.y0) * g.s)
    return p.sweep.axis === 'v' ? Math.abs(px - sxp) : Math.abs(py - syp)
  }

  const coordRef = useRef<HTMLDivElement>(null)
  const showCoord = (m: { x: number; y: number } | null) => {
    const el = coordRef.current
    if (!el) return
    if (!m) {
      el.style.opacity = '0'
      return
    }
    const [a, b] = props.coordNames ?? props.axisLabels ?? ['x', 'y']
    const f = (v: number) => (Math.round(v * 100) / 100).toFixed(2)
    el.textContent = `${a} = ${f(m.x)}   ${b} = ${f(m.y)}`
    el.style.opacity = '1'
  }
  const zoomBy = (f: number) => {
    const v = propsRef.current.view
    const cx = (v.x0 + v.x1) / 2, cy = (v.y0 + v.y1) / 2
    const nv = { x0: cx - (cx - v.x0) * f, x1: cx + (v.x1 - cx) * f, y0: cy - (cy - v.y0) * f, y1: cy + (v.y1 - cy) * f }
    fireView(nv)
    poke()
  }
  const home = () => {
    queuedView.current = null
    interacting.current = false
    pendingCrisp.current = false
    window.clearTimeout(settleTimer.current)
    window.clearTimeout(crispTimer.current)
    setPanView(null)
    props.onHome?.()
  }
  const tool = 'grid h-7 w-7 place-items-center text-ink hover:bg-cobalt hover:text-white'
  return (
    <div className="relative h-full w-full">
    <div className="absolute right-2 top-2 z-10 flex flex-col border border-line bg-white/95 shadow-[2px_2px_0_0_rgba(11,11,16,0.06)] [&>*+*]:border-t [&>*+*]:border-line">
      <button className={tool} title="Acercar (o rueda del mouse)" onClick={() => zoomBy(0.8)}><Plus size={14} /></button>
      <button className={tool} title="Alejar" onClick={() => zoomBy(1.25)}><Minus size={14} /></button>
      <button className={tool} title="Encuadrar la región" onClick={home}><Maximize size={13} /></button>
    </div>
    <div ref={coordRef} className="pointer-events-none absolute bottom-2 left-2 z-10 whitespace-pre border border-line bg-white/95 px-1.5 py-0.5 font-mono text-[10.5px] text-ink opacity-0 transition-opacity" />
    <canvas
      ref={canvasRef}
      className={`h-full w-full touch-none ${props.className ?? ''} cursor-grab`}
      onPointerDown={(e) => {
        const m = evtToMath(e)
        const p = propsRef.current
        if (!m) return
        interacting.current = true
        window.clearTimeout(settleTimer.current)
        startPt.current = { px: m.px, py: m.py, view: { ...p.view } }
        if (p.sweep && p.onSweep && sweepDistPx(m.px, m.py) < 12) {
          dragMode.current = 'sweep'
          fireSweep(p.sweep.axis === 'v' ? m.x : m.y)
        } else {
          dragMode.current = 'pan'
        }
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const m = evtToMath(e)
        const p = propsRef.current
        const canvas = canvasRef.current
        if (!m || !canvas) return
        if (dragMode.current === 'sweep' && p.sweep && p.onSweep) {
          fireSweep(p.sweep.axis === 'v' ? m.x : m.y)
          canvas.style.cursor = p.sweep.axis === 'v' ? 'ew-resize' : 'ns-resize'
        } else if (dragMode.current === 'pan' && startPt.current) {
          const g = geom.current!
          const dx = (m.px - startPt.current.px) / g.s
          const dy = (m.py - startPt.current.py) / g.s
          const sv = startPt.current.view
          const nv = { x0: sv.x0 - dx, x1: sv.x1 - dx, y0: sv.y0 + dy, y1: sv.y1 + dy }
          fireView(nv)
          canvas.style.cursor = 'grabbing'
        } else {
          canvas.style.cursor = p.sweep && p.onSweep && sweepDistPx(m.px, m.py) < 12 ? (p.sweep.axis === 'v' ? 'ew-resize' : 'ns-resize') : 'grab'
          if (!p.clickToSet) fireCursor({ x: m.x, y: m.y })
        }
        showCoord(m)
      }}
      onPointerUp={(e) => {
        const m = evtToMath(e)
        const p = propsRef.current
        const wasPan = dragMode.current === 'pan'
        dragMode.current = null
        if (canvasRef.current) canvasRef.current.style.cursor = 'grab'
        if (wasPan && m && startPt.current && p.clickToSet) {
          const moved = Math.hypot(m.px - startPt.current.px, m.py - startPt.current.py)
          if (moved < 4) fireCursor({ x: m.x, y: m.y })
        }
        startPt.current = null
        endInteraction()
      }}
      onPointerCancel={() => {
        dragMode.current = null
        startPt.current = null
        endInteraction()
      }}
      onPointerLeave={() => {
        dragMode.current = null
        fireCursor(null)
        showCoord(null)
        endInteraction()
      }}
    />
    </div>
  )
}
