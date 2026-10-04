import { useMemo } from 'react'
import katex from 'katex'
import { TriangleAlert } from 'lucide-react'

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
    <div className="flex shrink-0 items-stretch overflow-x-auto border-t border-ink bg-white">
      <div className="flex min-w-0 shrink-0 flex-col justify-center border-r border-line px-4 py-2">
        <div className="mb-0.5 font-mono text-[9.5px] uppercase tracking-wider text-cobalt">planteo iterado</div>
        <TeX tex={tex} className="text-[15px] text-ink" />
        {jacobianTex && (
          <div className="mt-0.5 text-xs text-mute">
            <TeX tex={jacobianTex} />
          </div>
        )}
      </div>
      {live && live.length > 0 && (
        <div className="flex flex-wrap content-center items-center gap-1.5 px-4 py-2">
          {live.map((l, i) => (
            <div key={i} className="flex items-center border border-line text-xs">
              <span className="border-r border-line bg-paper px-1.5 py-0.5 text-[11px] text-mute">{l.label}</span>
              <span className="px-1.5 py-0.5 font-mono font-semibold" style={{ color: l.color ?? 'var(--color-ink)' }}>
                {l.value}
              </span>
            </div>
          ))}
        </div>
      )}
      {(warnings?.length || note) && (
        <div className="ml-auto flex shrink-0 flex-col justify-center gap-1 border-l border-line px-4 py-2">
          {warnings?.map((w, i) => (
            <div key={i} className="flex items-center gap-1.5 border-l-2 border-amber-500 bg-amber-50 px-2 py-0.5 text-xs text-amber-900">
              <TriangleAlert size={12} className="shrink-0" /> {w}
            </div>
          ))}
          {note && <div className="max-w-xs text-[11px] italic text-mute">{note}</div>}
        </div>
      )}
    </div>
  )
}
