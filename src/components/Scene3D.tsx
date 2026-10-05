import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Axis3d, Box, Grid3x3, ImageDown, Maximize, Minus, Plus, RotateCw } from 'lucide-react'
import { Canvas, useThree } from '@react-three/fiber'
import { Line, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { BBox } from '../types'
import type { SolidMesh } from '../lib/marchingTets'
import { bboxRadius, fitDistance, fitZoom, FOV, viewPose, type ViewName } from '../lib/camera'
import { DPR } from '../lib/lowpower'

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
  // separación de las etiquetas en dos direcciones: se leen en 3D y en las vistas planas
  const lo3 = Math.max(bbox.x1 - bbox.x0, bbox.y1 - bbox.y0, bbox.z1 - bbox.z0) * 0.035
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
      lab: (t) => [t, -lo3, -lo3],
      end: [bbox.x1, 0, 0], name: 'x',
    },
    {
      lo: bbox.y0, hi: bbox.y1, color: '#16a34a',
      at: (t) => [0, t, 0],
      tick: (t, d) => [[-d, t, 0], [d, t, 0]],
      lab: (t) => [-lo3, t, -lo3],
      end: [0, bbox.y1, 0], name: 'y',
    },
    {
      lo: bbox.z0, hi: bbox.z1, color: '#2563eb',
      at: (t) => [0, 0, t],
      tick: (t, d) => [[-d, 0, t], [d, 0, t]],
      lab: (t) => [-lo3, -lo3, t],
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
      <Label3D p={[span * 0.05, -span * 0.05, 0]} text="0" color="#6b6b78" size={span * 0.045} occluded />
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
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'
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

type Api = {
  view: (v: ViewName) => void
  zoom: (f: number) => void
  snap: () => string
}

/**
 * Controla la cámara desde adentro del Canvas: encuadra al montar y cada vez
 * que cambia el bbox (cambio de ejercicio / "encuadrar"), aplica las vistas
 * planas y el zoom de los botones, y exporta la imagen.
 */
function CameraRig({ api, bbox, ortho }: { api: React.MutableRefObject<Api | null>; bbox: BBox; ortho: boolean }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null
  const bboxKey = `${bbox.x0},${bbox.x1},${bbox.y0},${bbox.y1},${bbox.z0},${bbox.z1}`
  const sizeRef = useRef(size)
  sizeRef.current = size

  useEffect(() => {
    const view = (v: ViewName) => {
      const pose = viewPose(bbox, v)
      camera.up.set(0, 0, 1)
      if (ortho) {
        camera.position.set(...pose.position)
        const oc = camera as THREE.OrthographicCamera
        oc.zoom = fitZoom(bbox, sizeRef.current.width, sizeRef.current.height)
        oc.near = -bboxRadius(bbox) * 50
        oc.far = bboxRadius(bbox) * 50
      } else {
        const c = pose.target
        const d = fitDistance(bbox)
        const dir = new THREE.Vector3(...pose.position).sub(new THREE.Vector3(...c)).normalize()
        camera.position.set(c[0] + dir.x * d, c[1] + dir.y * d, c[2] + dir.z * d)
        const pc = camera as THREE.PerspectiveCamera
        pc.near = d / 100
        pc.far = d * 20
      }
      camera.lookAt(...pose.target)
      camera.updateProjectionMatrix()
      if (controls) {
        controls.target.set(...pose.target)
        controls.update()
      }
      invalidate()
    }
    api.current = {
      view,
      zoom: (f) => {
        if (ortho) {
          ;(camera as THREE.OrthographicCamera).zoom *= f
        } else if (controls) {
          const off = camera.position.clone().sub(controls.target).multiplyScalar(1 / f)
          camera.position.copy(controls.target).add(off)
        }
        camera.updateProjectionMatrix()
        controls?.update()
        invalidate()
      },
      snap: () => {
        gl.render(scene, camera)
        return gl.domElement.toDataURL('image/png')
      },
    }
    view('home')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, controls, bboxKey, ortho])
  return null
}

export function Scene3D({
  children, bbox,
}: {
  children: ReactNode
  bbox: BBox
}) {
  const apiRef = useRef<Api | null>(null)
  const [ortho, setOrtho] = useState(true)
  const [spin, setSpin] = useState(false)
  const [axes, setAxes] = useState(true)
  const [grid, setGrid] = useState(true)
  const radius = Math.max(bbox.x1 - bbox.x0, bbox.y1 - bbox.y0, bbox.z1 - bbox.z0) / 2
  const axisLen = radius * 1.15
  const savePng = () => {
    const url = apiRef.current?.snap()
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = 'solido-3d.png'
    a.click()
  }
  const tool = 'grid h-7 w-7 place-items-center text-ink hover:bg-cobalt hover:text-white'
  const on = (v: boolean) => (v ? 'bg-cobalt-50 text-cobalt' : '')
  return (
    <div className="relative h-full w-full">
      <Canvas
        key={ortho ? 'o' : 'p'}
        orthographic={ortho}
        frameloop={spin ? 'always' : 'demand'}
        dpr={DPR}
        gl={{ antialias: true }}
        camera={ortho ? { zoom: 60, up: [0, 0, 1], position: [5, -8, 5] } : { fov: FOV, up: [0, 0, 1], position: [5, -8, 5] }}
      >
        <color attach="background" args={['#ffffff']} />
        <ambientLight intensity={0.75} />
        <directionalLight position={[6, -4, 9]} intensity={1.4} />
        <directionalLight position={[-5, 6, -3]} intensity={0.4} />
        {axes && (
          <>
            <AxisTicks bbox={bbox} />
            <Label3D p={[bbox.x1 + axisLen * 0.06, 0, 0]} text="x" color="#dc2626" size={axisLen * 0.13} occluded />
            <Label3D p={[0, bbox.y1 + axisLen * 0.06, 0]} text="y" color="#16a34a" size={axisLen * 0.13} occluded />
            <Label3D p={[0, 0, bbox.z1 + axisLen * 0.06]} text="z" color="#2563eb" size={axisLen * 0.13} occluded />
          </>
        )}
        {grid && (
          <gridHelper
            args={[axisLen * 2, Math.max(4, Math.round(axisLen)), '#d6d6de', '#eeeef2']}
            rotation={[Math.PI / 2, 0, 0]}
            position={[0, 0, 0]}
          />
        )}
        {children}
        <OrbitControls makeDefault autoRotate={spin} autoRotateSpeed={1.2} enableDamping={false} />
        <CameraRig api={apiRef} bbox={bbox} ortho={ortho} />
      </Canvas>
      <div className="absolute right-3 top-3 flex flex-col items-end gap-1.5">
        <div className="flex border border-ink bg-white text-[10.5px] shadow-[2px_2px_0_0_rgba(11,11,16,0.08)]">
          {(['home', 'top', 'front', 'side'] as const).map((v, i) => (
            <button
              key={v}
              className={`px-2.5 py-1 font-medium text-ink hover:bg-cobalt hover:text-white ${i ? 'border-l border-line' : ''}`}
              onClick={() => apiRef.current?.view(v)}
              title={{ home: 'Vista 3D', top: 'Mirar desde arriba (plano XY)', front: 'Mirar de frente (plano XZ)', side: 'Mirar de costado (plano YZ)' }[v]}
            >
              {{ home: '3D', top: 'XY', front: 'XZ', side: 'YZ' }[v]}
            </button>
          ))}
        </div>
        <div className="flex flex-col border border-line bg-white shadow-[2px_2px_0_0_rgba(11,11,16,0.06)] [&>*+*]:border-t [&>*+*]:border-line">
          <button className={tool} title="Acercar" onClick={() => apiRef.current?.zoom(1.25)}><Plus size={14} /></button>
          <button className={tool} title="Alejar" onClick={() => apiRef.current?.zoom(0.8)}><Minus size={14} /></button>
          <button className={tool} title="Encuadrar el sólido" onClick={() => apiRef.current?.view('home')}><Maximize size={13} /></button>
          <button className={`${tool} ${on(spin)}`} title="Girar automáticamente" onClick={() => setSpin((v) => !v)}><RotateCw size={13} /></button>
          <button className={`${tool} ${on(axes)}`} title="Mostrar/ocultar ejes" onClick={() => setAxes((v) => !v)}><Axis3d size={14} /></button>
          <button className={`${tool} ${on(grid)}`} title="Mostrar/ocultar grilla" onClick={() => setGrid((v) => !v)}><Grid3x3 size={13} /></button>
          <button
            className={`${tool} ${on(!ortho)}`}
            title={ortho ? 'Cambiar a perspectiva (los objetos lejanos se ven más chicos)' : 'Volver a ortográfica (sin deformación, como GeoGebra)'}
            onClick={() => setOrtho((v) => !v)}
          >
            <Box size={13} />
          </button>
          <button className={tool} title="Descargar imagen PNG" onClick={savePng}><ImageDown size={13} /></button>
        </div>
      </div>
    </div>
  )
}
