import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Line, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { BBox } from '../types'
import type { SolidMesh } from '../lib/marchingTets'

export type Vec3 = [number, number, number]

export function Solid({
  mesh, opacity = 0.5, wireframe = false, depthBias = false,
}: {
  mesh: SolidMesh
  opacity?: number
  wireframe?: boolean
  depthBias?: boolean
}) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3))
    g.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3))
    g.setAttribute('color', new THREE.BufferAttribute(mesh.colors, 3))
    return g
  }, [mesh])
  useEffect(() => () => geo.dispose(), [geo])
  if (mesh.vertexCount === 0) return null
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial
        vertexColors
        transparent
        opacity={opacity}
        depthWrite
        side={THREE.DoubleSide}
        wireframe={wireframe}
        roughness={0.95}
        metalness={0}
        polygonOffset={depthBias}
        polygonOffsetFactor={2}
        polygonOffsetUnits={2}
      />
    </mesh>
  )
}

export function Arrow3D({
  from, to, color = '#a855f7', r = 0.028,
}: {
  from: Vec3
  to: Vec3
  color?: string
  r?: number
}) {
  const { mid, quat, len } = useMemo(() => {
    const a = new THREE.Vector3(...from)
    const b = new THREE.Vector3(...to)
    const d = b.clone().sub(a)
    const len = Math.max(d.length(), 1e-6)
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      d.clone().normalize(),
    )
    return { mid: a.add(b).multiplyScalar(0.5), quat, len }
  }, [from, to])
  const headLen = Math.min(len * 0.35, 0.3)
  return (
    <group>
      <group position={mid} quaternion={quat}>
        <mesh renderOrder={8}>
          <cylinderGeometry args={[r, r, Math.max(len - headLen, 0.01), 12]} />
          <meshBasicMaterial color={color} depthTest={false} />
        </mesh>
        <mesh position={[0, len / 2 - headLen / 2, 0]} renderOrder={8}>
          <coneGeometry args={[r * 3, headLen, 14]} />
          <meshBasicMaterial color={color} depthTest={false} />
        </mesh>
      </group>
      <mesh position={from} renderOrder={8}>
        <sphereGeometry args={[r * 2.6, 16, 16]} />
        <meshBasicMaterial color="#16a34a" depthTest={false} />
      </mesh>
      <mesh position={to} renderOrder={8}>
        <sphereGeometry args={[r * 2.6, 16, 16]} />
        <meshBasicMaterial color="#dc2626" depthTest={false} />
      </mesh>
    </group>
  )
}

export function Ray3D({
  origin, dir, length, color = '#a855f7', r = 0.02,
}: {
  origin: Vec3
  dir: Vec3
  length: number
  color?: string
  r?: number
}) {
  const to: Vec3 = [
    origin[0] + dir[0] * length,
    origin[1] + dir[1] * length,
    origin[2] + dir[2] * length,
  ]
  return <Arrow3D from={origin} to={to} color={color} r={r} />
}

export function Arc3D({
  points, color = '#64748b', dashed = false,
}: {
  points: Vec3[]
  color?: string
  dashed?: boolean
}) {
  return <Line points={points} color={color} lineWidth={2} dashed={dashed} dashSize={0.08} gapSize={0.05} depthTest={false} renderOrder={8} />
}

function niceStep3(range: number, target = 6): number {
  const raw = range / target
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * mag) return m * mag
  return 10 * mag
}

function AxisTicks({ bbox }: { bbox: BBox }) {
  const defs: {
    lo: number
    hi: number
    color: string
    at: (t: number) => Vec3
    tick: (t: number, d: number) => [Vec3, Vec3]
    lab: (t: number) => Vec3
    end: Vec3
    name: string
  }[] = [
    {
      lo: bbox.x0, hi: bbox.x1, color: '#dc2626',
      at: (t) => [t, 0, 0],
      tick: (t, d) => [[t, -d, 0], [t, d, 0]],
      lab: (t) => [t, -0.3, 0],
      end: [bbox.x1, 0, 0], name: 'x',
    },
    {
      lo: bbox.y0, hi: bbox.y1, color: '#16a34a',
      at: (t) => [0, t, 0],
      tick: (t, d) => [[-d, t, 0], [d, t, 0]],
      lab: (t) => [-0.3, t, 0],
      end: [0, bbox.y1, 0], name: 'y',
    },
    {
      lo: bbox.z0, hi: bbox.z1, color: '#2563eb',
      at: (t) => [0, 0, t],
      tick: (t, d) => [[-d, 0, t], [d, 0, t]],
      lab: (t) => [0, -0.3, t],
      end: [0, 0, bbox.z1], name: 'z',
    },
  ]
  const span = Math.max(bbox.x1 - bbox.x0, bbox.y1 - bbox.y0, bbox.z1 - bbox.z0)
  const tickR = span * 0.018
  return (
    <group>
      {defs.map((a) => {
        // El eje se extiende a marcas "lindas" más allá del cuerpo (estilo GeoGebra):
        // no depende de dónde termina el sólido.
        const step = niceStep3(a.hi - a.lo)
        const lo = Math.floor(a.lo / step) * step - step
        const hi = Math.ceil(a.hi / step) * step + step
        const ticks: number[] = []
        for (let t = lo; t <= hi + 1e-9; t += step) {
          ticks.push(Math.abs(t) < 1e-9 ? 0 : Math.round(t * 1e6) / 1e6)
        }
        return (
          <group key={a.name}>
            <Line
              points={[a.at(lo), a.at(hi)]}
              color={a.color}
              lineWidth={1.6}
            />
            {ticks.map((t) => (
              <Line key={t} points={a.tick(t, tickR)} color={a.color} lineWidth={1.2} />
            ))}
            {ticks.filter((t) => t !== 0).map((t) => (
              <Label3D key={`l${t}`} p={a.lab(t)} text={String(Math.round(t * 1000) / 1000)} color={a.color} size={span * 0.045} occluded />
            ))}
          </group>
        )
      })}
      <Label3D p={[span * 0.05, -span * 0.05, 0]} text="0" color="#64748b" size={span * 0.045} occluded />
    </group>
  )
}

