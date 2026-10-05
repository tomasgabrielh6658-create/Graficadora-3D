import { useDeferredValue, useMemo, useState } from 'react'
import { buildRegion } from '../lib/field'
import { buildRegionMesh } from '../lib/regionMesh'
import { MESH_N, MESH_N_SURF } from '../lib/lowpower'
import { marchingSquares } from '../lib/marchingSquares'
import { rayFieldMin } from '../lib/shadow'
import { intervalsLe0 } from '../lib/roots'
import { sweepRegion } from '../lib/sweeps'
import { compileConstraints, useCompiled } from '../lib/useConstraints'
import { fitBounds3D } from '../lib/autofit'
import { usePersisted } from '../lib/persistence'
import { PRESETS, presetRaws, type RawConstraint } from '../lib/presets'
import { cylForward, fmtNum, sphForward } from '../lib/transforms'
import type { BBox } from '../types'
import { Plot2D } from '../components/Plot2D'
import { Scene3D, Solid } from '../components/Scene3D'
import { CylindricalGuides, SphericalGuides, WarpedBox } from '../components/Guides3D'
import { ConstraintEditor } from '../components/ConstraintEditor'
import { LimitsDock, N, TeX, V, dockStatus, partsNote } from '../components/LimitsDock'
import { usePlan } from '../lib/usePlan'
import { BoxEditor, Btn, NumField, PanelHint, PanelTitle, PresetPicker, Section, Select, Sidebar, SliderRow, Toggle } from '../components/ui'
import { Scan } from 'lucide-react'

type Mode = 'cyl' | 'cyle' | 'sph'
const DEFAULT_BBOX: BBox = { x0: -2.6, x1: 2.6, y0: -2.6, y1: 2.6, z0: -0.5, z1: 3.6 }
const TAU = Math.PI * 2

