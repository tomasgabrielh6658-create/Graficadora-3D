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
import { PRESETS, presetRaws, type RawConstraint } from '../lib/presets'
import { fmtNum } from '../lib/transforms'
import { ORDER_INFO, type BBox, type IntegrationOrder3D } from '../types'
import { Plot2D } from '../components/Plot2D'
import { Arrow3D, Label3D, Scene3D, Solid } from '../components/Scene3D'
import { ConstraintEditor } from '../components/ConstraintEditor'
import { LimitsDock, TeX } from '../components/LimitsDock'
import { Btn, Section, Select, SliderRow, Toggle, NumField, PanelHint, PanelTitle, Sidebar } from '../components/ui'
import { Scan } from 'lucide-react'
const DEFAULT_BBOX: BBox = { x0: -2.6, x1: 2.6, y0: -2.6, y1: 2.6, z0: -0.5, z1: 4.6 }

const PLANE_AXES: Record<'xy' | 'yz' | 'xz', [ 'x'|'y'|'z', 'x'|'y'|'z' ]> = {
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
    return buildRegionMesh(
      act.map((c) => c.field),
      act.map((c) => c.color),
      bbox,
      36,
    )
  }, [cons, bbox])

  // Cada superficie frontera dibujada "virgen" (sin cortar por las demás),
  // como las muestra GeoGebra — estilo F(x,y,z)=0 completa dentro del viewport.
  const surfMeshes = useMemo(
    () =>
      showSurf
        ? cons.filter((c) => c.visible).map((c) => buildRegionMesh([c.field], [c.color], bbox, 34))
        : [],
    [cons, bbox, showSurf],
  )

  const sf = useMemo(
    () =>
      shadowField(
        region.cons.map((c) => c.field),
        info.pierce,
        ranges.t0,
        ranges.t1,
      ),
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
  }, [outerRange?.[0], outerRange?.[1]])

  const applyPreset = (id: string) => {
    const p = PRESETS.find((q) => q.id === id && q.module === 3)
    if (!p) return
    setPresetId(id)
    const pr = presetRaws(p)
    setRaws(pr)
    if (p.settings?.order) setOrder(p.settings.order)
    if (p.bbox) {
      setBbox({ ...DEFAULT_BBOX, ...p.bbox })
    } else {
      const fit = fitBounds3D(buildRegion(compileConstraints(pr, '3d').cons).field)
      if (fit) setBbox(fit.bbox)
    }
    setUv({ u: 0.4, v: 0.4 })
  }

  const autoFit = () => {
    const fit = fitBounds3D(region.field)
    if (fit) setBbox(fit.bbox)
  }
  const activePreset = PRESETS.find((p) => p.id === presetId)

  const entry = pierceHit.entry
  const exit = pierceHit.exit
  const arrowFrom: [number, number, number] | null =
    entry && exit
      ? (() => {
          const a = toPoint(uv.u, uv.v, entry.t)
          return [a.x, a.y, a.z]
        })()
      : null
  const arrowTo: [number, number, number] | null =
    entry && exit
      ? (() => {
          const a = toPoint(uv.u, uv.v, exit.t)
          return [a.x, a.y, a.z]
        })()
      : null

  const outerVar = info.outer
  const midVar = info.mid
  const diffsTex = `\\textcolor{#a855f7}{d${info.pierce}}\\,\\textcolor{#0891b2}{d${info.mid}}\\,\\textcolor{#d97706}{d${info.outer}}`
  const tex = `\\int_{${outerRange ? fmtNum(outerRange[0]) : 'a'}}^{${outerRange ? fmtNum(outerRange[1]) : 'b'}}\\!\\int_{g_1(${outerVar})}^{g_2(${outerVar})}\\!\\int_{k_1(${outerVar},${midVar})}^{k_2(${outerVar},${midVar})} f\\,${diffsTex}`

  const warnings: string[] = []
  if (mesh.vertexCount === 0) warnings.push('Región vacía dentro del viewport — revisá las restricciones')
  else if (mesh.touchesBoundary) warnings.push('La región toca el borde del viewport: puede no estar acotada')
  if (pierceHit.intervals.length > 1)
    warnings.push(`El rayo corta ${pierceHit.intervals.length} tramos: la región no es simple en esta dirección`)

  return (
    <div className="flex min-h-0 flex-1">
      <Sidebar>
        <Section title="Ejercicios típicos">
          <Select
            value={PRESETS.some((p) => p.id === presetId && p.module === 3) ? presetId : ''}
            onChange={applyPreset}
            options={[
              { value: '', label: '— Elegir preset —' },
              ...PRESETS.filter((p) => p.module === 3).map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        </Section>
        <Section title="Superficies frontera">
          <ConstraintEditor raws={raws} setRaws={setRaws} dims="3d" />
        </Section>
        <Section title="Orden de integración">
          <div className="grid grid-cols-2 gap-1">
            {(Object.keys(ORDER_INFO) as IntegrationOrder3D[]).map((o) => (
              <button
                key={o}
                onClick={() => setOrder(o)}
                className={`border px-1.5 py-1.5 text-[10px] font-mono ${
                  order === o
                    ? 'border-cobalt bg-cobalt-50 text-ink'
                    : 'border-line text-mute hover:border-ink hover:text-ink'
                }`}
              >
                <TeX tex={ORDER_INFO[o].tex} />
                <span className="ml-1 text-[9px] text-mute">{ORDER_INFO[o].typeLabel}</span>
              </button>
            ))}
          </div>
        </Section>
        <Section title="Punto base de perforación">
          <SliderRow
            label={`${hAxis} (eje horizontal de la sombra)`}
            value={uv.u}
            min={ranges.u0}
            max={ranges.u1}
            step={(ranges.u1 - ranges.u0) / 300}
            onChange={(u) => setUv((p) => ({ ...p, u }))}
            fmt={fmtNum}
          />
          <SliderRow
            label={`${vAxis} (eje vertical de la sombra)`}
            value={uv.v}
            min={ranges.v0}
            max={ranges.v1}
            step={(ranges.v1 - ranges.v0) / 300}
            onChange={(v) => setUv((p) => ({ ...p, v }))}
            fmt={fmtNum}
          />
        </Section>
        <Section title="Barrido en la sombra">
          <SliderRow
            label={`${outerVar} (límite exterior)`}
            value={outerPos}
            min={midIsH ? ranges.v0 : ranges.u0}
            max={midIsH ? ranges.v1 : ranges.u1}
            step={((midIsH ? ranges.v1 : ranges.u1) - (midIsH ? ranges.v0 : ranges.u0)) / 300}
            onChange={setOuterPos}
            fmt={fmtNum}
            color="#d97706"
          />
        </Section>
        <Section title="Visualización">
          <SliderRow label="Opacidad del sólido" value={opacity} min={0.05} max={1} onChange={setOpacity} fmt={(v) => `${Math.round(v * 100)}%`} />
          <Toggle checked={wire} onChange={setWire} label="Modo wireframe" />
          <Toggle checked={showSurf} onChange={setShowSurf} label="Superficies completas (sin recortar)" />
          <Btn onClick={autoFit} className="mt-2 w-full justify-center" title="Encuadra la escena al sólido automáticamente">
            <Scan size={13} /> Encuadrar región
          </Btn>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {(['x0', 'x1', 'y0', 'y1', 'z0', 'z1'] as const).map((k) => (
              <NumField key={k} label={k} value={bbox[k]} onChange={(v) => setBbox({ ...bbox, [k]: v })} />
            ))}
          </div>
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
              {arrowFrom && arrowTo && (
                <Arrow3D from={arrowFrom} to={arrowTo} color="#a855f7" />
              )}
              {entry && exit && arrowFrom && arrowTo && (
                <>
                  <Label3D p={[arrowFrom[0], arrowFrom[1], arrowFrom[2] - 0.18]} text={`${info.pierce}₁`} color="#16a34a" />
                  <Label3D p={[arrowTo[0], arrowTo[1], arrowTo[2] + 0.18]} text={`${info.pierce}₂`} color="#dc2626" />
                </>
              )}
            </Scene3D>
          </div>
          <div className="flex w-[340px] shrink-0 flex-col border-l border-line bg-white">
            <PanelTitle>Sombra en plano {info.plane} · barrido {midIsH ? 'T2 (horizontal)' : 'T1 (vertical)'}</PanelTitle>
            <div className="min-h-0 flex-1">
              <Plot2D
                view={{ x0: ranges.u0, x1: ranges.u1, y0: ranges.v0, y1: ranges.v1 }}
                geom={shadowGeom}
                fill="rgba(31,59,245,0.16)"
                sweep={{
                  axis: midIsH ? 'h' : 'v',
                  pos: outerPos,
                  intervals: shadowSweepIntervals,
                }}
                onSweep={setOuterPos}
                marks={[{ x: uv.u, y: uv.v, color: '#a855f7' }]}
                onCursor={(p) => p && setUv({ u: p.x, v: p.y })}
                clickToSet
                axisLabels={[hAxis, vAxis]}
              />
            </div>
            <PanelHint>Click en la sombra para posicionar la flecha 3D · arrastrar = mover la vista</PanelHint>
          </div>
        </div>
        <LimitsDock
          tex={tex}
          live={[
            ...(outerRange
              ? [{ label: `${outerVar} ∈`, value: `[${fmtNum(outerRange[0])}, ${fmtNum(outerRange[1])}]`, color: '#d97706' }]
              : []),
            ...(shadowSweepIntervals.length
              ? [
                  {
                    label: `${midVar} ∈`,
                    value: `[${fmtNum(shadowSweepIntervals[0].a)}, ${fmtNum(shadowSweepIntervals[shadowSweepIntervals.length - 1].b)}]`,
                    color: '#0891b2',
                  },
                ]
              : []),
            ...(entry && exit
              ? [
                  {
                    label: `${info.pierce} ∈`,
                    value: `[${fmtNum(entry.t)}, ${fmtNum(exit.t)}]`,
                    color: '#a855f7',
                  },
                  { label: 'entra por', value: entry.constraint?.raw ?? '?', color: '#16a34a' },
                  { label: 'sale por', value: exit.constraint?.raw ?? '?', color: '#dc2626' },
                ]
              : [{ label: info.pierce, value: 'el rayo no toca el sólido', color: '#94a3b8' }]),
          ]}
          warnings={warnings}
          note={activePreset?.note}
        />
        {activePreset?.limitsTex && (
          <div className="shrink-0 border-t border-line bg-paper px-4 py-1 text-[11px] text-mute">
            <span className="mr-1 font-mono text-[9.5px] uppercase tracking-wider text-cobalt">referencia del TP</span> <TeX tex={activePreset.limitsTex} />
          </div>
        )}
      </main>
    </div>
  )
}
