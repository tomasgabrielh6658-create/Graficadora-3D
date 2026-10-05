import { useMemo, useState, type ReactNode } from 'react'
import katex from 'katex'
import { Check, Copy, Loader2, TriangleAlert } from 'lucide-react'

export function TeX({ tex, className = '', block = false }: { tex: string; className?: string; block?: boolean }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, { throwOnError: false, displayMode: block })
    } catch {
      return tex
    }
  }, [tex, block])
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
}

/** Variable con su color (el mismo que en el gráfico y en la integral). */
export function V({ children, color }: { children: ReactNode; color: string }) {
  return <span className="font-serif text-[13px] italic font-semibold" style={{ color }}>{children}</span>
}

/** Número para las frases en vivo. */
export function N({ children }: { children: ReactNode }) {
  return <span className="font-mono font-semibold text-ink">{children}</span>
}

type PlanLike = { exact: boolean; innerSplit?: boolean; pieces: { to: { tex: string } }[] } | null

export function dockStatus(plan: PlanLike, pending: boolean): 'exact' | 'approx' | 'pending' {
  if (pending || !plan) return 'pending'
  return plan.exact ? 'exact' : 'approx'
}

/** "Hay que partir la región en x = 2/3" cuando el planteo tiene varios tramos. */
export function partsNote(plan: PlanLike, outerTex: string): ReactNode {
  if (!plan || plan.pieces.length < 2) return null
  const cuts = plan.pieces.slice(0, -1).map((p) => `${outerTex} = ${p.to.tex}`)
  return (
    <>
      La región se parte en {plan.pieces.length} integrales, cortando en{' '}
      {cuts.map((c, i) => (
        <span key={i}>
          {i > 0 && (i === cuts.length - 1 ? ' y ' : ', ')}
          <TeX tex={c} />
        </span>
      ))}
      .
    </>
  )
}

export function LimitsDock({
  tex, status, parts, live, warnings, note,
}: {
  tex: string
  /** 'exact' = todos los límites con fórmula; 'approx' = alguno numérico; 'pending' = calculando */
  status: 'exact' | 'approx' | 'pending'
  /** texto de partición, p. ej. "Hay que partir en x = 2/3" */
  parts?: ReactNode
  live?: ReactNode[]
  warnings?: string[]
  note?: string
}) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    const plain = tex.replace(/\\textcolor\{[^}]*\}\{([^}]*)\}/g, '$1').replace(/\{ ([a-z])\}/g, '{$1}')
    navigator.clipboard?.writeText(plain).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    })
  }
  const badge =
    status === 'pending' ? (
      <span className="inline-flex items-center gap-1 text-mute"><Loader2 size={10} className="animate-spin" /> calculando</span>
    ) : status === 'exact' ? (
      <span className="inline-flex items-center gap-1 text-emerald-600" title="Todos los límites tienen fórmula exacta, verificada contra el gráfico">
        <Check size={11} /> exacta
      </span>
    ) : (
      <span className="text-amber-600" title="Algún límite no tiene una fórmula simple: se muestra su valor aproximado">≈ con valores aproximados</span>
    )
  return (
    <div className="flex shrink-0 flex-col border-t border-ink bg-white sm:flex-row sm:items-stretch sm:overflow-x-auto">
      <div className="flex min-w-0 shrink-0 flex-col justify-center border-b border-line px-4 py-2.5 sm:border-b-0 sm:border-r">
        <div className="mb-1 flex items-center gap-3 font-mono text-[10px] uppercase tracking-wider">
          <span className="text-cobalt">la integral</span>
          <span className="normal-case tracking-normal">{badge}</span>
          <button
            onClick={copy}
            disabled={!tex}
            title="Copiar en LaTeX (para Word, Overleaf, el TP…)"
            className={`ml-auto inline-flex items-center gap-1 border px-1.5 py-px normal-case tracking-normal transition-colors ${
              copied ? 'border-emerald-500 text-emerald-600' : 'border-line text-mute hover:border-cobalt hover:text-cobalt'
            }`}
          >
            {copied ? <Check size={10} /> : <Copy size={10} />} {copied ? 'copiado' : 'copiar LaTeX'}
          </button>
        </div>
        <div className={`overflow-x-auto transition-opacity ${status === 'pending' ? 'opacity-50' : ''}`}>
          {tex ? <TeX tex={tex} className="text-[16px] text-ink" /> : <span className="text-xs text-mute">Agregá desigualdades que encierren una región.</span>}
        </div>
        {parts && <div className="mt-1 text-[11px] text-cobalt">{parts}</div>}
      </div>
      {live && live.length > 0 && (
        <div className="flex flex-col justify-center gap-1 px-4 py-2 text-xs text-ink/80 sm:min-w-[220px]">
          {live.map((l, i) => (
            <div key={i} className="sm:whitespace-nowrap">{l}</div>
          ))}
        </div>
      )}
      {(warnings?.length || note) && (
        <div className="flex max-w-sm shrink-0 flex-col justify-center gap-1 border-t border-line px-4 py-2 sm:ml-auto sm:border-l sm:border-t-0">
          {warnings?.map((w, i) => (
            <div key={i} className="flex items-center gap-1.5 border-l-2 border-amber-500 bg-amber-50 px-2 py-0.5 text-xs text-amber-900">
              <TriangleAlert size={12} className="shrink-0" /> {w}
            </div>
          ))}
          {note && <div className="text-[11px] italic text-mute">{note}</div>}
        </div>
      )}
    </div>
  )
}
