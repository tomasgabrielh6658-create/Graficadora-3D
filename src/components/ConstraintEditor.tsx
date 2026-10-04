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
    <div className="space-y-1">
      {raws.map((r, i) => {
        const parsed = parseConstraint(r.raw, dims)
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
                onClick={() =>
                  update(i, {
                    color: PALETTE[(PALETTE.indexOf(r.color) + 1) % PALETTE.length],
                  })
                }
              />
              <span className="flex w-6 shrink-0 items-center justify-center font-mono text-[9.5px] text-mute">
                {i + 1}
              </span>
              <input
                className="min-w-0 flex-1 bg-transparent py-1.5 pr-1 font-mono text-[12px] outline-none"
                value={r.raw}
                onChange={(e) => update(i, { raw: e.target.value })}
                spellCheck={false}
              />
              <button
                className="shrink-0 px-1 text-mute hover:text-ink"
                onClick={() => update(i, { visible: !r.visible })}
                title={r.visible ? 'Ocultar' : 'Mostrar'}
              >
                {r.visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              <button
                className="shrink-0 px-1.5 text-mute hover:text-rose-600"
                onClick={() => setRaws((rs) => rs.filter((_, j) => j !== i))}
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
            {!parsed.ok && (
              <div className="mt-0.5 text-[10.5px] text-rose-600">{parsed.error}</div>
            )}
          </div>
        )
      })}
      <div className="flex items-stretch gap-1 pt-1">
        <input
          className={`min-w-0 flex-1 border border-dashed px-2 py-1.5 font-mono text-[12px] outline-none focus:border-solid ${
            preview && !preview.ok ? 'border-rose-400 bg-rose-50' : 'border-ink/30 focus:border-cobalt'
          }`}
          placeholder={dims === '3d' ? 'nueva: x^2+y^2 <= 4' : 'nueva: y >= x^2'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          spellCheck={false}
        />
        <Btn variant="primary" onClick={add} disabled={!preview?.ok} title="Añadir restricción (Enter)">
          <Plus size={14} />
        </Btn>
      </div>
      {preview && !preview.ok && (
        <div className="text-[10.5px] text-rose-600">{preview.error}</div>
      )}
      {preview?.ok && preview.needsSide && (
        <div className="text-[10.5px] text-cobalt">
          Es una igualdad: tras añadirla elegí qué lado queda adentro de la región.
        </div>
      )}
      <div className="pt-1 font-mono text-[10px] leading-relaxed text-mute">
        vars {dims === '3d' ? 'x y z' : 'x y'} · ops + − * / ^ · sqrt abs sin cos tan exp log min max pi e
      </div>
    </div>
  )
}
