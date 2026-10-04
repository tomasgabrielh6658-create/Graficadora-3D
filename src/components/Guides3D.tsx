import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Arc3D, Arrow3D, Label3D, type Vec3 } from './Scene3D'
import { cylForward, sphForward } from '../lib/transforms'

export function ThetaArc({ theta, radius, color = '#f59e0b' }: { theta: number; radius: number; color?: string }) {
  const pts = useMemo(() => {
    const p: Vec3[] = []
    const n = Math.max(8, Math.ceil((Math.abs(theta) / Math.PI) * 40))
    for (let i = 0; i <= n; i++) {
      const t = (theta * i) / n
      p.push([radius * Math.cos(t), radius * Math.sin(t), 0])
    }
    return p
  }, [theta, radius])
  const end = pts[pts.length - 1]
  return (
    <group>
      <Arc3D points={pts} color={color} />
      <Arc3D points={[[0, 0, 0], end]} color={color} />
      <Arc3D points={[[0, 0, 0], [radius, 0, 0]]} color={color} dashed />
      <Label3D p={[radius * 1.15 * Math.cos(theta / 2), radius * 1.15 * Math.sin(theta / 2), 0]} text="θ" color={color} />
    </group>
  )
}

export function PhiArc({ theta, phi, radius, color = '#a855f7' }: { theta: number; phi: number; radius: number; color?: string }) {
  const pts = useMemo(() => {
    const p: Vec3[] = []
    const n = Math.max(8, Math.ceil((Math.abs(phi) / Math.PI) * 40))
    for (let i = 0; i <= n; i++) {
      const t = (phi * i) / n
      p.push([
        radius * Math.sin(t) * Math.cos(theta),
        radius * Math.sin(t) * Math.sin(theta),
        radius * Math.cos(t),
      ])
    }
    return p
  }, [theta, phi, radius])
  return (
    <group>
      <Arc3D points={pts} color={color} />
      <Label3D
        p={[
          radius * 1.18 * Math.sin(phi / 2) * Math.cos(theta),
          radius * 1.18 * Math.sin(phi / 2) * Math.sin(theta),
          radius * 1.18 * Math.cos(phi / 2),
        ]}
        text="φ"
        color={color}
      />
    </group>
  )
}

export function CylindricalGuides({
  theta, r, zIn, zOut, a = 1, b = 1, rMax,
}: {
  theta: number
  r: number | null
  zIn: number | null
  zOut: number | null
  a?: number
  b?: number
  rMax: number
}) {
  const pt = r !== null ? cylForward(r, theta, 0, a, b) : null
  return (
    <group>
      <ThetaArc theta={theta} radius={rMax * 0.35} />
      {pt && (
        <Arrow3D
          from={[0, 0, 0]}
          to={[pt[0], pt[1], 0]}
          color="#f59e0b"
        />
      )}
      {pt && zIn !== null && zOut !== null && (
        <Arrow3D
          from={[pt[0], pt[1], zIn]}
          to={[pt[0], pt[1], zOut]}
          color="#a855f7"
        />
      )}
      {pt && <Label3D p={[pt[0] * 0.55, pt[1] * 0.55, 0]} text="r" color="#f59e0b" />}
    </group>
  )
}

export function SphericalGuides({
  theta, phi, rhoIn, rhoOut, rMax,
}: {
  theta: number
  phi: number
  rhoIn: number | null
  rhoOut: number | null
  rMax: number
}) {
  const pIn = rhoIn !== null ? sphForward(rhoIn, theta, phi) : null
  const pOut = rhoOut !== null ? sphForward(rhoOut, theta, phi) : null
  const dir = sphForward(1, theta, phi)
  const proj: Vec3 = [
    Math.sin(phi) * Math.cos(theta),
    Math.sin(phi) * Math.sin(theta),
    0,
  ]
  return (
    <group>
      <ThetaArc theta={theta} radius={rMax * 0.32} />
      <PhiArc theta={theta} phi={phi} radius={rMax * 0.32} />
      <Arc3D points={[[0, 0, 0], [proj[0] * rMax * 0.32, proj[1] * rMax * 0.32, 0]]} color="#64748b" dashed />
      {pIn && pOut ? (
        <Arrow3D from={pIn} to={pOut} color="#a855f7" />
      ) : (
        <Arrow3D from={[0, 0, 0]} to={[dir[0] * rMax * 0.5, dir[1] * rMax * 0.5, dir[2] * rMax * 0.5]} color="#a855f7" />
      )}
      <Arc3D points={[[0, 0, 0], [dir[0] * rMax, dir[1] * rMax, dir[2] * rMax]]} color="#a855f7" dashed />
      {pOut && <Label3D p={[pOut[0], pOut[1], pOut[2] + 0.12]} text="ρ₂" color="#dc2626" />}
      {pIn && <Label3D p={[pIn[0], pIn[1], pIn[2] + 0.12]} text="ρ₁" color="#16a34a" />}
    </group>
  )
}

export function WarpedBox({
  map, u0, u1, v0, v1, w0, w1, color = '#f59e0b', opacity = 0.85,
}: {
  map: (u: number, v: number, w: number) => Vec3
  u0: number; u1: number; v0: number; v1: number; w0: number; w1: number
  color?: string
  opacity?: number
}) {
  const geo = useMemo(() => {
    const c = (u: number, v: number, w: number) => map(u, v, w)
    const p = [
      c(u0, v0, w0), c(u1, v0, w0), c(u1, v1, w0), c(u0, v1, w0),
      c(u0, v0, w1), c(u1, v0, w1), c(u1, v1, w1), c(u0, v1, w1),
    ]
    const faces = [
      [0, 1, 2], [0, 2, 3],
      [4, 6, 5], [4, 7, 6],
      [0, 4, 5], [0, 5, 1],
      [1, 5, 6], [1, 6, 2],
      [2, 6, 7], [2, 7, 3],
      [3, 7, 4], [3, 4, 0],
    ]
    const positions = new Float32Array(faces.length * 9)
    faces.forEach((f, i) => {
      f.forEach((vi, k) => {
        positions[(i * 3 + k) * 3] = p[vi][0]
        positions[(i * 3 + k) * 3 + 1] = p[vi][1]
        positions[(i * 3 + k) * 3 + 2] = p[vi][2]
      })
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.computeVertexNormals()
    return g
  }, [u0, u1, v0, v1, w0, w1])
  useEffect(() => () => geo.dispose(), [geo])
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color={color} transparent opacity={opacity} side={THREE.DoubleSide} />
    </mesh>
  )
}