export default function Module4() {
  const preset = PRESETS.find((p) => p.id === 'm4-helado-sph')!
  const [raws, setRaws] = usePersisted<RawConstraint[]>('m4.cons', presetRaws(preset))
  const [mode, setMode] = usePersisted<Mode>('m4.mode', 'sph')
  const [ea, setEa] = usePersisted('m4.a', 2)
  const [eb, setEb] = usePersisted('m4.b', 1)
  const [bbox, setBbox] = usePersisted<BBox>('m4.bbox', DEFAULT_BBOX)
  const [opacity, setOpacity] = usePersisted('m4.opacity', 0.4)
  const [wire, setWire] = usePersisted('m4.wire', false)
  const [showSurf, setShowSurf] = usePersisted('m4.surfaces', false)
  const [presetId, setPresetId] = usePersisted('m4.preset', 'm4-helado-sph')
  const [thetaDeg, setThetaDeg] = usePersisted('m4.theta', 40)
  const [phiDeg, setPhiDeg] = usePersisted('m4.phi', 40)
  const [rPos, setRPos] = usePersisted('m4.r', 1)

  const deferredRaws = useDeferredValue(raws)
  const { cons } = useCompiled(deferredRaws, '3d')
  const region = useMemo(() => buildRegion(cons), [cons])

  const mesh = useMemo(() => {
    const act = cons.filter((c) => c.visible)
    return buildRegionMesh(act.map((c) => c.field), act.map((c) => c.color), bbox, MESH_N)
  }, [cons, bbox])

  const surfMeshes = useMemo(
    () =>
      showSurf
        ? cons.filter((c) => c.visible).map((c) => buildRegionMesh([c.field], [c.color], bbox, MESH_N_SURF))
        : [],
    [cons, bbox, showSurf],
  )

  const theta = (thetaDeg * Math.PI) / 180
  const phi = (phiDeg * Math.PI) / 180
  const isCyl = mode !== 'sph'
  const a = mode === 'cyle' ? ea : 1
  const b = mode === 'cyle' ? eb : 1

  const rhoMax = Math.hypot(bbox.x1 - bbox.x0, bbox.y1 - bbox.y0, bbox.z1 - bbox.z0) * 0.75
  const rMax = Math.hypot(
    Math.max(Math.abs(bbox.x0), Math.abs(bbox.x1)) / Math.min(Math.abs(a) || 1, 1),
    Math.max(Math.abs(bbox.y0), Math.abs(bbox.y1)) / Math.min(Math.abs(b) || 1, 1),
  ) * 1.05

  // Barridos pesados sobre valores diferidos: las guías se mueven al instante
  // y los intervalos/marcadores los alcanzan un frame después.
  const dTheta = useDeferredValue(theta)
  const dPhi = useDeferredValue(phi)
  const dRPos = useDeferredValue(rPos)

  const rhoIntervals = useMemo(
    () => intervalsLe0((rho) => region.field(...sphForward(rho, dTheta, dPhi)), 0, rhoMax, 500),
    [region, dTheta, dPhi, rhoMax],
  )

  const cylPt = useMemo(() => cylForward(dRPos, dTheta, 0, a, b), [dRPos, dTheta, a, b])
  const zHit = useMemo(
    () =>
      isCyl
        ? sweepRegion(region, 'z', { x: cylPt[0], y: cylPt[1], z: 0 }, bbox.z0, bbox.z1)
        : null,
    [isCyl, region, cylPt, bbox.z0, bbox.z1],
  )

  const fields = useMemo(() => region.cons.map((c) => c.field), [region])

  const rIntervals = useMemo(
    () =>
      isCyl
        ? intervalsLe0(
            (r) => {
              const [x, y] = cylForward(r, dTheta, 0, a, b)
              return rayFieldMin((t) => [x, y, t], fields, bbox.z0, bbox.z1, 100)
            },
            0,
            rMax,
            300,
          )
        : [],
    [isCyl, fields, dTheta, a, b, rMax, bbox.z0, bbox.z1],
  )

  const panelGeom = useMemo(() => {
    if (isCyl) {
      const f = (th: number, r: number) => {
        const [x, y] = cylForward(r, th, 0, a, b)
        return rayFieldMin((t) => [x, y, t], fields, bbox.z0, bbox.z1, 80)
      }
      return marchingSquares(f, 0, TAU, 0, rMax, 90, 70)
    }
    return marchingSquares(
      (th, ph) => rayFieldMin((rho) => sphForward(rho, th, ph), fields, 0, rhoMax, 90),
      0,
      TAU,
      0,
      Math.PI,
      100,
      50,
    )
  }, [isCyl, fields, a, b, bbox.z0, bbox.z1, rMax, rhoMax])

  const wedge = useMemo(() => {
    const dr = Math.max(rMax * 0.06, 0.12)
    const dt = 0.12
    if (isCyl) {
      if (!zHit?.intervals.length || dRPos <= 0) return null
      const z0 = zHit.intervals[0].a
      const z1 = zHit.intervals[zHit.intervals.length - 1].b
      const dz = Math.max((z1 - z0) * 0.25, 0.15)
      const zm = (z0 + z1) / 2
      return {
        map: (r: number, t: number, z: number) => cylForward(r, t, z, a, b) as [number, number, number],
        u0: Math.max(dRPos - dr / 2, 0.001), u1: dRPos + dr / 2,
        v0: dTheta - dt / 2, v1: dTheta + dt / 2,
        w0: zm - dz / 2, w1: zm + dz / 2,
      }
    }
    if (!rhoIntervals.length) return null
    const rho = (rhoIntervals[0].a + rhoIntervals[rhoIntervals.length - 1].b) / 2
    const dRho = Math.max(rhoMax * 0.04, 0.1)
    const dp = 0.1
    return {
      map: (rho_: number, t: number, p: number) => sphForward(rho_, t, p) as [number, number, number],
      u0: Math.max(rho - dRho / 2, 0.001), u1: rho + dRho / 2,
      v0: dTheta - dt / 2, v1: dTheta + dt / 2,
      w0: Math.max(dPhi - dp / 2, 0.001), w1: Math.min(dPhi + dp / 2, Math.PI),
    }
  }, [isCyl, zHit, dRPos, dTheta, dPhi, rhoIntervals, rMax, rhoMax, a, b])

  const applyPreset = (id: string) => {
    const p = PRESETS.find((q) => q.id === id && q.module === 4)
    if (!p) return
    setPresetId(id)
    const pr = presetRaws(p)
    setRaws(pr)
    if (p.settings?.mode) setMode(p.settings.mode)
    if (p.settings?.a) setEa(p.settings.a)
    if (p.settings?.b) setEb(p.settings.b)
    if (p.bbox) {
      setBbox({ ...DEFAULT_BBOX, ...p.bbox })
    } else {
      const fit = fitBounds3D(buildRegion(compileConstraints(pr, '3d').cons).field)
      if (fit) setBbox(fit.bbox)
    }
  }

  const autoFit = () => {
    const fit = fitBounds3D(region.field)
    if (fit) setBbox(fit.bbox)
  }
  const activePreset = PRESETS.find((p) => p.id === presetId)

  const rhoEntry = rhoIntervals.length ? rhoIntervals[0].a : null
  const rhoExit = rhoIntervals.length ? rhoIntervals[rhoIntervals.length - 1].b : null
  const zIn = zHit?.intervals.length ? zHit.intervals[0].a : null
  const zOut = zHit?.intervals.length ? zHit.intervals[zHit.intervals.length - 1].b : null

  const jacTex =
    mode === 'cyl' ? 'J = r'
    : mode === 'cyle' ? 'J = a\\cdot b\\cdot r'
    : 'J = \\rho^2\\,\\sin\\phi'
  const templateTex =
    mode === 'sph'
      ? '\\int_{\\theta_1}^{\\theta_2}\\!\\int_{\\phi_1}^{\\phi_2}\\!\\int_{\\rho_1(\\theta,\\phi)}^{\\rho_2(\\theta,\\phi)} f\\,\\textcolor{#a855f7}{\\rho^2\\sin\\phi}\\,d\\rho\\,d\\phi\\,d\\theta'
      : '\\int_{\\theta_1}^{\\theta_2}\\!\\int_{r_1(\\theta)}^{r_2(\\theta)}\\!\\int_{z_1(r,\\theta)}^{z_2(r,\\theta)} f\\,\\textcolor{#a855f7}{r}\\,dz\\,dr\\,d\\theta'

  const planReq = useMemo(() => ({ kind: 'cs3' as const, raws, mode, a: ea, b: eb }), [raws, mode, ea, eb])
  const { plan, pending } = usePlan(planReq)
  const live = isCyl
    ? [
        rIntervals.length ? (
          <>Con <V color="#f59e0b">θ</V> = <N>{fmtNum(thetaDeg, 1)}°</N>: <V color="#0891b2">r</V> va de <N>{fmtNum(rIntervals[0].a, 2)}</N> a <N>{fmtNum(rIntervals[rIntervals.length - 1].b, 2)}</N></>
        ) : (
          <span className="text-mute">Con θ = {fmtNum(thetaDeg, 1)}° no se toca el sólido.</span>
        ),
        zIn !== null && zOut !== null ? (
          <>En (r, θ) = (<N>{fmtNum(rPos, 2)}</N>, <N>{fmtNum(thetaDeg, 1)}°</N>): <V color="#a855f7">z</V> va de <N>{fmtNum(zIn, 2)}</N> a <N>{fmtNum(zOut, 2)}</N></>
        ) : (
          <span className="text-mute">La vertical en (r, θ) no atraviesa el sólido: hacé click dentro de la zona azul.</span>
        ),
        ...(zHit?.entry?.constraint && zHit.exit?.constraint
          ? [<span className="text-[11px] text-mute">piso <span className="text-emerald-700"><TeX tex={zHit.entry.constraint.latex} /></span>{'  ·  '}techo <span className="text-rose-700"><TeX tex={zHit.exit.constraint.latex} /></span></span>]
          : []),
      ]
    : [
        rhoEntry !== null && rhoExit !== null ? (
          <>En la dirección (θ, φ) = (<N>{fmtNum(thetaDeg, 1)}°</N>, <N>{fmtNum(phiDeg, 1)}°</N>): <V color="#a855f7">ρ</V> va de <N>{fmtNum(rhoEntry, 2)}</N> a <N>{fmtNum(rhoExit, 2)}</N></>
        ) : (
          <span className="text-mute">El rayo en esa dirección no atraviesa el sólido: hacé click dentro de la zona violeta.</span>
        ),
      ]
  const warnings: string[] = []
  if (plan?.innerSplit) warnings.push('Según la dirección, el sólido empieza o termina en superficies distintas: hay que partirlo.')
  if (mesh.vertexCount === 0) warnings.push('No se ve ningún sólido: revisá las desigualdades o tocá “encuadrar”.')
  else if (mesh.touchesBoundary) warnings.push('El sólido llega al borde del dibujo: puede que le falte una tapa (no está acotado).')
    
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-visible">
      <Sidebar fig={4}>
        <Section title="Ejemplos">
          <PresetPicker module={4} value={presetId} onChange={applyPreset} />
        </Section>
        <Section title="Sólido">
          <ConstraintEditor raws={raws} setRaws={setRaws} dims="3d" />
        </Section>
        <Section title="Coordenadas">
          <Select
            value={mode}
            onChange={(m) => setMode(m as Mode)}
            options={[
              { value: 'cyl', label: 'Cilíndricas: x = r·cos θ, y = r·sen θ, z = z' },
              { value: 'cyle', label: 'Cilíndricas elípticas: x = a·r·cos θ, y = b·r·sen θ' },
              { value: 'sph', label: 'Esféricas: ρ, θ, φ (φ medido desde el eje z)' },
            ]}
          />
          {mode === 'cyle' && (
            <div className="mt-2 flex gap-1.5">
              <NumField label="a" value={ea} onChange={(v) => setEa(v)} />
              <NumField label="b" value={eb} onChange={(v) => setEb(v)} />
            </div>
          )}
          <div className="mt-2 flex items-center gap-2 border border-line bg-paper px-2 py-1 text-[11px] text-ink">
            <span className="text-mute">Jacobiano</span>
            <TeX tex={jacTex.replace(/^J/, '|J|')} />
          </div>
        </Section>
        <Section title="Explorar">
          <SliderRow label="Ángulo θ =" value={thetaDeg} min={0} max={360} step={0.5} onChange={setThetaDeg} fmt={(v) => `${fmtNum(v, 1)}°`} color="#f59e0b" />
          {isCyl ? (
            <SliderRow label="Radio r =" value={rPos} min={0} max={rMax} step={rMax / 300} onChange={setRPos} fmt={fmtNum} color="#0891b2" />
          ) : (
            <SliderRow label="Ángulo φ (desde el eje z) =" value={phiDeg} min={0} max={180} step={0.5} onChange={setPhiDeg} fmt={(v) => `${fmtNum(v, 1)}°`} color="#a855f7" />
          )}
        </Section>
        <Section title="Vista">
          <SliderRow label="Transparencia del sólido" value={opacity} min={0.05} max={1} onChange={setOpacity} fmt={(v) => `${Math.round(v * 100)}%`} />
          <Toggle checked={wire} onChange={setWire} label="Ver como malla" />
          <Toggle checked={showSurf} onChange={setShowSurf} label="Mostrar cada superficie completa" />
          <Btn onClick={autoFit} className="mt-2 w-full justify-center" title="Encuadra la escena al sólido automáticamente">
            <Scan size={13} /> Encuadrar sólido
          </Btn>
        </Section>
        <Section title="Avanzado" defaultOpen={false}>
          <BoxEditor bbox={bbox} onChange={setBbox} />
        </Section>
      </Sidebar>
      <main className="order-first flex min-h-[55dvh] min-w-0 flex-1 flex-col lg:order-none lg:min-h-0">
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="min-h-[45dvh] min-w-0 flex-1 p-2 lg:min-h-0">
            <Scene3D bbox={bbox}>
              <Solid mesh={mesh} opacity={opacity} wireframe={wire} />
              {surfMeshes.map((m, i) => (
                <Solid key={i} mesh={m} opacity={0.22} depthBias />
              ))}
              {isCyl ? (
                <CylindricalGuides theta={theta} r={rPos} zIn={zIn} zOut={zOut} a={a} b={b} rMax={rMax} />
              ) : (
                <SphericalGuides theta={theta} phi={phi} rhoIn={rhoEntry} rhoOut={rhoExit} rMax={rhoMax * 0.7} />
              )}
              {wedge && <WarpedBox {...wedge} />}
            </Scene3D>
          </div>
          <div className="flex w-full shrink-0 flex-col border-t border-line bg-white lg:w-[340px] lg:border-l lg:border-t-0">
            <PanelTitle>{isCyl ? 'La base vista en (θ, r)' : 'Las direcciones vistas en (θ, φ)'}</PanelTitle>
            <div className="min-h-[38dvh] flex-1 lg:min-h-0">
              <Plot2D
                view={
                  isCyl
                    ? { x0: 0, x1: TAU, y0: 0, y1: rMax }
                    : { x0: 0, x1: TAU, y0: 0, y1: Math.PI }
                }
                geom={panelGeom}
                fill={isCyl ? 'rgba(31,59,245,0.16)' : 'rgba(167,139,250,0.30)'}
                marks={
                  isCyl
                    ? [{ x: theta, y: rPos, color: '#a855f7' }]
                    : [{ x: theta, y: phi, color: '#a855f7' }]
                }
                axisLabels={isCyl ? ['θ', 'r'] : ['θ', 'φ']}
                fmtX={thetaTick4}
                fmtY={isCyl ? undefined : phiTick}
                clickToSet
                onCursor={(p) => {
                  if (!p) return
                  if (isCyl) {
                    setThetaDeg(((p.x * 180) / Math.PI + 360) % 360)
                    setRPos(Math.max(0, p.y))
                  } else {
                    setThetaDeg(((p.x * 180) / Math.PI + 360) % 360)
                    setPhiDeg(Math.min(180, Math.max(0, (p.y * 180) / Math.PI)))
                  }
                }}
              />
            </div>
            <PanelHint>Click = mover {isCyl ? 'θ y r' : 'θ y φ'} · arrastrar = mover · rueda = zoom</PanelHint>
          </div>
        </div>
        <LimitsDock
          tex={plan?.tex || activePreset?.limitsTex || templateTex}
          status={dockStatus(plan, pending)}
          parts={partsNote(plan, '\theta')}
          live={live}
          warnings={warnings}
          note={activePreset?.note}
        />
      </main>
    </div>
  )
}

function thetaTick4(v: number): string {
  const k = v / (Math.PI / 2)
  const r = Math.round(k)
  if (Math.abs(k - r) > 0.04) return ''
  if (r === 0) return '0'
  const s = r < 0 ? '-' : ''
  const n = Math.abs(r)
  if (n === 2) return `${s}π`
  if (n === 4) return `${s}2π`
  if (n % 2 === 0) return `${s}${n / 2}π`
  return `${s}${n === 1 ? '' : n}π/2`
}

function phiTick(v: number): string {
  return thetaTick4(v)
}
