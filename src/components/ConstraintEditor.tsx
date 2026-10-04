import { useState } from 'react'
import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react'
import { PALETTE, parseConstraint } from '../lib/expr'
import type { RawConstraint } from '../lib/presets'
import { Btn } from './ui'

export function ConstraintEditor({
  raws, setRaws, dims,
}: {
  raws: RawConstraint[]
  setRaws: (v: RawConstraint[] | ((p: RawConstraint[]) => RawConstraint[])) => void
  dims: '2d' | '3d'
}) {
  const [draft, setDraft] = useState('')
  const preview = draft.trim() ? parseConstraint(draft, dims) : null

  const add = () => {
    const p = parseConstraint(draft, dims)
    if (!p.ok) return
    setRaws((rs) => [
      ...rs,
      {
        raw: draft.trim(),
        side: 'le',
        color: PALETTE[rs.length % PALETTE.length],
        visible: true,
      },
    ])
    setDraft('')
  }

  const update = (i: number, patch: Partial<RawConstraint>) =>
    setRaws((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  return (
    <div className="space-y-1.5">
      {raws.map((r, i) => {
        const parsed = parseConstraint(r.raw, dims)
        return (
          <div key={i}>
            <div className="flex items-center gap-1.5">
              <button
                className="h-4 w-4 shrink-0 rounded-full border border-slate-300"
                style={{ background: r.color }}
                title="Cambiar color"
                onClick={() =>
                  update(i, {
                    color: PALETTE[(PALETTE.indexOf(r.color) + 1) % PALETTE.length],
                  })
                }
              />
              <input
                className={`min-w-0 flex-1 rounded border px-1.5 py-1 font-mono text-[11px] ${
                  parsed.ok ? 'border-slate-300' : 'border-rose-400 bg-rose-50'
                }`}
                value={r.raw}
                onChange={(e) => update(i, { raw: e.target.value })}
                spellCheck={false}
              />
              <button
                className="shrink-0 text-slate-400 hover:text-slate-600"
                onClick={() => update(i, { visible: !r.visible })}
                title={r.visible ? 'Ocultar' : 'Mostrar'}
              >
                {r.visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              <button
                className="shrink-0 text-slate-400 hover:text-rose-500"
                onClick={() => setRaws((rs) => rs.filter((_, j) => j !== i))}
                title="Eliminar"
              >
                <Trash2 size={13} />
              </button>
            </div>
            {parsed.ok && parsed.needsSide && parsed.sideOptions && (
              <select
                className="ml-6 mt-1 w-[calc(100%-1.5rem)] rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-[10px] text-slate-600"
                value={r.side}
                onChange={(e) => update(i, { side: e.target.value as 'le' | 'ge' })}
              >
                {parsed.sideOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            )}
            {!parsed.ok && (
              <div className="ml-6 mt-0.5 text-[10px] text-rose-600">{parsed.error}</div>
            )}
          </div>
        )
      })}
      <div className="flex items-center gap-1.5 pt-1">
        <input
          className={`min-w-0 flex-1 rounded border px-1.5 py-1 font-mono text-[11px] ${
            preview && !preview.ok ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
          }`}
          placeholder={dims === '3d' ? 'ej: x^2+y^2 <= 4' : 'ej: y >= x^2'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          spellCheck={false}
        />
        <Btn variant="primary" onClick={add} disabled={!preview?.ok} title="Añadir restricción">
          <Plus size={13} />
        </Btn>
      </div>
      {preview && !preview.ok && (
        <div className="text-[10px] text-rose-600">{preview.error}</div>
      )}
      {preview?.ok && preview.needsSide && (
        <div className="text-[10px] text-sky-700">
          Es una igualdad: tras añadirla elegí qué lado queda adentro de la región.
        </div>
      )}
      <div className="pt-1 text-[10px] leading-snug text-slate-400">
        Variables: {dims === '3d' ? 'x, y, z' : 'x, y'} · Ops: + − * / ^ · sqrt, abs, sin, cos,
        tan, exp, log, min, max, pi, e
      </div>
    </div>
  )
}
