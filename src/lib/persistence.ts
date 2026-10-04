import { useCallback, useState } from 'react'

const NS = 'solidoviz-v1:'
const pendingWrites = new Map<string, number>()

// Escritura diferida: durante un arrastre los sliders disparan decenas de
// actualizaciones por segundo; serializar + escribir localStorage en cada una
// congela el hilo. Se guarda el último valor tras una pausa breve.
function persistSoon(key: string, val: unknown) {
  const prev = pendingWrites.get(key)
  if (prev !== undefined) clearTimeout(prev)
  pendingWrites.set(
    key,
    window.setTimeout(() => {
      pendingWrites.delete(key)
      try {
        localStorage.setItem(NS + key, JSON.stringify(val))
      } catch {
        /* almacenamiento lleno o bloqueado */
      }
    }, 250),
  )
}

export function usePersisted<T>(
  key: string,
  init: T,
): [T, (v: T | ((p: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const s = localStorage.getItem(NS + key)
      return s ? (JSON.parse(s) as T) : init
    } catch {
      return init
    }
  })
  const set = useCallback(
    (nv: T | ((p: T) => T)) => {
      setValue((prev) => {
        const val = typeof nv === 'function' ? (nv as (p: T) => T)(prev) : nv
        persistSoon(key, val)
        return val
      })
    },
    [key],
  )
  return [value, set]
}

export function exportAll(): string {
  const out: Record<string, unknown> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith(NS)) {
      try {
        out[k.slice(NS.length)] = JSON.parse(localStorage.getItem(k) ?? 'null')
      } catch {
        /* ignorar */
      }
    }
  }
  return JSON.stringify(out, null, 2)
}

export function importAll(json: string): boolean {
  try {
    const data = JSON.parse(json) as Record<string, unknown>
    for (const [k, v] of Object.entries(data)) {
      localStorage.setItem(NS + k, JSON.stringify(v))
    }
    return true
  } catch {
    return false
  }
}
