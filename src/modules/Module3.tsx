import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { buildRegion } from '../lib/field'
import { buildRegionMesh } from '../lib/regionMesh'
import { bounds2D, planeRanges, shadowField } from '../lib/shadow'
import { sweepRegion } from '../lib/sweeps'
import { intervalsLe0 } from '../lib/roots'
import { marchingSquares } from '../lib/marchingSquares'
import { compileConstraints, useCompiled } from '../lib/useConstraints'
import { fitBounds3D } from '../lib/autofit'
import { usePersisted } from '../lib/persistence'
import { usePlan } from '../lib/usePlan'
import { PRESETS, presetRaws, type RawConstraint } from '../lib/presets'
import { fmtNum } from '../lib/transforms'
import { ORDER_INFO, type BBox, type IntegrationOrder3D } from '../types'
import { Plot2D } from '../components/Plot2D'
import { Arrow3D, Label3D, Scene3D, Solid } from '../components/Scene3D'
import { ConstraintEditor } from '../components/ConstraintEditor'
import { LimitsDock, N, TeX, V, dockStatus, partsNote } from '../components/LimitsDock'
import { Btn, BoxEditor, PanelHint, PanelTitle, PresetPicker, Section, Segmented, Sidebar, SliderRow, Toggle } from '../components/ui'
import { Scan } from 'lucide-react'

const DEFAULT_BBOX: BBox = { x0: -2.6, x1: 2.6, y0: -2.6, y1: 2.6, z0: -0.5, z1: 4.6 }
const OUTER_C = '#d97706'
const MID_C = '#0891b2'
const INNER_C = '#a855f7'

const PLANE_AXES: Record<'xy' | 'yz' | 'xz', ['x' | 'y' | 'z', 'x' | 'y' | 'z']> = {
  xy: ['x', 'y'],
  yz: ['y', 'z'],
  xz: ['x', 'z'],
}

