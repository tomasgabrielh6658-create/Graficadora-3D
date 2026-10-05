import { useEffect, useMemo, useRef, useState } from 'react'
import type { PlanReq, PlanRes } from './planners'

let worker: Worker | null = null
let seq = 0
const waiting = new Map<number, (r: { res?: PlanRes; error?: string }) => void>()

function getWorker(): Worker | null {
  if (worker || typeof Worker === 'undefined') return worker
  worker = new Worker(new URL('./plan.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<{ id: number; res?: PlanRes; error?: string }>) => {
    waiting.get(e.data.id)?.(e.data)
    waiting.delete(e.data.id)
  }
  return worker
}

/**
 * Planteo exacto calculado en un Web Worker (no traba los sliders).
 * Devuelve el último resultado y si hay uno nuevo en camino.
 */
export function usePlan(req: PlanReq | null): { plan: PlanRes | null; pending: boolean } {
  const key = useMemo(() => (req ? JSON.stringify(req) : ''), [req])
  const [state, setState] = useState<{ key: string; plan: PlanRes | null }>({ key: '', plan: null })
  const latest = useRef('')
  useEffect(() => {
    latest.current = key
    if (!key) return
    const w = getWorker()
    if (!w) return
    const t = setTimeout(() => {
      const id = ++seq
      waiting.set(id, (r) => {
        if (latest.current === key) setState({ key, plan: r.res ?? null })
      })
      w.postMessage({ id, req: JSON.parse(key) })
    }, 220)
    return () => clearTimeout(t)
  }, [key])
  return { plan: state.plan, pending: state.key !== key }
}
