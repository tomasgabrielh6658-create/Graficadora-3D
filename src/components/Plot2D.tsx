import { useEffect, useRef, useState } from 'react'
import type { Interval } from '../types'
import { marchingSquares, type MSResult } from '../lib/marchingSquares'

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
  // Los eventos de puntero pueden llegar a >120 Hz: se colapsan a uno por frame
  const rafPending = useRef(0)
  const queuedSweep = useRef<number | null>(null)
  const queuedCursor = useRef<{ x: number; y: number } | null | undefined>(undefined)
  const flushCallbacks = () => {
    rafPending.current = 0
    const p = propsRef.current
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

  // El pan/zoom interno se resetea cuando el padre cambia la vista (auto-encuadre, preset…)
  const viewKey = `${props.view.x0},${props.view.x1},${props.view.y0},${props.view.y1}`
  useEffect(() => setPanView(null), [viewKey])

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

    if (p.geom || p.field) {
      const ms = p.geom ?? marchingSquares(p.field!, x0, x1, y0, y1, 150, 150)
      ctx.fillStyle = p.fill ?? 'rgba(31,59,245,0.16)'
      ctx.beginPath()
      for (let i = 0; i < ms.triCount; i++) {
        const t = i * 6
        const [ax, ay] = toPx(ms.tris[t], ms.tris[t + 1])
        const [bx, by] = toPx(ms.tris[t + 2], ms.tris[t + 3])
        const [cx, cy] = toPx(ms.tris[t + 4], ms.tris[t + 5])
        ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.closePath()
      }
      ctx.fill()
    }

    for (const c of p.curves ?? []) {
      const ms = marchingSquares(c.f, x0, x1, y0, y1, 160, 160)
      ctx.strokeStyle = c.color
      ctx.globalAlpha = 0.28
      ctx.lineWidth = 1.2
      ctx.beginPath()
      for (let i = 0; i < ms.edgeCount; i++) {
        const t = i * 4
        const [ax, ay] = toPx(ms.edges[t], ms.edges[t + 1])
        const [bx, by] = toPx(ms.edges[t + 2], ms.edges[t + 3])
        ctx.moveTo(ax, ay); ctx.lineTo(bx, by)
      }
      ctx.stroke()
      if (c.clip) {
        ctx.globalAlpha = 1
        ctx.lineWidth = 2.4
        ctx.beginPath()
        for (let i = 0; i < ms.edgeCount; i++) {
          const t = i * 4
          const mx = (ms.edges[t] + ms.edges[t + 2]) / 2
          const my = (ms.edges[t + 1] + ms.edges[t + 3]) / 2
          if (c.clip(mx, my) <= 0) {
            const [ax, ay] = toPx(ms.edges[t], ms.edges[t + 1])
            const [bx, by] = toPx(ms.edges[t + 2], ms.edges[t + 3])
            ctx.moveTo(ax, ay); ctx.lineTo(bx, by)
          }
        }
        ctx.stroke()
      }
      ctx.globalAlpha = 1
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
    ctx.fillStyle = '#a0a0ab'
    ctx.font = '9.5px ui-monospace, Consolas, monospace'
    ctx.textAlign = 'right'
    ctx.fillText('rueda = zoom · arrastrar = mover', w - 6, h - 6)
    ctx.textAlign = 'left'
    ctx.strokeStyle = '#e4e4ea'
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1)
    void toMath
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
      setPanView(nv)
      p.onView?.(nv)
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [])

  const sweepDistPx = (px: number, py: number): number => {
    const p = propsRef.current
    const g = geom.current
    if (!p.sweep || !g) return Infinity
    const sxp = g.ox + (p.sweep.pos - p.view.x0) * g.s
    const syp = g.h - (g.oy + (p.sweep.pos - p.view.y0) * g.s)
    return p.sweep.axis === 'v' ? Math.abs(px - sxp) : Math.abs(py - syp)
  }

  return (
    <canvas
      ref={canvasRef}
      className={`h-full w-full touch-none ${props.className ?? ''} cursor-grab`}
      onPointerDown={(e) => {
        const m = evtToMath(e)
        const p = propsRef.current
        if (!m) return
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
          setPanView(nv)
          p.onView?.(nv)
          canvas.style.cursor = 'grabbing'
        } else {
          canvas.style.cursor = sweepDistPx(m.px, m.py) < 12 ? 'grab' : 'grab'
          if (!p.clickToSet) fireCursor({ x: m.x, y: m.y })
        }
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
      }}
      onPointerLeave={() => {
        dragMode.current = null
        fireCursor(null)
      }}
    />
  )
}
