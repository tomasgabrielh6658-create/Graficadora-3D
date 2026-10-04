export type Axis = 'x' | 'y' | 'z'

export type SweepType2D = 'T1' | 'T2'

export type IntegrationOrder3D =
  | 'dz_dy_dx'
  | 'dz_dx_dy'
  | 'dx_dz_dy'
  | 'dx_dy_dz'
  | 'dy_dz_dx'
  | 'dy_dx_dz'

export interface CompiledConstraint {
  id: string
  raw: string
  latex: string
  color: string
  visible: boolean
  kind: 'le' | 'ge'
  field: (x: number, y: number, z: number) => number
  boundary: (x: number, y: number, z: number) => number
}

export interface Interval {
  a: number
  b: number
}

export interface BoundaryHit {
  t: number
  constraint: CompiledConstraint | null
}

export interface SweepHit {
  intervals: Interval[]
  entry: BoundaryHit | null
  exit: BoundaryHit | null
}

export interface BBox {
  x0: number
  x1: number
  y0: number
  y1: number
  z0: number
  z1: number
}

export const ORDER_INFO: Record<
  IntegrationOrder3D,
  { pierce: Axis; mid: Axis; outer: Axis; plane: 'xy' | 'yz' | 'xz'; typeLabel: string; tex: string }
> = {
  dz_dy_dx: { pierce: 'z', mid: 'y', outer: 'x', plane: 'xy', typeLabel: 'S₁₂ · T1', tex: 'dz\\,dy\\,dx' },
  dz_dx_dy: { pierce: 'z', mid: 'x', outer: 'y', plane: 'xy', typeLabel: 'S₁₂ · T2', tex: 'dz\\,dx\\,dy' },
  dx_dz_dy: { pierce: 'x', mid: 'z', outer: 'y', plane: 'yz', typeLabel: 'S₂₃ · T1', tex: 'dx\\,dz\\,dy' },
  dx_dy_dz: { pierce: 'x', mid: 'y', outer: 'z', plane: 'yz', typeLabel: 'S₂₃ · T2', tex: 'dx\\,dy\\,dz' },
  dy_dz_dx: { pierce: 'y', mid: 'z', outer: 'x', plane: 'xz', typeLabel: 'S₁₃ · T1', tex: 'dy\\,dz\\,dx' },
  dy_dx_dz: { pierce: 'y', mid: 'x', outer: 'z', plane: 'xz', typeLabel: 'S₁₃ · T2', tex: 'dy\\,dx\\,dz' },
}
