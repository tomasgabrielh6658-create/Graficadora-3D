import { useEffect, useMemo, useState } from 'react'
import { buildRegion } from '../lib/field'
import { fitBounds2D } from '../lib/autofit'
import { analyzeSweep, sweepRegion } from '../lib/sweeps'
import { compileConstraints, useCompiled } from '../lib/useConstraints'
import { usePersisted } from '../lib/persistence'
import { PRESETS, presetRaws, type RawConstraint } from '../lib/presets'
import { fmtNum } from '../lib/transforms'
import { Plot2D } from '../components/Plot2D'
import { ConstraintEditor } from '../components/ConstraintEditor'
import { LimitsDock, TeX } from '../components/LimitsDock'
import { Btn, Section, Select, SliderRow } from '../components/ui'
import { Scan } from 'lucide-react'
import type { SweepType2D } from '../types'

const DEFAULT_VIEW = { x0: -2, x1: 3, y0: -2, y1: 3 }

export default function Module1() {
  const preset = PRESETS.find((p) => p.id === 'm1-parab-recta')!
  const [raws, setRaws] = usePersisted<RawConstraint[]>('m1.cons', presetRaws(preset))
  const [sweep, setSweep] = usePersisted<SweepType2D>('m1.sweep', 'T1')
  const [view, setView] = usePersisted('m1.view', DEFAULT_VIEW)
  const [pos, setPos] = useState(0.5)
  const [presetId, setPresetId] = usePersisted('m1.preset', 'm1-parab-recta')

  const { cons } = useCompiled(raws, '2d')
  const region = useMemo(() => buildRegion(cons), [cons])

  const sweepAxis = sweep === 'T1' ? ('y' as const) : ('x' as const)
  const outerAxis = sweep === 'T1' ? ('x' as const) : ('y' as const)
  const [sLo, sHi] = sweep === 'T1' ? [view.y0, view.y1] : [view.x0, view.x1]
  const [oLo, oHi] = sweep === 'T1' ? [view.x0, view.x1] : [view.y0, view.y1]

  const analysis = useMemo(
    () => analyzeSweep(region, sweepAxis, outerAxis, { x: 0, y: 0, z: 0 }, oLo, oHi, sLo, sHi),
    [region, sweepAxis, outerAxis, oLo, oHi, sLo, sHi],
  )
  const hit = useMemo(
    () => sweepRegion(region, sweepAxis, { x: pos, y: pos, z: 0 }, sLo, sHi),
    [region, sweepAxis, pos, sLo, sHi],
  )

  useEffect(() => {
    if (analysis.outerLo !== null && analysis.outerHi !== null) {
      setPos((p) => Math.min(Math.max(p, analysis.outerLo!), analysis.outerHi!))
    }
  }, [analysis.outerLo, analysis.outerHi])

  const applyPreset = (id: string) => {
    const p = PRESETS.find((q) => q.id === id && q.module === 1)
    if (!p) return
    setPresetId(id)
    const pr = presetRaws(p)
    setRaws(pr)
    if (p.settings?.sweep) setSweep(p.settings.sweep)
    if (p.bbox) {
      setView({ x0: p.bbox.x0 ?? -2, x1: p.bbox.x1 ?? 3, y0: p.bbox.y0 ?? -2, y1: p.bbox.y1 ?? 3 })
    } else {
      const fit = fitBounds2D((x, y) => buildRegion(compileConstraints(pr, '2d').cons).field(x, y, 0))
      if (fit) setView(fit.view)
    }
    setPos((view.x0 + view.x1) / 2)
  }

  const autoFit = () => {
    const fit = fitBounds2D((x, y) => region.field(x, y, 0))
    if (fit) setView(fit.view)
  }

  const activePreset = PRESETS.find((p) => p.id === presetId)
  const curves = cons
    .filter((c) => c.visible)
    .map((c) => ({
      f: (x: number, y: number) => c.boundary(x, y, 0),
      color: c.color,
      clip: (x: number, y: number) => region.field(x, y, 0),
    }))

  const innerVar = sweep === 'T1' ? 'y' : 'x'
  const outerVar = sweep === 'T1' ? 'x' : 'y'
  const diffs = sweep === 'T1'
    ? '\\textcolor{#0891b2}{dy}\\,\\textcolor{#d97706}{dx}'
    : '\\textcolor{#d97706}{dx}\\,\\textcolor{#0891b2}{dy}'
  const a = analysis.outerLo
  const b = analysis.outerHi
  const tex = `\\int_{${a !== null ? fmtNum(a) : 'a'}}^{${b !== null ? fmtNum(b) : 'b'}}\\!\\int_{g_1(${outerVar})}^{g_2(${outerVar})} f\\,${diffs}`

  const warnings: string[] = []
  if (analysis.partitions === 0) warnings.push('La región está vacía dentro del viewport')
  else if (analysis.partitions > 1)
    warnings.push(`La región requiere ${analysis.partitions} integrales en el orden ${diffs.replace(/\\textcolor\{[^}]*\}\{([^}]*)\}/g, '$1').replace(/\\/g, '')}`)
  if (analysis.multiInterval) warnings.push('El barrido corta la región en tramos separados')

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="w-[330px] shrink-0 overflow-y-auto border-r border-slate-200 bg-white">
        <Section title="Ejercicios típicos">
          <Select
            value={PRESETS.some((p) => p.id === presetId && p.module === 1) ? presetId : ''}
            onChange={applyPreset}
            options={[
              { value: '', label: '— Elegir preset —' },
              ...PRESETS.filter((p) => p.module === 1).map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        </Section>
        <Section title="Fronteras de la región">
          <ConstraintEditor raws={raws} setRaws={setRaws} dims="2d" />
        </Section>
        <Section title="Orden de barrido">
          <div className="flex gap-2">
            <Btn
              variant={sweep === 'T1' ? 'primary' : 'default'}
              onClick={() => setSweep('T1')}
              className="flex-1 justify-center"
            >
              T1 · vertical (dy dx)
            </Btn>
            <Btn
              variant={sweep === 'T2' ? 'primary' : 'default'}
              onClick={() => setSweep('T2')}
              className="flex-1 justify-center"
            >
              T2 · horizontal (dx dy)
            </Btn>
          </div>
          <div className="mt-3">
            <SliderRow
              label={`Posición de barrido (${outerVar})`}
              value={pos}
              min={oLo}
              max={oHi}
              step={(oHi - oLo) / 300}
              onChange={setPos}
              fmt={(v) => fmtNum(v)}
            />
          </div>
        </Section>
        <Section title="Viewport">
          <Btn onClick={autoFit} className="mb-2 w-full justify-center" title="Encuadra la vista a la región automáticamente">
            <Scan size={13} /> Encuadrar región
          </Btn>
          <div className="grid grid-cols-2 gap-1.5">
            {(['x0', 'x1', 'y0', 'y1'] as const).map((k) => (
              <label key={k} className="flex items-center gap-1 text-[11px] text-slate-500">
                {k}
                <input
                  type="number"
                  step={0.5}
                  className="w-full rounded border border-slate-300 px-1 py-0.5 font-mono text-[11px]"
                  value={view[k]}
                  onChange={(e) => setView({ ...view, [k]: Number(e.target.value) })}
                />
              </label>
            ))}
          </div>
        </Section>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 p-2">
          <Plot2D
            view={view}
            onView={setView}
            field={(x, y) => region.field(x, y, 0)}
            curves={curves}
            sweep={{ axis: sweep === 'T1' ? 'v' : 'h', pos, intervals: hit.intervals }}
            onSweep={setPos}
            axisLabels={[outerVar === 'x' ? 'x' : 'x', 'y']}
            extras={(ctx, toPx) => {
              ctx.setLineDash([4, 4])
              ctx.strokeStyle = '#f59e0b'
              ctx.lineWidth = 1.2
              for (const br of analysis.breaks) {
                const [px, py] =
                  sweep === 'T1' ? toPx(br, view.y0) : toPx(view.x0, br)
                ctx.beginPath()
                if (sweep === 'T1') {
                  ctx.moveTo(px, 0)
                  ctx.lineTo(px, ctx.canvas.clientHeight)
                } else {
                  ctx.moveTo(0, py)
                  ctx.lineTo(ctx.canvas.clientWidth, py)
                }
                ctx.stroke()
              }
              ctx.setLineDash([])
            }}
          />
        </div>
        <LimitsDock
          tex={tex}
          live={[
            ...(a !== null && b !== null
              ? [{ label: `${outerVar} ∈`, value: `[${fmtNum(a)}, ${fmtNum(b)}]`, color: '#d97706' }]
              : []),
            ...(hit.intervals.length
              ? [
                  {
                    label: `${innerVar} ∈`,
                    value: `[${fmtNum(hit.intervals[0].a)}, ${fmtNum(hit.intervals[hit.intervals.length - 1].b)}]`,
                    color: '#0891b2',
                  },
                ]
              : [{ label: `${innerVar}`, value: 'fuera de la región', color: '#94a3b8' }]),
            ...(hit.entry?.constraint
              ? [{ label: 'entra por', value: hit.entry.constraint.raw, color: '#16a34a' }]
              : []),
            ...(hit.exit?.constraint
              ? [{ label: 'sale por', value: hit.exit.constraint.raw, color: '#dc2626' }]
              : []),
          ]}
          warnings={warnings}
          note={activePreset?.note}
        />
        {activePreset?.limitsTex && (
          <div className="border-t border-slate-100 bg-slate-50 px-4 py-1 text-[11px] text-slate-500">
            Referencia del TP: <TeX tex={activePreset.limitsTex} />
          </div>
        )}
      </main>
    </div>
  )
}
