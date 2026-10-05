import { useMemo, useRef, useState } from 'react'
import { buildRegion } from '../lib/field'
import { fitBounds2D } from '../lib/autofit'
import { intervalsLe0 } from '../lib/roots'
import { compileConstraints, useCompiled } from '../lib/useConstraints'
import { usePersisted } from '../lib/persistence'
import { PRESETS, presetRaws, type RawConstraint } from '../lib/presets'
import {
  customTransform, ellipticTransform, fmtNum, linearTransform, polarTransform,
  type CustomSpec, type Transform2D,
} from '../lib/transforms'
import { Plot2D } from '../components/Plot2D'
import { ConstraintEditor } from '../components/ConstraintEditor'
import { LimitsDock, N, TeX, V, dockStatus, partsNote } from '../components/LimitsDock'
import { usePlan } from '../lib/usePlan'
import { NumField, PanelTitle, PresetPicker, Section, Select, Sidebar, SliderRow } from '../components/ui'

type Kind = 'polar' | 'elliptic' | 'linear' | 'custom'
const DEFAULT_VIEW = { x0: -3, x1: 3, y0: -3, y1: 3 }
const DEFAULT_CUSTOM: CustomSpec = {
  xExpr: 'sqrt(u/v)', yExpr: 'sqrt(u*v)', u0: 0.5, u1: 2.5, v0: 0.5, v1: 4.5,
}

function thetaTick(v: number): string {
  const k = v / (Math.PI / 2)
  const r = Math.round(k)
  if (Math.abs(k - r) > 0.04) return ''
  if (r === 0) return '0'
  const signs = r < 0 ? '-' : ''
  const n = Math.abs(r)
  if (n === 2) return `${signs}π`
  if (n === 4) return `${signs}2π`
  if (n % 2 === 0) return `${signs}${n / 2}π`
  return `${signs}${n === 1 ? '' : n}π/2`
}

