import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, Plus, Redo2, Trash2, Undo2 } from 'lucide-react'
import { PALETTE, parseConstraint } from '../lib/expr'
import type { RawConstraint } from '../lib/presets'
import { TeX } from './LimitsDock'
import { Btn } from './ui'

const isTyping = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('input, select, textarea, [contenteditable]')

export function ConstraintEditor({
  raws, setRaws, dims,
}: {
  raws: RawConstraint[]
  setRaws: (v: RawConstraint[] | ((p: RawConstraint[]) => RawConstraint[])) => void
  dims: '2d' | '3d'
}) {
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const preview = draft.trim() ? parseConstraint(draft, dims) : null

  // Historial para deshacer/rehacer. Las ediciones de texto seguidas sobre la
  // misma fila se agrupan en un solo paso (como en GeoGebra).
  const past = useRef<RawConstraint[][]>([])
  const future = useRef<RawConstraint[][]>([])
  const lastKey = useRef<{ key: string; t: number } | null>(null)
  const [, force] = useState(0)
  const current = useRef(raws)
  current.current = raws

  const apply = (next: RawConstraint[], key?: string) => {
    const now = Date.now()
    const coalesce = key && lastKey.current?.key === key && now - lastKey.current.t < 1200
    if (!coalesce) {
      past.current.push(current.current)
      if (past.current.length > 80) past.current.shift()
    }
    future.current = []
    lastKey.current = key ? { key, t: now } : null
    setRaws(next)
    force((n) => n + 1)
  }
  const undo = () => {
    const prev = past.current.pop()
    if (!prev) return
    future.current.push(current.current)
    lastKey.current = null
    setRaws(prev)
    force((n) => n + 1)
  }
  const redo = () => {
    const nxt = future.current.pop()
    if (!nxt) return
    past.current.push(current.current)
    lastKey.current = null
    setRaws(nxt)
    force((n) => n + 1)
  }
  const undoRef = useRef({ undo, redo })
  undoRef.current = { undo, redo }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || isTyping(e.target)) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault()
        undoRef.current.undo()
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault()
        undoRef.current.redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const add = () => {
    const p = parseConstraint(draft, dims)
    if (!p.ok) return
    apply([...raws, { raw: draft.trim(), side: 'le', color: PALETTE[raws.length % PALETTE.length], visible: true }])
    setDraft('')
  }
  const update = (i: number, patch: Partial<RawConstraint>, key?: string) =>
    apply(raws.map((r, j) => (j === i ? { ...r, ...patch } : r)), key)

  return (
    <div className="space-y-1">
      <div className="-mt-1 mb-1 flex items-center justify-between">
        <span className="text-[11px] text-mute">Una desigualdad por fila. Click en una para editarla.</span>
        <span className="flex">
          <button className="grid h-6 w-6 place-items-center text-mute hover:text-ink disabled:opacity-30" onClick={undo} disabled={!past.current.length} title="Deshacer (Ctrl+Z)"><Undo2 size={13} /></button>
          <button className="grid h-6 w-6 place-items-center text-mute hover:text-ink disabled:opacity-30" onClick={redo} disabled={!future.current.length} title="Rehacer (Ctrl+Y)"><Redo2 size={13} /></button>
        </span>
      </div>
      {raws.map((r, i) => {
        const parsed = parseConstraint(r.raw, dims)
        const tex = parsed.ok && parsed.build ? parsed.build(r.side).latex : null
        const isEditing = editing === i || !parsed.ok
        return (
          <div key={i}>
            <div
              className={`group flex items-stretch border ${
                parsed.ok ? 'border-line focus-within:border-cobalt hover:border-ink/40' : 'border-rose-400 bg-rose-50'
              } ${r.visible ? '' : 'opacity-50'}`}
            >
              <button
                className="w-1.5 shrink-0"
                style={{ background: r.color }}
                title="Cambiar color"
                onClick={() => update(i, { color: PALETTE[(PALETTE.indexOf(r.color) + 1) % PALETTE.length] })}
              />
              <span className="flex w-6 shrink-0 items-center justify-center font-mono text-[9.5px] text-mute">{i + 1}</span>
              {isEditing ? (
                <input
                  autoFocus={editing === i}
                  className="min-w-0 flex-1 bg-transparent py-1.5 pr-1 font-mono text-[12px] outline-none"
                  value={r.raw}
                  onChange={(e) => update(i, { raw: e.target.value }, `text-${i}`)}
                  onBlur={() => setEditing(null)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && (e.target as HTMLInputElement).blur()}
                  spellCheck={false}
                />
              ) : (
                <button
                  className="min-w-0 flex-1 truncate py-1 pr-1 text-left text-[13px] text-ink"
                  onClick={() => setEditing(i)}
                  title={`${r.raw} — click para editar`}
                >
                  <TeX tex={tex ?? r.raw} />
                </button>
              )}
              <button
                className="shrink-0 px-1 text-mute hover:text-ink"
                onClick={() => update(i, { visible: !r.visible })}
                title={r.visible ? 'Ocultar (no cuenta para la región)' : 'Mostrar'}
              >
                {r.visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              <button
                className="shrink-0 px-1.5 text-mute hover:text-rose-600"
                onClick={() => apply(raws.filter((_, j) => j !== i))}
                title="Eliminar"
              >
                <Trash2 size={13} />
              </button>
            </div>
            {parsed.ok && parsed.needsSide && parsed.sideOptions && (
              <select
                className="mt-0.5 w-full border border-line bg-paper px-1 py-0.5 text-[10.5px] text-ink/80"
                value={r.side}
                onChange={(e) => update(i, { side: e.target.value as 'le' | 'ge' })}
              >
                {parsed.sideOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            )}
            {!parsed.ok && <div className="mt-0.5 text-[10.5px] text-rose-600">{parsed.error}</div>}
          </div>
        )
      })}
      <div className="flex items-stretch gap-1 pt-1">
        <input
          className={`min-w-0 flex-1 border border-dashed px-2 py-1.5 font-mono text-[12px] outline-none focus:border-solid ${
            preview && !preview.ok ? 'border-rose-400 bg-rose-50' : 'border-ink/30 focus:border-cobalt'
          }`}
          placeholder={dims === '3d' ? 'agregar: x^2+y^2 <= 4' : 'agregar: y >= x^2'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          spellCheck={false}
        />
        <Btn variant="primary" onClick={add} disabled={!preview?.ok} title="Agregar (Enter)">
          <Plus size={14} />
        </Btn>
      </div>
      {preview?.ok && preview.build && (
        <div className="text-[12px] text-mute">
          vista previa: <TeX tex={preview.previewTex ?? preview.build('le').latex} />
        </div>
      )}
      {preview && !preview.ok && <div className="text-[10.5px] text-rose-600">{preview.error}</div>}
      {preview?.ok && preview.needsSide && (
        <div className="text-[10.5px] text-cobalt">Es una igualdad: después de agregarla elegí qué lado queda adentro.</div>
      )}
      <details className="pt-1 text-[10.5px] text-mute">
        <summary className="cursor-pointer select-none hover:text-ink">¿Cómo escribo?</summary>
        <div className="mt-1 space-y-0.5 font-mono leading-relaxed">
          <div>potencia: x^2 · raíz: sqrt(x) · producto: 2*x</div>
          <div>comparar: &lt;= &gt;= = · variables: {dims === '3d' ? 'x y z' : 'x y'}</div>
          <div>sin cos tan exp log abs min max pi e</div>
        </div>
      </details>
    </div>
  )
}
