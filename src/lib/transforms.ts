import { compileExpressionVars } from './expr'

export interface Transform2D {
  id: 'polar' | 'elliptic' | 'linear' | 'custom'
  label: string
  forward: (u: number, v: number) => [number, number]
  inverse: (x: number, y: number) => [number, number]
  jacobianTex: string
  jacobianAt?: (u: number, v: number) => number
  uLabel: string
  vLabel: string
  uRange: [number, number]
  vRange: [number, number]
  integralTex: string
}

const TAU = Math.PI * 2

export function polarTransform(rMax: number): Transform2D {
  return {
    id: 'polar',
    label: 'Polares circulares',
    forward: (th, r) => [r * Math.cos(th), r * Math.sin(th)],
    inverse: (x, y) => {
      let th = Math.atan2(y, x)
      if (th < 0) th += TAU
      return [th, Math.hypot(x, y)]
    },
    jacobianTex: 'J(r,\\theta) = r',
    uLabel: '\\theta',
    vLabel: 'r',
    uRange: [0, TAU],
    vRange: [0, rMax],
    integralTex: '\\int_{\\theta_1}^{\\theta_2}\\!\\int_{r_1(\\theta)}^{r_2(\\theta)} f\\,\\textcolor{#a855f7}{r}\\,dr\\,d\\theta',
  }
}

export function ellipticTransform(a: number, b: number, rMax: number): Transform2D {
  return {
    id: 'elliptic',
    label: 'Polares elípticas',
    forward: (th, r) => [a * r * Math.cos(th), b * r * Math.sin(th)],
    inverse: (x, y) => {
      let th = Math.atan2(y / b, x / a)
      if (th < 0) th += TAU
      return [th, Math.hypot(x / a, y / b)]
    },
    jacobianTex: 'J(r,\\theta) = a\\cdot b\\cdot r',
    uLabel: '\\theta',
    vLabel: 'r',
    uRange: [0, TAU],
    vRange: [0, rMax],
    integralTex: '\\int_{\\theta_1}^{\\theta_2}\\!\\int_{r_1(\\theta)}^{r_2(\\theta)} f\\,\\textcolor{#a855f7}{a\\,b\\,r}\\,dr\\,d\\theta',
  }
}

export function linearTransform(
  a: number,
  b: number,
  c: number,
  d: number,
  uMax: number,
  vMax: number,
): Transform2D {
  const det = a * d - b * c
  const inv = (x: number, y: number): [number, number] => [a * x + b * y, c * x + d * y]
  const fwd = (u: number, v: number): [number, number] =>
    Math.abs(det) < 1e-12 ? [NaN, NaN] : [(d * u - b * v) / det, (-c * u + a * v) / det]
  return {
    id: 'linear',
    label: 'Transformación lineal',
    forward: fwd,
    inverse: inv,
    jacobianTex: `|J| = \\frac{1}{|ad-bc|} = ${fmtNum(Math.abs(det) < 1e-12 ? NaN : 1 / Math.abs(det))}`,
    uLabel: 'u',
    vLabel: 'v',
    uRange: [-uMax, uMax],
    vRange: [-vMax, vMax],
    integralTex: '\\int_{u_1}^{u_2}\\!\\int_{v_1(u)}^{v_2(u)} f\\,\\textcolor{#a855f7}{|J|}\\,dv\\,du',
  }
}

export interface CustomSpec {
  xExpr: string
  yExpr: string
  u0: number
  u1: number
  v0: number
  v1: number
}

export function customTransform(spec: CustomSpec): { T: Transform2D } | { error: string } {
  let X: (u: number, v: number) => number
  let Y: (u: number, v: number) => number
  let texX = '', texY = ''
  try {
    const cx = compileExpressionVars(spec.xExpr, ['u', 'v'])
    const cy = compileExpressionVars(spec.yExpr, ['u', 'v'])
    X = cx.fn
    Y = cy.fn
    texX = cx.tex
    texY = cy.tex
  } catch (e) {
    return { error: (e as Error).message }
  }
  const h = 1e-5
  const jacobianAt = (u: number, v: number) => {
    const dxdu = (X(u + h, v) - X(u - h, v)) / (2 * h)
    const dxdv = (X(u, v + h) - X(u, v - h)) / (2 * h)
    const dydu = (Y(u + h, v) - Y(u - h, v)) / (2 * h)
    const dydv = (Y(u, v + h) - Y(u, v - h)) / (2 * h)
    return Math.abs(dxdu * dydv - dxdv * dydu)
  }
  const inverse = (x: number, y: number): [number, number] => {
    let u = (spec.u0 + spec.u1) / 2
    let v = (spec.v0 + spec.v1) / 2
    for (let i = 0; i < 25; i++) {
      const fx = X(u, v) - x
      const fy = Y(u, v) - y
      if (Math.hypot(fx, fy) < 1e-10) break
      const dxdu = (X(u + h, v) - X(u - h, v)) / (2 * h)
      const dxdv = (X(u, v + h) - X(u, v - h)) / (2 * h)
      const dydu = (Y(u + h, v) - Y(u - h, v)) / (2 * h)
      const dydv = (Y(u, v + h) - Y(u, v - h)) / (2 * h)
      const det = dxdu * dydv - dxdv * dydu
      if (Math.abs(det) < 1e-12 || !Number.isFinite(det)) return [NaN, NaN]
      const du = (dydv * fx - dxdv * fy) / det
      const dv = (-dydu * fx + dxdu * fy) / det
      u -= du
      v -= dv
      if (!Number.isFinite(u) || !Number.isFinite(v)) return [NaN, NaN]
    }
    return [u, v]
  }
  return {
    T: {
      id: 'custom',
      label: 'Transformación general',
      forward: (u, v) => [X(u, v), Y(u, v)],
      inverse,
      jacobianTex: '|J| = \\left|\\dfrac{\\partial(x,y)}{\\partial(u,v)}\\right|',
      jacobianAt,
      uLabel: 'u',
      vLabel: 'v',
      uRange: [spec.u0, spec.u1],
      vRange: [spec.v0, spec.v1],
      integralTex: `x = ${texX},\\; y = ${texY} \\;\\Rightarrow\\; \\iint_D f\\,|J|\\,du\\,dv`,
    },
  }
}

export function fmtNum(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return '?'
  const r = Math.round(v * 10 ** digits) / 10 ** digits
  return String(r)
}

export function sphForward(rho: number, theta: number, phi: number): [number, number, number] {
  const s = Math.sin(phi)
  return [rho * s * Math.cos(theta), rho * s * Math.sin(theta), rho * Math.cos(phi)]
}

export function cylForward(r: number, theta: number, z: number, a = 1, b = 1): [number, number, number] {
  return [a * r * Math.cos(theta), b * r * Math.sin(theta), z]
}