export default function Module2() {
  const preset = PRESETS.find((p) => p.id === 'm2-corona')!
  const [raws, setRaws] = usePersisted<RawConstraint[]>('m2.cons', presetRaws(preset))
  const [kind, setKind] = usePersisted<Kind>('m2.kind', 'polar')
  const [ea, setEa] = usePersisted('m2.a', 3)
  const [eb, setEb] = usePersisted('m2.b', 2)
  const [lin, setLin] = usePersisted('m2.lin', [1, -1, 1, 1])
  const [custom, setCustom] = usePersisted<CustomSpec>('m2.custom', DEFAULT_CUSTOM)
  const [view, setView] = usePersisted('m2.view', DEFAULT_VIEW)
  const [thetaDeg, setThetaDeg] = usePersisted('m2.theta', 45)
  const [uPos, setUPos] = useState(0)
  const [presetId, setPresetId] = usePersisted('m2.preset', 'm2-corona')
  const [cursorXY, setCursorXY] = useState<{ x: number; y: number } | null>(null)
  const [cursorUV, setCursorUV] = useState<{ u: number; v: number } | null>(null)

  const { cons } = useCompiled(raws, '2d')
  const region = useMemo(() => buildRegion(cons), [cons])

  const rMax = useMemo(() => {
    const corners = [
      Math.hypot(view.x0, view.y0), Math.hypot(view.x1, view.y0),
      Math.hypot(view.x0, view.y1), Math.hypot(view.x1, view.y1),
    ]
    const div = kind === 'elliptic' ? Math.min(Math.abs(ea) || 1, Math.abs(eb) || 1) : 1
    return (Math.max(...corners) / div) * 1.1 + 0.5
  }, [view, kind, ea, eb])

  const uvMax = Math.max(Math.abs(view.x0), Math.abs(view.x1), Math.abs(view.y0), Math.abs(view.y1)) * 1.2

  const customErrRef = useRef<string | null>(null)
  const T: Transform2D = useMemo(() => {
    if (kind === 'polar') return polarTransform(rMax)
    if (kind === 'elliptic') return ellipticTransform(ea, eb, rMax)
    if (kind === 'custom') {
      const res = customTransform(custom)
      if ('error' in res) {
        customErrRef.current = res.error
        return polarTransform(rMax)
      }
      customErrRef.current = null
      return res.T
    }
    return linearTransform(lin[0], lin[1], lin[2], lin[3], uvMax, uvMax)
  }, [kind, rMax, ea, eb, lin, uvMax, custom])

  const theta = (thetaDeg * Math.PI) / 180
  const isAngular = kind === 'polar' || kind === 'elliptic'

  const sweepU = isAngular ? theta : uPos
  const rIntervals = useMemo(
    () => intervalsLe0((r) => {
      const [x, y] = T.forward(sweepU, r)
      return Number.isFinite(x) ? region.field(x, y, 0) : 1
    }, T.vRange[0], T.vRange[1], 500),
    [T, sweepU, region],
  )

  const thetaRange = useMemo(() => {
    let lo: number | null = null
    let hi: number | null = null
    for (let i = 0; i <= 180; i++) {
      const t = T.uRange[0] + ((T.uRange[1] - T.uRange[0]) * i) / 180
      const any = intervalsLe0((r) => {
        const [x, y] = T.forward(t, r)
        return Number.isFinite(x) ? region.field(x, y, 0) : 1
      }, T.vRange[0], T.vRange[1], 120).length > 0
      if (any) {
        if (lo === null) lo = t
        hi = t
      }
    }
    return lo === null ? null : ([lo, hi!] as [number, number])
  }, [T, region])

  const applyPreset = (id: string) => {
    const p = PRESETS.find((q) => q.id === id && q.module === 2)
    if (!p) return
    const pr = presetRaws(p)
    setPresetId(id)
    setRaws(pr)
    if (p.settings?.transform) setKind(p.settings.transform)
    if (p.settings?.a) setEa(p.settings.a)
    if (p.settings?.b) setEb(p.settings.b)
    if (p.settings?.custom) {
      setCustom({
        xExpr: p.settings.custom.x, yExpr: p.settings.custom.y,
        u0: p.settings.custom.u0, u1: p.settings.custom.u1,
        v0: p.settings.custom.v0, v1: p.settings.custom.v1,
      })
      setUPos((p.settings.custom.u0 + p.settings.custom.u1) / 2)
    }
    if (p.bbox) {
      setView({ x0: p.bbox.x0 ?? -3, x1: p.bbox.x1 ?? 3, y0: p.bbox.y0 ?? -3, y1: p.bbox.y1 ?? 3 })
    } else {
      const fit = fitBounds2D((x, y) => buildRegion(compileConstraints(pr, '2d').cons).field(x, y, 0))
      if (fit) setView(fit.view)
    }
  }

  const autoFit = () => {
    const fit = fitBounds2D((x, y) => region.field(x, y, 0))
    if (fit) setView(fit.view)
  }
  const activePreset = PRESETS.find((p) => p.id === presetId)

  // Memoizados: son deps de la capa estática de Plot2D (si cambian de
  // identidad por render se recalcula el marching squares en cada frame).
  const fieldXY = useMemo(() => (x: number, y: number) => region.field(x, y, 0), [region])
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
  const curvesUV = useMemo(
    () =>
      cons
        .filter((c) => c.visible)
        .map((c) => ({
          f: (u: number, v: number) => {
            const [x, y] = T.forward(u, v)
            return Number.isFinite(x) ? c.boundary(x, y, 0) : 1
          },
          color: c.color,
          clip: (u: number, v: number) => {
            const [x, y] = T.forward(u, v)
            return Number.isFinite(x) ? region.field(x, y, 0) : 1
          },
        })),
    [cons, T, region],
  )

  const uvField = useMemo(
    () => (u: number, v: number) => {
      const [x, y] = T.forward(u, v)
      return Number.isFinite(x) ? region.field(x, y, 0) : 1
    },
    [T, region],
  )

  const markLeft = cursorUV
    ? (() => {
        const [x, y] = T.forward(cursorUV.u, cursorUV.v)
        return Number.isFinite(x) ? [{ x, y, color: '#0ea5e9' }] : []
      })()
    : cursorXY ? [{ x: cursorXY.x, y: cursorXY.y, color: '#0ea5e9' }] : []
  const markRight = cursorXY
    ? (() => {
        const [u, v] = T.inverse(cursorXY.x, cursorXY.y)
        return Number.isFinite(u) ? [{ x: u, y: v, color: '#0ea5e9' }] : []
      })()
    : cursorUV ? [{ x: cursorUV.u, y: cursorUV.v, color: '#0ea5e9' }] : []

  const warnings: string[] = []
  if (kind === 'linear' && Math.abs(lin[0] * lin[3] - lin[1] * lin[2]) < 1e-9)
    warnings.push('Esa transformación lineal no sirve: su determinante es 0.')
  if (thetaRange === null) warnings.push('No se encuentra la región: revisá las desigualdades o tocá “encuadrar”.')

  const planReq = useMemo(
    () => ({ kind: 'cv2' as const, raws, transform: kind, a: ea, b: eb, lin, custom }),
    [raws, kind, ea, eb, lin, custom],
  )
  const { plan, pending } = usePlan(planReq)
  const [uN, vN] = isAngular ? ['θ', 'r'] : ['u', 'v']
  const live = [
    rIntervals.length ? (
      <>
        {isAngular ? <>Rayo con <V color="#d97706">θ</V> = <N>{fmtNum(thetaDeg, 1)}°</N></> : <>Corte en <V color="#d97706">u</V> = <N>{fmtNum(uPos, 2)}</N></>}:{' '}
        <V color="#0891b2">{vN}</V> va de <N>{fmtNum(rIntervals[0].a, 2)}</N> a <N>{fmtNum(rIntervals[rIntervals.length - 1].b, 2)}</N>
      </>
    ) : (
      <span className="text-mute">{isAngular ? `El rayo con θ = ${fmtNum(thetaDeg, 1)}° no toca la región.` : `El corte en u = ${fmtNum(uPos, 2)} no toca la región.`}</span>
    ),
    ...(thetaRange
      ? [
          <span className="text-[11px] text-mute">
            la región ocupa {uN} entre <N>{isAngular ? `${fmtNum((thetaRange[0] * 180) / Math.PI, 1)}°` : fmtNum(thetaRange[0], 2)}</N> y{' '}
            <N>{isAngular ? `${fmtNum((thetaRange[1] * 180) / Math.PI, 1)}°` : fmtNum(thetaRange[1], 2)}</N>
          </span>,
        ]
      : []),
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-visible">
      <Sidebar fig={2}>
        <Section title="Ejemplos">
          <PresetPicker module={2} value={presetId} onChange={applyPreset} />
        </Section>
        <Section title="Región en el plano xy">
          <ConstraintEditor raws={raws} setRaws={setRaws} dims="2d" />
        </Section>
        <Section title="Cambio de variables">
          <Select
            value={kind}
            onChange={(k) => {
              const kk = k as Kind
              setKind(kk)
              if (kk === 'linear') setUPos(0)
              if (kk === 'custom') setUPos((custom.u0 + custom.u1) / 2)
            }}
            options={[
              { value: 'polar', label: 'Polares: x = r·cos θ, y = r·sen θ' },
              { value: 'elliptic', label: 'Polares elípticas: x = a·r·cos θ, y = b·r·sen θ' },
              { value: 'linear', label: 'Lineal: u = a·x + b·y, v = c·x + d·y' },
              { value: 'custom', label: 'Otra: x = X(u, v), y = Y(u, v)' },
            ]}
          />
          {kind === 'custom' && (
            <div className="mt-2 space-y-1.5">
              <label className="flex items-center gap-1.5 text-[11px] text-mute">
                <span className="w-14 shrink-0">x(u,v) =</span>
                <input className="w-full border border-line px-1.5 py-1 font-mono text-[11px] outline-none focus:border-cobalt" value={custom.xExpr} onChange={(e) => setCustom({ ...custom, xExpr: e.target.value })} spellCheck={false} />
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-mute">
                <span className="w-14 shrink-0">y(u,v) =</span>
                <input className="w-full border border-line px-1.5 py-1 font-mono text-[11px] outline-none focus:border-cobalt" value={custom.yExpr} onChange={(e) => setCustom({ ...custom, yExpr: e.target.value })} spellCheck={false} />
              </label>
              <div className="grid grid-cols-2 gap-1">
                {([['u0', 'u desde'], ['u1', 'hasta'], ['v0', 'v desde'], ['v1', 'hasta']] as const).map(([k, l]) => (
                  <NumField key={k} label={l} value={custom[k]} onChange={(v) => setCustom({ ...custom, [k]: v })} />
                ))}
              </div>
              {customErrRef.current && (
                <div className="text-[10.5px] text-rose-600">{customErrRef.current}</div>
              )}
            </div>
          )}
          {kind === 'elliptic' && (
            <div className="mt-2 flex gap-1.5">
              <NumField label="a" value={ea} onChange={(v) => setEa(v)} />
              <NumField label="b" value={eb} onChange={(v) => setEb(v)} />
            </div>
          )}
          {kind === 'linear' && (
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {(['a', 'b', 'c', 'd'] as const).map((k, i) => (
                <NumField key={k} label={k} value={lin[i]} onChange={(n) => setLin((l) => l.map((v, j) => (j === i ? n : v)))} />
              ))}
            </div>
          )}
          <div className="mt-2 flex items-center gap-2 border border-line bg-paper px-2 py-1 text-[11px] text-ink">
            <span className="text-mute">Jacobiano</span>
            <TeX tex={plan?.weightTex ? `|J| = ${plan.weightTex}` : T.jacobianTex} />
          </div>
        </Section>
        <Section title="Explorar">
          {isAngular ? (
            <SliderRow
              label="Ángulo del rayo: θ ="
              value={thetaDeg}
              min={0}
              max={360}
              step={0.5}
              onChange={setThetaDeg}
              fmt={(v) => `${fmtNum(v, 1)}°`}
              color="#f59e0b"
            />
          ) : (
            <SliderRow
              label="Corte: u ="
              value={uPos}
              min={T.uRange[0]}
              max={T.uRange[1]}
              step={(T.uRange[1] - T.uRange[0]) / 300}
              onChange={setUPos}
              fmt={fmtNum}
              color="#f59e0b"
            />
          )}
        </Section>
      </Sidebar>
      <main className="order-first flex min-h-[55dvh] min-w-0 flex-1 flex-col lg:order-none lg:min-h-0">
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="flex min-w-0 flex-1 flex-col">
            <PanelTitle>Plano xy — región original</PanelTitle>
            <div className="min-h-[36dvh] min-w-0 flex-1 p-2 lg:min-h-0">
              <Plot2D
                view={view}
                onView={setView}
                field={fieldXY}
                curves={curves}
                marks={markLeft}
                onCursor={setCursorXY}
                onHome={autoFit}
                axisLabels={['x', 'y']}
                extras={(ctx, toPx) => {
                  if (!isAngular) return
                  const [ox, oy] = toPx(0, 0)
                  const dirX = Math.cos(theta)
                  const dirY = Math.sin(theta)
                  const L = Math.max(view.x1 - view.x0, view.y1 - view.y0)
                  const [ex, ey] = toPx(...T.forward(theta, L / Math.min(Math.abs(kind === 'elliptic' ? Math.min(ea, eb) : 1) || 1, 1)))
                  ctx.setLineDash([4, 4])
                  ctx.strokeStyle = '#f59e0b'
                  ctx.lineWidth = 1.2
                  ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke()
                  ctx.setLineDash([])
                  const arcR = Math.min(ctx.canvas.clientWidth, ctx.canvas.clientHeight) * 0.09
                  ctx.strokeStyle = '#f59e0b'
                  ctx.lineWidth = 2
                  ctx.beginPath()
                  ctx.arc(ox, oy, arcR, 0, -theta, theta < 0)
                  ctx.stroke()
                  ctx.fillStyle = '#f59e0b'
                  ctx.font = 'italic 11px serif'
                  ctx.fillText('θ', ox + arcR * 1.15 * Math.cos(theta / 2), oy - arcR * 1.15 * Math.sin(theta / 2))
                  for (const iv of rIntervals) {
                    const [ax, ay] = toPx(...T.forward(theta, iv.a))
                    const [bx, by] = toPx(...T.forward(theta, iv.b))
                    ctx.strokeStyle = '#a855f7'
                    ctx.lineWidth = 2.5
                    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke()
                    const ddx = bx - ax, ddy = by - ay
                    const ln = Math.hypot(ddx, ddy) || 1
                    const ux = ddx / ln, uy = ddy / ln
                    ctx.fillStyle = '#a855f7'
                    ctx.beginPath()
                    ctx.moveTo(bx + ux * 3, by + uy * 3)
                    ctx.lineTo(bx - uy * 4 - ux * 7, by + ux * 4 - uy * 7)
                    ctx.lineTo(bx + uy * 4 - ux * 7, by - ux * 4 - uy * 7)
                    ctx.closePath(); ctx.fill()
                    ctx.fillStyle = '#16a34a'
                    ctx.beginPath(); ctx.arc(ax, ay, 4, 0, Math.PI * 2); ctx.fill()
                    ctx.fillStyle = '#dc2626'
                    ctx.beginPath(); ctx.arc(bx, by, 4, 0, Math.PI * 2); ctx.fill()
                  }
                }}
              />
            </div>
          </div>
          <div className="flex w-[42%] min-w-0 shrink-0 flex-col border-l border-line">
            <PanelTitle>Plano transformado ({isAngular ? 'θ, r' : 'u, v'})</PanelTitle>
            <div className="min-h-[36dvh] min-w-0 flex-1 p-2 lg:min-h-0">
              <Plot2D
                view={{ x0: T.uRange[0], x1: T.uRange[1], y0: T.vRange[0], y1: T.vRange[1] }}
                field={uvField}
                fill="rgba(167,139,250,0.30)"
                curves={curvesUV}
                sweep={{ axis: 'v', pos: sweepU, intervals: rIntervals }}
                onSweep={(v) => (isAngular ? setThetaDeg((v * 180) / Math.PI) : setUPos(v))}
                marks={markRight}
                onCursor={(p) => setCursorUV(p ? { u: p.x, v: p.y } : null)}
                axisLabels={isAngular ? ['θ', 'r'] : ['u', 'v']}
                fmtX={isAngular ? thetaTick : undefined}
              />
            </div>
          </div>
        </div>
        <LimitsDock
          tex={plan?.tex || T.integralTex}
          status={dockStatus(plan, pending)}
          parts={partsNote(plan, isAngular ? '\theta' : 'u')}
          live={live}
          warnings={warnings}
          note={activePreset?.note}
        />
      </main>
    </div>
  )
}
