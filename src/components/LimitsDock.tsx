import { useMemo } from 'react'
import katex from 'katex'

export function TeX({ tex, className = '' }: { tex: string; className?: string }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, { throwOnError: false })
    } catch {
      return tex
    }
  }, [tex])
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
}

export function LimitsDock({
  tex, live, warnings, jacobianTex, note,
}: {
  tex: string
  live?: { label: string; value: string; color?: string }[]
  warnings?: string[]
  jacobianTex?: string
  note?: string
}) {
  return (
    <div className="flex items-center gap-6 overflow-x-auto border-t border-slate-200 bg-white px-4 py-2.5">
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Planteo iterado
        </div>
        <TeX tex={tex} className="text-sm" />
        {jacobianTex && (
          <div className="mt-0.5 text-xs text-slate-500">
            <TeX tex={jacobianTex} />
          </div>
        )}
      </div>
      {live && live.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-l border-slate-200 pl-4">
          {live.map((l, i) => (
            <div key={i} className="text-xs">
              <span className="text-slate-500">{l.label}: </span>
              <span className="font-mono font-semibold" style={{ color: l.color ?? '#334155' }}>
                {l.value}
              </span>
            </div>
          ))}
        </div>
      )}
      {warnings?.map((w, i) => (
        <div
          key={i}
          className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800"
        >
          {w}
        </div>
      ))}
      {note && <div className="max-w-xs text-[11px] italic text-slate-400">{note}</div>}
    </div>
  )
}
