import { useEffect, useMemo, useState } from 'react'
import { buildRegion } from '../lib/field'
import { fitBounds2D } from '../lib/autofit'
import { analyzeSweep, sweepRegion } from '../lib/sweeps'
import { compileConstraints, useCompiled } from '../lib/useConstraints'
import { usePersisted } from '../lib/persistence'
import { usePlan } from '../lib/usePlan'
import { PRESETS, presetRaws, type RawConstraint } from '../lib/presets'
import { fmtNum } from '../lib/transforms'
import { Plot2D } from '../components/Plot2D'
import { ConstraintEditor } from '../components/ConstraintEditor'
import { LimitsDock, N, TeX, V, dockStatus, partsNote } from '../components/LimitsDock'
import { PanelTitle, PresetPicker, Section, Segmented, Sidebar, SliderRow } from '../components/ui'
import type { SweepType2D } from '../types'

const DEFAULT_VIEW = { x0: -2, x1: 3, y0: -2, y1: 3 }
const OUTER_C = '#d97706'
const INNER_C = '#0891b2'

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
  const planReq = useMemo(() => ({ kind: 'cart2' as const, raws, inner: sweepAxis }), [raws, sweepAxis])
  const { plan, pending } = usePlan(planReq)

  useEffect(() => {
    if (analysis.outerLo !== null && analysis.outerHi !== null) {
      setPos((p) => Math.min(Math.max(p, analysis.outerLo!), analysis.outerHi!))
    }
  }, [analysis.outerLo, analysis.outerHi])

  const fitTo = (rs: RawConstraint[]) => {
    const r = buildRegion(compileConstraints(rs, '2d').cons)
    const fit = fitBounds2D((x, y) => r.field(x, y, 0))
    if (fit) setView(fit.view)
  }

  const applyPreset = (id: string) => {
    const p = PRESETS.find((q) => q.id === id && q.module === 1)
    if (!p) return
    setPresetId(id)
    const pr = presetRaws(p)
    setRaws(pr)
    if (p.settings?.sweep) setSweep(p.settings.sweep)
    fitTo(pr)
  }

  const activePreset = PRESETS.find((p) => p.id === presetId)
  // field/curves memoizados: Plot2D los usa como deps de su capa estática;
  // si cambian de identidad en cada render se recalcularía el marching squares.
  const field2d = useMemo(() => (x: number, y: number) => region.field(x, y, 0), [region])
  const curves = useMemo(
    () =>
      cons
        .filter((c) => c.visible)
        .map((c) => ({
          f: (x: number, y: number) => c.boundary(x, y, 0),
          color: c.color,
          clip: (x: number, y: number) => region.field(x, y, 0),
        })),
    [cons, region],
  )

  const innerVar = sweepAxis
  const outerVar = outerAxis
  const genericTex = `\\int_{a}^{b}\\!\\int_{g_1(${outerVar})}^{g_2(${outerVar})} f\\,d${innerVar}\\,d${outerVar}`
  const cuts = plan && plan.pieces.length > 1 ? plan.pieces.slice(0, -1).map((p) => p.b) : analysis.breaks

  const warnings: string[] = []
  if (analysis.partitions === 0) warnings.push('No se ve ninguna región: revisá las desigualdades o tocá “encuadrar”.')
  if (analysis.multiInterval) warnings.push(`Una misma recta corta la región en tramos separados: dividila a mano.`)

  const live = hit.intervals.length
    ? [
        <>
          Corte en <V color={OUTER_C}>{outerVar}</V> = <N>{fmtNum(pos, 2)}</N>: <V color={INNER_C}>{innerVar}</V> va de{' '}
          <N>{fmtNum(hit.intervals[0].a, 2)}</N> a <N>{fmtNum(hit.intervals[hit.intervals.length - 1].b, 2)}</N>
        </>,
        <span className="text-[11px] text-mute">
          entra por <span className="text-emerald-700"><TeX tex={hit.entry?.constraint?.latex ?? '?'} /></span>
          {'  ·  '}sale por <span className="text-rose-700"><TeX tex={hit.exit?.constraint?.latex ?? '?'} /></span>
        </span>,
      ]
    : [<span className="text-mute">Mové la recta de corte hasta que toque la región.</span>]

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-visible">
      <Sidebar fig={1}>
        <Section title="Ejemplos">
          <PresetPicker module={1} value={presetId} onChange={applyPreset} />
        </Section>
        <Section title="Región">
          <ConstraintEditor raws={raws} setRaws={setRaws} dims="2d" />
        </Section>
        <Section title="Orden de integración">
          <Segmented
            value={sweep}
            onChange={setSweep}
            options={[
              { value: 'T1', tex: 'dy\\,dx', hint: 'cortes verticales' },
              { value: 'T2', tex: 'dx\\,dy', hint: 'cortes horizontales' },
            ]}
          />
          <div className="mt-3">
            <SliderRow
              label={`Recta de corte: ${outerVar} =`}
              value={pos}
              min={oLo}
              max={oHi}
              step={(oHi - oLo) / 300}
              onChange={setPos}
              fmt={(v) => fmtNum(v, 2)}
              color={OUTER_C}
            />
            <p className="text-[11px] leading-snug text-mute">
              También podés arrastrar la línea violeta en el gráfico.
            </p>
          </div>
        </Section>
      </Sidebar>
      <main className="order-first flex min-h-[55dvh] min-w-0 flex-1 flex-col lg:order-none lg:min-h-0">
        <PanelTitle>Plano xy</PanelTitle>
        <div className="min-h-0 flex-1 p-2">
          <Plot2D
            view={view}
            onView={setView}
            onHome={() => fitTo(raws)}
            field={field2d}
            curves={curves}
            sweep={{ axis: sweep === 'T1' ? 'v' : 'h', pos, intervals: hit.intervals }}
            onSweep={setPos}
            axisLabels={['x', 'y']}
            extras={(ctx, toPx) => {
              ctx.setLineDash([4, 4])
              ctx.strokeStyle = '#f59e0b'
              ctx.lineWidth = 1.2
              for (const br of cuts) {
                const [px, py] = sweep === 'T1' ? toPx(br, view.y0) : toPx(view.x0, br)
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
          tex={plan?.tex || genericTex}
          status={dockStatus(plan, pending)}
          parts={partsNote(plan, outerVar)}
          live={live}
          warnings={warnings}
          note={activePreset?.note}
        />
      </main>
    </div>
  )
}