function makeTextSprite(text: string, color: string, size: number, occluded: boolean): THREE.Sprite {
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')!
  const font = '600 30px ui-monospace, monospace'
  ctx.font = font
  const w = Math.ceil(ctx.measureText(text).width) + 14
  c.width = w
  c.height = 44
  ctx.font = font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 7
  ctx.strokeStyle = 'rgba(241,245,249,0.95)'
  ctx.strokeText(text, w / 2, 22)
  ctx.fillStyle = color
  ctx.fillText(text, w / 2, 22)
  const tex = new THREE.CanvasTexture(c)
  tex.anisotropy = 4
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: occluded }),
  )
  sprite.scale.set((size * w) / 44, size, 1)
  if (!occluded) sprite.renderOrder = 8
  return sprite
}

export function Label3D({
  p, text, color = '#334155', size = 0.3, occluded = false,
}: {
  p: Vec3
  text: string
  color?: string
  size?: number
  occluded?: boolean
}) {
  const sprite = useMemo(() => makeTextSprite(text, color, size, occluded), [text, color, size, occluded])
  useEffect(
    () => () => {
      sprite.material.map?.dispose()
      sprite.material.dispose()
    },
    [sprite],
  )
  return <primitive object={sprite} position={p} />
}

function ViewSetter({ api, center, radius }: {
  api: React.MutableRefObject<((v: string) => void) | null>
  center: Vec3
  radius: number
}) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3; update: () => void } | null
  useEffect(() => {
    api.current = (v: string) => {
      const d = radius * 2.2
      const pos: Vec3 =
        v === 'top' ? [center[0], center[1], center[2] + d]
        : v === 'front' ? [center[0], center[1] - d, center[2]]
        : v === 'side' ? [center[0] + d, center[1], center[2]]
        : [center[0] + d * 0.75, center[1] - d * 0.9, center[2] + d * 0.7]
      camera.up.set(0, 0, 1)
      camera.position.set(...pos)
      if (controls) {
        controls.target.set(...center)
        controls.update()
      }
    }
    api.current('home')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, controls])
  return null
}

export function Scene3D({
  children, bbox, onViewApi,
}: {
  children: ReactNode
  bbox: BBox
  onViewApi?: (api: (v: string) => void) => void
}) {
  const apiRef = useRef<((v: string) => void) | null>(null)
  const center: Vec3 = [
    (bbox.x0 + bbox.x1) / 2,
    (bbox.y0 + bbox.y1) / 2,
    (bbox.z0 + bbox.z1) / 2,
  ]
  const radius =
    Math.max(bbox.x1 - bbox.x0, bbox.y1 - bbox.y0, bbox.z1 - bbox.z0) / 2
  const axisLen = radius * 1.15
  return (
    <div className="relative h-full w-full">
      <Canvas
        frameloop="demand"
        dpr={[1, 1.75]}
        camera={{ position: [center[0] + radius * 1.7, center[1] - radius * 2, center[2] + radius * 1.3], up: [0, 0, 1], fov: 45 }}
      >
        <color attach="background" args={['#f1f5f9']} />
        <ambientLight intensity={0.75} />
        <directionalLight position={[6, -4, 9]} intensity={1.4} />
        <directionalLight position={[-5, 6, -3]} intensity={0.4} />
        <AxisTicks bbox={bbox} />
        <gridHelper
          args={[axisLen * 2, Math.max(4, Math.round(axisLen)), '#cbd5e1', '#e2e8f0']}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0, 0]}
        />
        <Label3D p={[bbox.x1 + axisLen * 0.06, 0, 0]} text="x" color="#dc2626" size={axisLen * 0.13} occluded />
        <Label3D p={[0, bbox.y1 + axisLen * 0.06, 0]} text="y" color="#16a34a" size={axisLen * 0.13} occluded />
        <Label3D p={[0, 0, bbox.z1 + axisLen * 0.06]} text="z" color="#2563eb" size={axisLen * 0.13} occluded />
        {children}
        <OrbitControls makeDefault target={center} />
        <ViewSetter api={apiRef} center={center} radius={radius} />
      </Canvas>
      <div className="absolute right-2 top-2 flex gap-1">
        {(['home', 'top', 'front', 'side'] as const).map((v) => (
          <button
            key={v}
            className="rounded-md border border-slate-300 bg-white/90 px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-100"
            onClick={() => apiRef.current?.(v)}
          >
            {{ home: 'Libre', top: 'Sup XY', front: 'Front XZ', side: 'Lat YZ' }[v]}
          </button>
        ))}
      </div>
      {onViewApi && <span ref={() => onViewApi((v: string) => apiRef.current?.(v))} className="hidden" />}
    </div>
  )
}