export default function Module3() {
  const preset = PRESETS.find((p) => p.id === 'm3-parab-plano')!
  const [raws, setRaws] = usePersisted<RawConstraint[]>('m3.cons', presetRaws(preset))
  const [order, setOrder] = usePersisted<IntegrationOrder3D>('m3.order', 'dz_dy_dx')
  const [bbox, setBbox] = usePersisted<BBox>('m3.bbox', DEFAULT_BBOX)
  const [opacity, setOpacity] = usePersisted('m3.opacity', 0.45)
  const [wire, setWire] = usePersisted('m3.wire', false)
  const [showSurf, setShowSurf] = usePersisted('m3.surfaces', false)
  const [presetId, setPresetId] = usePersisted('m3.preset', 'm3-parab-plano')
  const [uv, setUv] = useState<{ u: number; v: number }>({ u: 0.8, v: 0.6 })
  const [outerPos, setOuterPos] = useState(0.8)

  const deferredRaws = useDeferredValue(raws)
  const { cons } = useCompiled(deferredRaws, '3d')
  const region = useMemo(() => buildRegion(cons), [cons])

  const info = ORDER_INFO[order]
  const [hAxis, vAxis] = PLANE_AXES[info.plane]
  const ranges = planeRanges(bbox, info.plane)

  const mesh = useMemo(() => {
    const act = cons.filter((c) => c.visible)
    return buildRegionMesh(act.map((c) => c.field), act.map((c) => c.color), bbox, 36)
  }, [cons, bbox])

  // Cada superficie frontera dibujada "virgen" (sin cortar por las demás),
  // como las muestra GeoGebra — estilo F(x,y,z)=0 completa dentro del viewport.
  const surfMeshes = useMemo(
    () => (showSurf ? cons.filter((c) => c.visible).map((c) => buildRegionMesh([c.field], [c.color], bbox, 34)) : []),
    [cons, bbox, showSurf],
  )

  const sf = useMemo(
    () => shadowField(region.cons.map((c) => c.field), info.pierce, ranges.t0, ranges.t1),
    [region, info.pierce, ranges.t0, ranges.t1],
  )
  const shadowGeom = useMemo(
    () => marchingSquares(sf, ranges.u0, ranges.u1, ranges.v0, ranges.v1, 90, 90),
    [sf, ranges.u0, ranges.u1, ranges.v0, ranges.v1],
  )
  const shadowBounds = useMemo(
    () => bounds2D(sf, ranges.u0, ranges.u1, ranges.v0, ranges.v1, 40),
    [sf, ranges.u0, ranges.u1, ranges.v0, ranges.v1],
  )

  const toPoint = (u: number, v: number, t: number) => {
    const p = { x: 0, y: 0, z: 0 }
    p[hAxis] = u
    p[vAxis] = v
    p[info.pierce] = t
    return p
  }
  // El punto y el barrido pesado se computan sobre valores diferidos:
  // el marcador se mueve al instante y la flecha lo alcanza un frame después.
  const duv = useDeferredValue(uv)
  const dOuterPos = useDeferredValue(outerPos)

  const pierceHit = useMemo(
    () => sweepRegion(region, info.pierce, toPoint(duv.u, duv.v, 0), ranges.t0, ranges.t1),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [region, info.pierce, duv.u, duv.v, ranges.t0, ranges.t1],
  )

  const midIsH = info.mid === hAxis
  const shadowSweepIntervals = useMemo(() => {
    if (midIsH) return intervalsLe0((u) => sf(u, dOuterPos), ranges.u0, ranges.u1)
    return intervalsLe0((v) => sf(dOuterPos, v), ranges.v0, ranges.v1)
  }, [sf, midIsH, dOuterPos, ranges.u0, ranges.u1, ranges.v0, ranges.v1])

  const outerRange = midIsH
    ? shadowBounds ? [shadowBounds.vLo, shadowBounds.vHi] : null
    : shadowBounds ? [shadowBounds.uLo, shadowBounds.uHi] : null

  useEffect(() => {
    if (outerRange) setOuterPos((p) => Math.min(Math.max(p, outerRange[0]), outerRange[1]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outerRange?.[0], outerRange?.[1]])

  const planReq = useMemo(() => ({ kind: 'cart3' as const, raws, order }), [raws, order])
  const { plan, pending } = usePlan(planReq)

  const fitTo = (rs: RawConstraint[]) => {
    const fit = fitBounds3D(buildRegion(compileConstraints(rs, '3d').cons).field)
    if (fit) setBbox(fit.bbox)
  }
  const applyPreset = (id: string) => {
    const p = PRESETS.find((q) => q.id === id && q.module === 3)
    if (!p) return
    setPresetId(id)
    const pr = presetRaws(p)
    setRaws(pr)
    if (p.settings?.order) setOrder(p.settings.order)
    if (p.bbox) setBbox({ ...DEFAULT_BBOX, ...p.bbox })
    else fitTo(pr)
    setUv({ u: 0.4, v: 0.4 })
  }
  const activePreset = PRESETS.find((p) => p.id === presetId)

  const entry = pierceHit.entry
  const exit = pierceHit.exit
  const arrowFrom: [number, number, number] | null = entry && exit ? (() => { const a = toPoint(uv.u, uv.v, entry.t); return [a.x, a.y, a.z] })() : null
  const arrowTo: [number, number, number] | null = entry && exit ? (() => { const a = toPoint(uv.u, uv.v, exit.t); return [a.x, a.y, a.z] })() : null

  const outerVar = info.outer
  const midVar = info.mid
  const genericTex = `\\int_{a}^{b}\\!\\int_{g_1(${outerVar})}^{g_2(${outerVar})}\\!\\int_{k_1}^{k_2} f\\,d${info.pierce}\\,d${midVar}\\,d${outerVar}`

  const warnings: string[] = []
  if (mesh.vertexCount === 0) warnings.push('No se ve ningún sólido: revisá las desigualdades o tocá “encuadrar”.')
  else if (mesh.touchesBoundary) warnings.push('El sólido llega al borde del dibujo: puede que le falte una tapa (no está acotado).')
  if (pierceHit.intervals.length > 1) warnings.push(`La flecha atraviesa el sólido ${pierceHit.intervals.length} veces: en este orden hay que dividirlo.`)
  if (plan?.innerSplit) warnings.push(`Según dónde esté la flecha, entra o sale por superficies distintas: este orden necesita partir el sólido. Probá otro orden.`)

  const live = [
    shadowSweepIntervals.length ? (
      <>
        Corte en <V color={OUTER_C}>{outerVar}</V> = <N>{fmtNum(outerPos, 2)}</N>: <V color={MID_C}>{midVar}</V> va de{' '}
        <N>{fmtNum(shadowSweepIntervals[0].a, 2)}</N> a <N>{fmtNum(shadowSweepIntervals[shadowSweepIntervals.length - 1].b, 2)}</N>
      </>
    ) : (
      <span className="text-mute">El corte en {outerVar} = {fmtNum(outerPos, 2)} no toca la sombra.</span>
    ),
    entry && exit ? (
      <>
        Flecha en ({hAxis}, {vAxis}) = (<N>{fmtNum(uv.u, 2)}</N>, <N>{fmtNum(uv.v, 2)}</N>): <V color={INNER_C}>{info.pierce}</V> va de{' '}
        <N>{fmtNum(entry.t, 2)}</N> a <N>{fmtNum(exit.t, 2)}</N>
      </>
    ) : (
      <span className="text-mute">La flecha no atraviesa el sólido: hacé click dentro de la sombra.</span>
    ),
    ...(entry && exit
      ? [
          <span className="text-[11px] text-mute">
            entra por <span className="text-emerald-700"><TeX tex={entry.constraint?.latex ?? '?'} /></span>
            {'  ·  '}sale por <span className="text-rose-700"><TeX tex={exit.constraint?.latex ?? '?'} /></span>
          </span>,
        ]
      : []),
  ]

  return (
    <div className="flex min-h-0 flex-1">
      <Sidebar fig={3}>
        <Section title="Ejemplos">
          <PresetPicker module={3} value={presetId} onChange={applyPreset} />
        </Section>
        <Section title="Sólido">
          <ConstraintEditor raws={raws} setRaws={setRaws} dims="3d" />
        </Section>
        <Section title="Orden de integración">
          <Segmented
            value={order}
            onChange={setOrder}
            options={(Object.keys(ORDER_INFO) as IntegrationOrder3D[]).map((o) => ({
              value: o,
              tex: ORDER_INFO[o].tex,
              hint: `sombra en ${ORDER_INFO[o].plane}`,
            }))}
          />
        </Section>
        <Section title="Explorar">
          <SliderRow label={`Corte en la sombra: ${outerVar} =`} value={outerPos} min={midIsH ? ranges.v0 : ranges.u0} max={midIsH ? ranges.v1 : ranges.u1} step={((midIsH ? ranges.v1 : ranges.u1) - (midIsH ? ranges.v0 : ranges.u0)) / 300} onChange={setOuterPos} fmt={(v) => fmtNum(v, 2)} color={OUTER_C} />
          <SliderRow label={`Flecha: ${hAxis} =`} value={uv.u} min={ranges.u0} max={ranges.u1} step={(ranges.u1 - ranges.u0) / 300} onChange={(u) => setUv((p) => ({ ...p, u }))} fmt={(v) => fmtNum(v, 2)} color={INNER_C} />
          <SliderRow label={`Flecha: ${vAxis} =`} value={uv.v} min={ranges.v0} max={ranges.v1} step={(ranges.v1 - ranges.v0) / 300} onChange={(v) => setUv((p) => ({ ...p, v }))} fmt={(v) => fmtNum(v, 2)} color={INNER_C} />
          <p className="text-[11px] leading-snug text-mute">La flecha violeta muestra por dónde entra y sale {info.pierce}. Click en la sombra para moverla.</p>
        </Section>
        <Section title="Vista">
          <SliderRow label="Transparencia del sólido" value={opacity} min={0.05} max={1} onChange={setOpacity} fmt={(v) => `${Math.round(v * 100)}%`} />
          <Toggle checked={wire} onChange={setWire} label="Ver como malla" />
          <Toggle checked={showSurf} onChange={setShowSurf} label="Mostrar cada superficie completa" />
          <Btn onClick={() => fitTo(raws)} className="mt-2 w-full justify-center" title="Ajusta el dibujo al tamaño del sólido">
            <Scan size={13} /> Encuadrar sólido
          </Btn>
        </Section>
        <Section title="Avanzado" defaultOpen={false}>
          <BoxEditor bbox={bbox} onChange={setBbox} />
        </Section>
      </Sidebar>
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 p-2">
            <Scene3D bbox={bbox}>
              <Solid mesh={mesh} opacity={opacity} wireframe={wire} />
              {surfMeshes.map((m, i) => (
                <Solid key={i} mesh={m} opacity={0.22} depthBias />
              ))}
              {arrowFrom && arrowTo && <Arrow3D from={arrowFrom} to={arrowTo} color={INNER_C} />}
              {entry && exit && arrowFrom && arrowTo && (
                <>
                  <Label3D p={[arrowFrom[0], arrowFrom[1], arrowFrom[2] - 0.18]} text={`${info.pierce}₁`} color="#16a34a" />
                  <Label3D p={[arrowTo[0], arrowTo[1], arrowTo[2] + 0.18]} text={`${info.pierce}₂`} color="#dc2626" />
                </>
              )}
            </Scene3D>
          </div>
          <div className="flex w-[340px] shrink-0 flex-col border-l border-line bg-white">
            <PanelTitle>Sombra en el plano {info.plane}</PanelTitle>
            <div className="min-h-0 flex-1">
              <Plot2D
                view={{ x0: ranges.u0, x1: ranges.u1, y0: ranges.v0, y1: ranges.v1 }}
                geom={shadowGeom}
                fill="rgba(31,59,245,0.16)"
                sweep={{ axis: midIsH ? 'h' : 'v', pos: outerPos, intervals: shadowSweepIntervals }}
                onSweep={setOuterPos}
                marks={[{ x: uv.u, y: uv.v, color: INNER_C }]}
                onCursor={(p) => p && setUv({ u: p.x, v: p.y })}
                clickToSet
                axisLabels={[hAxis, vAxis]}
              />
            </div>
            <PanelHint>Click = ubicar la flecha · arrastrar = mover · rueda = zoom</PanelHint>
          </div>
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
