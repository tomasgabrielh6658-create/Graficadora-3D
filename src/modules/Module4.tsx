import { useDeferredValue, useMemo, useState } from 'react'
import { buildRegion } from '../lib/field'
import { buildRegionMesh } from '../lib/regionMesh'
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
import { LimitsDock, TeX } from '../components/LimitsDock'
import { Btn, Section, Select, SliderRow, Toggle, NumField, PanelHint, PanelTitle, Sidebar } from '../components/ui'
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
    return buildRegionMesh(act.map((c) => c.field), act.map((c) => c.color), bbox, 36)
  }, [cons, bbox])

  const surfMeshes = useMemo(
    () =>
      showSurf
        ? cons.filter((c) => c.visible).map((c) => buildRegionMesh([c.field], [c.color], bbox, 34))
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

  const warnings: string[] = []
  if (mesh.vertexCount === 0) warnings.push('Región vacía dentro del viewport — revisá las restricciones')
  else if (mesh.touchesBoundary) warnings.push('La región toca el borde del viewport')
  if (!isCyl && !rhoIntervals.length) warnings.push('El rayo ρ no atraviesa el sólido en esta dirección')
  if (isCyl && !zHit?.intervals.length) warnings.push('La vertical en (r, θ) no atraviesa el sólido')

  return (
    <div className="flex min-h-0 flex-1">
      <Sidebar>
        <Section title="Ejercicios típicos">
          <Select
            value={PRESETS.some((p) => p.id === presetId && p.module === 4) ? presetId : ''}
            onChange={applyPreset}
            options={[
              { value: '', label: '— Elegir preset —' },
              ...PRESETS.filter((p) => p.module === 4).map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        </Section>
        <Section title="Coordenadas">
          <Select
            value={mode}
            onChange={(m) => setMode(m as Mode)}
            options={[
              { value: 'cyl', label: 'Cilíndricas circulares' },
              { value: 'cyle', label: 'Cilíndricas elípticas' },
              { value: 'sph', label: 'Esféricas' },
            ]}
          />
          {mode === 'cyle' && (
            <div className="mt-2 flex gap-1.5">
              <NumField label="a" value={ea} onChange={(v) => setEa(v)} />
              <NumField label="b" value={eb} onChange={(v) => setEb(v)} />
            </div>
          )}
          <div className="mt-2 border border-line bg-paper px-2 py-1 text-[11px] text-ink">
            <TeX tex={jacTex} />
          </div>
        </Section>
        <Section title="Superficies frontera">
          <ConstraintEditor raws={raws} setRaws={setRaws} dims="3d" />
        </Section>
        <Section title="Exploración">
          <SliderRow label="θ (grados)" value={thetaDeg} min={0} max={360} step={0.5} onChange={setThetaDeg} fmt={(v) => `${fmtNum(v, 1)}°`} color="#f59e0b" />
          {isCyl ? (
            <SliderRow label="r" value={rPos} min={0} max={rMax} step={rMax / 300} onChange={setRPos} fmt={fmtNum} color="#0891b2" />
          ) : (
            <SliderRow label="φ (grados, desde +z)" value={phiDeg} min={0} max={180} step={0.5} onChange={setPhiDeg} fmt={(v) => `${fmtNum(v, 1)}°`} color="#a855f7" />
          )}
        </Section>
        <Section title="Visualización">
          <SliderRow label="Opacidad del sólido" value={opacity} min={0.05} max={1} onChange={setOpacity} fmt={(v) => `${Math.round(v * 100)}%`} />
          <Toggle checked={wire} onChange={setWire} label="Modo wireframe" />
          <Toggle checked={showSurf} onChange={setShowSurf} label="Superficies completas (sin recortar)" />
          <Btn onClick={autoFit} className="mt-2 w-full justify-center" title="Encuadra la escena al sólido automáticamente">
            <Scan size={13} /> Encuadrar región
          </Btn>
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
              {isCyl ? (
                <CylindricalGuides theta={theta} r={rPos} zIn={zIn} zOut={zOut} a={a} b={b} rMax={rMax} />
              ) : (
                <SphericalGuides theta={theta} phi={phi} rhoIn={rhoEntry} rhoOut={rhoExit} rMax={rhoMax * 0.7} />
              )}
              {wedge && <WarpedBox {...wedge} />}
            </Scene3D>
          </div>
          <div className="flex w-[340px] shrink-0 flex-col border-l border-line bg-white">
            <PanelTitle>{isCyl ? 'Base en coordenadas (θ, r)' : 'Ángulos (θ, φ)'}</PanelTitle>
            <div className="min-h-0 flex-1">
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
            <PanelHint>Click en el panel para mover {isCyl ? 'θ y r' : 'θ y φ'} · arrastrar = mover la vista</PanelHint>
          </div>
        </div>
        <LimitsDock
          tex={activePreset?.limitsTex ?? templateTex}
          jacobianTex={jacTex}
          live={
            isCyl
              ? [
                  {
                    label: 'r ∈ (θ actual)',
                    value: rIntervals.length
                      ? `[${fmtNum(rIntervals[0].a)}, ${fmtNum(rIntervals[rIntervals.length - 1].b)}]`
                      : '—',
                    color: '#0891b2',
                  },
                  {
                    label: 'z ∈ (r, θ actual)',
                    value:
                      zIn !== null && zOut !== null ? `[${fmtNum(zIn)}, ${fmtNum(zOut)}]` : 'fuera',
                    color: '#a855f7',
                  },
                  ...(zHit?.entry?.constraint
                    ? [{ label: 'piso', value: zHit.entry.constraint.raw, color: '#16a34a' }]
                    : []),
                  ...(zHit?.exit?.constraint
                    ? [{ label: 'techo', value: zHit.exit.constraint.raw, color: '#dc2626' }]
                    : []),
                ]
              : [
                  {
                    label: 'ρ ∈',
                    value:
                      rhoEntry !== null && rhoExit !== null
                        ? `[${fmtNum(rhoEntry)}, ${fmtNum(rhoExit)}]`
                        : '—',
                    color: '#a855f7',
                  },
                  { label: 'θ', value: `${fmtNum(thetaDeg, 1)}°`, color: '#f59e0b' },
                  { label: 'φ', value: `${fmtNum(phiDeg, 1)}°`, color: '#a855f7' },
                ]
          }
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
