/**
 * Teclado matemático tipo GeoGebra: panel anclado abajo de la ventana que
 * escribe en el último input marcado con [data-math] que tuvo el foco.
 * Las teclas usan onPointerDown+preventDefault para no robar el foco.
 */

let open = false
const subs = new Set<() => void>()

export const mathKb = {
  subscribe: (fn: () => void) => {
    subs.add(fn)
    return () => subs.delete(fn)
  },
  get: () => open,
  set(v: boolean) {
    if (open === v) return
    open = v
    subs.forEach((f) => f())
  },
  toggle: () => mathKb.set(!open),
}
export const toggleMathKb = () => mathKb.toggle()

let target: HTMLInputElement | null = null

if (typeof document !== 'undefined') {
  document.addEventListener('focusin', (e) => {
    const el = e.target
    if (el instanceof HTMLInputElement && 'math' in el.dataset) {
      target = el
      // En táctil el teclado se abre solo, como en GeoGebra.
      if (window.matchMedia('(pointer: coarse)').matches) mathKb.set(true)
    }
  })
}

const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!

function commit(el: HTMLInputElement, next: string, pos: number) {
  valueSetter.call(el, next)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  requestAnimationFrame(() => {
    el.focus()
    try {
      el.setSelectionRange(pos, pos)
    } catch {
      /* inputs numéricos no tienen selección */
    }
  })
}

function active(): HTMLInputElement | null {
  return target && document.contains(target) ? target : null
}

export function insertMath(text: string) {
  const el = active()
  if (!el) return
  const s = el.selectionStart ?? el.value.length
  const e = el.selectionEnd ?? el.value.length
  // `|` dentro del token marca dónde queda el cursor (ej: "abs(|)")
  const marker = text.indexOf('|')
  const ins = marker >= 0 ? text.replace('|', '') : text
  const pos = s + (marker >= 0 ? marker : ins.length)
  commit(el, el.value.slice(0, s) + ins + el.value.slice(e), pos)
}

export function mathBackspace() {
  const el = active()
  if (!el) return
  const s = el.selectionStart ?? 0
  const e = el.selectionEnd ?? 0
  if (s === e && s === 0) return
  const ns = s === e ? s - 1 : s
  commit(el, el.value.slice(0, ns) + el.value.slice(e), ns)
}

export function mathMoveCaret(d: -1 | 1) {
  const el = active()
  if (!el) return
  const pos = Math.min(el.value.length, Math.max(0, (el.selectionStart ?? el.value.length) + d))
  el.focus()
  try {
    el.setSelectionRange(pos, pos)
  } catch {
    /* nada */
  }
}
