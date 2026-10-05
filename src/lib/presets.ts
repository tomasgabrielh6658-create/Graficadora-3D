import type { BBox, IntegrationOrder3D } from '../types'
import { PALETTE } from './expr'

export interface RawConstraint {
  raw: string
  side: 'le' | 'ge'
  color: string
  visible: boolean
}

export interface Preset {
  id: string
  module: 1 | 2 | 3 | 4
  name: string
  constraints: Omit<RawConstraint, 'color'>[]
  settings?: {
    sweep?: 'T1' | 'T2'
    order?: IntegrationOrder3D
    transform?: 'polar' | 'elliptic' | 'linear' | 'custom'
    mode?: 'cyl' | 'cyle' | 'sph'
    a?: number
    b?: number
    custom?: { x: string; y: string; u0: number; u1: number; v0: number; v1: number }
  }
  bbox?: Partial<BBox>
  limitsTex?: string
  note?: string
}

const C = (raw: string, side: 'le' | 'ge' = 'le'): Omit<RawConstraint, 'color'> => ({
  raw,
  side,
  visible: true,
})

export function presetRaws(p: Preset): RawConstraint[] {
  return p.constraints.map((c, i) => ({ ...c, color: PALETTE[i % PALETTE.length] }))
}

export const PRESETS: Preset[] = [
  {
    id: 'm1-parab-recta',
    module: 1,
    name: 'Parábola y recta: x² ≤ y ≤ x',
    constraints: [C('y >= x^2'), C('y <= x')],
    settings: { sweep: 'T1' },
    limitsTex: '\\int_{0}^{1}\\!\\int_{x^2}^{x} f\\,dy\\,dx',
  },
  {
    id: 'm1-lente',
    module: 1,
    name: 'Lente entre parábolas (en dx dy hay que partir)',
    constraints: [C('y >= x^2'), C('y <= 2 - x^2')],
    settings: { sweep: 'T1' },
    limitsTex: '\\int_{-1}^{1}\\!\\int_{x^2}^{2-x^2} f\\,dy\\,dx',
    note: 'En dy dx es una sola integral; en dx dy el borde cambia en y = 1 y hay que partir.',
  },
  {
    id: 'm1-cuadrante',
    module: 1,
    name: 'Bajo y = 2 − x² en el primer cuadrante',
    constraints: [C('y >= 0'), C('y <= 2 - x^2'), C('x >= 0')],
    settings: { sweep: 'T1' },
    limitsTex: '\\int_{0}^{\\sqrt{2}}\\!\\int_{0}^{2-x^2} f\\,dy\\,dx',
  },
  {
    id: 'm1-sqrt',
    module: 1,
    name: 'Bajo y = √x entre 0 y 4',
    constraints: [C('y >= 0'), C('y <= sqrt(x)'), C('x <= 4'), C('x >= 0')],
    settings: { sweep: 'T1' },
    limitsTex: '\\int_{0}^{4}\\!\\int_{0}^{\\sqrt{x}} f\\,dy\\,dx',
  },
  {
    id: 'm1-tp13-1f',
    module: 1,
    name: 'TP13 1f — Entre x=y² y x=y+2',
    constraints: [C('y >= -1'), C('y <= 2'), C('x >= y^2'), C('x <= y + 2')],
    settings: { sweep: 'T2' },
    limitsTex: '\\int_{-1}^{2}\\!\\int_{y^2}^{y+2} f\\,dx\\,dy',
    note: 'En dx dy es una sola integral; en dy dx hay que partir en x = 1.',
  },
  {
    id: 'm1-tp13-2',
    module: 1,
    name: 'TP13 2 — y=2x, y=2−x, y=8',
    constraints: [C('y >= 2*x'), C('y >= 2 - x'), C('y <= 8')],
    settings: { sweep: 'T1' },
    limitsTex: '\\int_{4/3}^{8}\\!\\int_{2-y}^{y/2} f\\,dx\\,dy',
    note: 'En dy dx hay que partir en x = 2/3 (dos integrales); en dx dy es una sola.',
  },
  {
    id: 'm1-tp13-4c',
    module: 1,
    name: 'TP13 4c — y=x³, x=0, y=8',
    constraints: [C('y >= x^3'), C('y <= 8'), C('x >= 0')],
    settings: { sweep: 'T1' },
    limitsTex: '\\int_{0}^{2}\\!\\int_{x^3}^{8} f\\,dy\\,dx',
  },
  {
    id: 'm1-tp13-10',
    module: 1,
    name: 'TP13 10 — Hipérbolas xy∈[1,2] entre y=x e y=4x',
    constraints: [C('x*y >= 1'), C('x*y <= 2'), C('y >= x'), C('y <= 4*x')],
    settings: { sweep: 'T1' },
    note: 'Esta misma región está en “Cambio de variables” con u = xy, v = y/x: ahí queda un rectángulo.',
  },
  {
    id: 'm2-corona',
    module: 2,
    name: 'Corona circular 1 ≤ r ≤ 2',
    constraints: [C('x^2 + y^2 >= 1'), C('x^2 + y^2 <= 4')],
    settings: { transform: 'polar' },
    limitsTex: '\\int_{0}^{2\\pi}\\!\\int_{1}^{2} f\\,r\\,dr\\,d\\theta',
  },
  {
    id: 'm2-sector',
    module: 2,
    name: 'Sector de corona bajo y = x (θ ≤ π/4)',
    constraints: [C('x^2 + y^2 >= 1'), C('x^2 + y^2 <= 4'), C('y >= 0'), C('y <= x')],
    settings: { transform: 'polar' },
    limitsTex: '\\int_{0}^{\\pi/4}\\!\\int_{1}^{2} f\\,r\\,dr\\,d\\theta',
  },
  {
    id: 'm2-elipse',
    module: 2,
    name: 'Elipse x²/9 + y²/4 ≤ 1 (polares elípticas)',
    constraints: [C('x^2/9 + y^2/4 <= 1')],
    settings: { transform: 'elliptic', a: 3, b: 2 },
    limitsTex: '\\int_{0}^{2\\pi}\\!\\int_{0}^{1} f\\,6r\\,dr\\,d\\theta',
  },
  {
    id: 'm2-hiperbolas',
    module: 2,
    name: 'TP13 10 — Hipérbolas: u=xy, v=y/x',
    constraints: [C('x*y >= 1'), C('x*y <= 2'), C('y >= x'), C('y <= 4*x')],
    settings: {
      transform: 'custom',
      custom: { x: 'sqrt(u/v)', y: 'sqrt(u*v)', u0: 0.5, u1: 2.5, v0: 0.5, v1: 4.5 },
    },
    limitsTex: '\\int_{1}^{2}\\!\\int_{1}^{4} f\\,\\frac{1}{2v}\\,dv\\,du',
    note: 'La transformación u=xy, v=y/x convierte la región en un rectángulo u∈[1,2], v∈[1,4].',
  },
  {
    id: 'm3-parab-plano',
    module: 3,
    name: 'Paraboloide y plano: x²+y² ≤ z ≤ 4',
    constraints: [C('z >= x^2 + y^2'), C('z <= 4')],
    settings: { order: 'dz_dy_dx' },
    bbox: { x0: -2.6, x1: 2.6, y0: -2.6, y1: 2.6, z0: -0.5, z1: 4.6 },
    limitsTex: '\\int_{-2}^{2}\\!\\int_{-\\sqrt{4-x^2}}^{\\sqrt{4-x^2}}\\!\\int_{x^2+y^2}^{4} f\\,dz\\,dy\\,dx',
  },
  {
    id: 'm3-tetraedro',
    module: 3,
    name: 'Tetraedro x+y+z ≤ 1 (1er octante)',
    constraints: [C('x + y + z <= 1'), C('x >= 0'), C('y >= 0'), C('z >= 0')],
    settings: { order: 'dz_dy_dx' },
    bbox: { x0: -0.2, x1: 1.2, y0: -0.2, y1: 1.2, z0: -0.2, z1: 1.2 },
    limitsTex: '\\int_{0}^{1}\\!\\int_{0}^{1-x}\\!\\int_{0}^{1-x-y} f\\,dz\\,dy\\,dx',
  },
  {
    id: 'm3-cilindro-planos',
    module: 3,
    name: 'Cilindro entre planos z = 0 y z = 4 − y',
    constraints: [C('x^2 + y^2 <= 4'), C('z >= 0'), C('z <= 4 - y')],
    settings: { order: 'dz_dy_dx' },
    bbox: { x0: -2.6, x1: 2.6, y0: -2.6, y1: 2.6, z0: -0.5, z1: 6.5 },
  },
  {
    id: 'm3-helado',
    module: 3,
    name: 'Cono dentro de esfera ("helado")',
    constraints: [C('z >= sqrt(x^2 + y^2)'), C('x^2 + y^2 + z^2 <= 2')],
    settings: { order: 'dz_dy_dx' },
    bbox: { x0: -1.8, x1: 1.8, y0: -1.8, y1: 1.8, z0: -1.8, z1: 1.8 },
    limitsTex: '\\int_{-1}^{1}\\!\\int_{-\\sqrt{1-x^2}}^{\\sqrt{1-x^2}}\\!\\int_{\\sqrt{x^2+y^2}}^{\\sqrt{2-x^2-y^2}} f\\,dz\\,dy\\,dx',
  },
  {
    id: 'm3-caja-4a',
    module: 3,
    name: 'Ej. 4a — Caja x∈[0,2], y∈[2,6], z∈[3,5]',
    constraints: [
      C('x >= 0'), C('x <= 2'),
      C('y >= 2'), C('y <= 6'),
      C('z >= 3'), C('z <= 5'),
    ],
    settings: { order: 'dz_dy_dx' },
    bbox: { x0: -0.8, x1: 2.8, y0: 1.2, y1: 6.8, z0: 2.2, z1: 5.8 },
    limitsTex: '\\int_{0}^{2}\\!\\int_{2}^{6}\\!\\int_{3}^{5} f\\,dz\\,dy\\,dx',
  },
  {
    id: 'm3-tetra-4b',
    module: 3,
    name: 'Ej. 4b — Tetraedro bajo 3x+2y+z=6',
    constraints: [
      C('3x + 2y + z <= 6'),
      C('x >= 0'), C('y >= 0'), C('z >= 0'),
    ],
    settings: { order: 'dz_dy_dx' },
    bbox: { x0: -0.3, x1: 2.3, y0: -0.3, y1: 3.3, z0: -0.3, z1: 6.3 },
    limitsTex: '\\int_{0}^{2}\\!\\int_{0}^{3-\\frac{3x}{2}}\\!\\int_{0}^{6-3x-2y} f\\,dz\\,dy\\,dx',
  },
  {
    id: 'm3-tp14-2a',
    module: 3,
    name: 'TP14 2a — Cilindro r=2 + cilindro parabólico x²+2z=4 (1er oct.)',
    constraints: [
      C('x^2 + y^2 <= 4'), C('x^2 + 2*z <= 4'),
      C('x >= 0'), C('y >= 0'), C('z >= 0'),
    ],
    settings: { order: 'dz_dy_dx' },
    limitsTex: '\\int_{0}^{2}\\!\\int_{0}^{\\sqrt{4-x^2}}\\!\\int_{0}^{\\frac{4-x^2}{2}} f\\,dz\\,dy\\,dx',
  },
  {
    id: 'm3-tp14-4c',
    module: 3,
    name: 'TP14 4c — Paraboloide y z=4 en el primer octante',
    constraints: [C('z >= x^2 + y^2'), C('z <= 4'), C('x >= 0'), C('y >= 0')],
    settings: { order: 'dz_dy_dx' },
    limitsTex: '\\int_{0}^{2}\\!\\int_{0}^{\\sqrt{4-x^2}}\\!\\int_{x^2+y^2}^{4} f\\,dz\\,dy\\,dx',
  },
  {
    id: 'm3-tp14-4d',
    module: 3,
    name: 'TP14 4d — Bajo paraboloide z = 9−x²−y²',
    constraints: [C('z <= 9 - x^2 - y^2'), C('z >= 0')],
    settings: { order: 'dz_dy_dx' },
    limitsTex: '\\int_{-3}^{3}\\!\\int_{-\\sqrt{9-x^2}}^{\\sqrt{9-x^2}}\\!\\int_{0}^{9-x^2-y^2} f\\,dz\\,dy\\,dx',
  },
  {
    id: 'm3-tp14-5',
    module: 3,
    name: 'TP14 5 — Octante de esfera unitaria',
    constraints: [
      C('x^2 + y^2 + z^2 <= 1'), C('x >= 0'), C('y >= 0'), C('z >= 0'),
    ],
    settings: { order: 'dz_dy_dx' },
    limitsTex: '\\int_{0}^{1}\\!\\int_{0}^{\\sqrt{1-x^2}}\\!\\int_{0}^{\\sqrt{1-x^2-y^2}} f\\,dz\\,dy\\,dx',
  },
  {
    id: 'm3-tp14-6a',
    module: 3,
    name: 'TP14 6a — Bajo la silla z = xy (y=x, x=1, y=0)',
    constraints: [C('z >= 0'), C('z <= x*y'), C('y >= 0'), C('y <= x'), C('x <= 1'), C('x >= 0')],
    settings: { order: 'dz_dy_dx' },
    limitsTex: '\\int_{0}^{1}\\!\\int_{0}^{x}\\!\\int_{0}^{xy} f\\,dz\\,dy\\,dx',
  },
  {
    id: 'm3-tp14-8d',
    module: 3,
    name: 'TP14 8d — Cilindro desplazado x²+y²=4x bajo x²+y²=4z',
    constraints: [C('x^2 + y^2 <= 4*x'), C('z >= 0'), C('4*z <= x^2 + y^2')],
    settings: { order: 'dz_dy_dx' },
    note: 'El cilindro no está centrado en el origen.',
  },
  {
    id: 'm3-tp14-8e',
    module: 3,
    name: 'TP14 8e — Cilindro x²+z²=4x entre y=0 e y=5',
    constraints: [C('x^2 + z^2 <= 4*x'), C('y >= 0'), C('y <= 5'), C('z >= 0')],
    settings: { order: 'dx_dz_dy' },
    note: 'El cilindro corre a lo largo del eje y — probá órdenes con dx primero.',
  },
  {
    id: 'm3-tp14-8g',
    module: 3,
    name: 'TP14 8g — Cilindro r=3 bajo plano x+z=4 (1er oct.)',
    constraints: [
      C('x^2 + y^2 <= 9'), C('z >= 0'), C('x + z <= 4'), C('x >= 0'), C('y >= 0'),
    ],
    settings: { order: 'dz_dy_dx' },
  },
  {
    id: 'm3-tp16-11',
    module: 3,
    name: 'TP16 11 — Anillo entre cilindros en y²+z² (x∈[1,2])',
    constraints: [
      C('y^2 + z^2 >= 4'), C('y^2 + z^2 <= 9'), C('x >= 1'), C('x <= 2'),
    ],
    settings: { order: 'dx_dz_dy' },
    note: 'Integrando primero en x, la sombra en el plano yz es un anillo.',
  },
  {
    id: 'm4-tp16-9',
    module: 4,
    name: 'TP16 9 — Entre cilindros r=2cosθ y r=4cosθ (z∈[0,3])',
    constraints: [C('x^2 + y^2 >= 2*x'), C('x^2 + y^2 <= 4*x'), C('z >= 0'), C('z <= 3')],
    settings: { mode: 'cyl' },
    limitsTex: '\\int_{-\\pi/2}^{\\pi/2}\\!\\int_{2\\cos\\theta}^{4\\cos\\theta}\\!\\int_{0}^{3} f\\,r\\,dz\\,dr\\,d\\theta',
  },
  {
    id: 'm4-tp16-14',
    module: 4,
    name: 'TP16 14 — Cilindro r≤4 bajo paraboloide 4z=x²+y²',
    constraints: [C('x^2 + y^2 <= 16'), C('z >= 0'), C('4*z <= x^2 + y^2')],
    settings: { mode: 'cyl' },
    limitsTex: '\\int_{0}^{2\\pi}\\!\\int_{0}^{4}\\!\\int_{0}^{r^2/4} f\\,r\\,dz\\,dr\\,d\\theta',
  },
  {
    id: 'm4-tp16-15',
    module: 4,
    name: 'TP16 15 — Exterior al cono, interior al cilindro r=1',
    constraints: [C('x^2 + y^2 <= 1'), C('z >= 0'), C('x^2 + y^2 >= z^2')],
    settings: { mode: 'cyl' },
    limitsTex: '\\int_{0}^{2\\pi}\\!\\int_{0}^{1}\\!\\int_{0}^{r} f\\,r\\,dz\\,dr\\,d\\theta',
  },
  {
    id: 'm4-tp16-17',
    module: 4,
    name: 'TP16 17 — Cono hasta el plano z=1',
    constraints: [C('z >= sqrt(x^2 + y^2)'), C('z <= 1')],
    settings: { mode: 'cyl' },
    limitsTex: '\\int_{0}^{2\\pi}\\!\\int_{0}^{1}\\!\\int_{r}^{1} f\\,r\\,dz\\,dr\\,d\\theta',
  },
  {
    id: 'm4-tp16-18',
    module: 4,
    name: 'TP16 18 — Paraboloide 2z=x²+y² bajo z=2',
    constraints: [C('2*z >= x^2 + y^2'), C('z <= 2')],
    settings: { mode: 'cyl' },
    limitsTex: '\\int_{0}^{2\\pi}\\!\\int_{0}^{2}\\!\\int_{r^2/2}^{2} f\\,r\\,dz\\,dr\\,d\\theta',
  },
  {
    id: 'm4-tp16-8',
    module: 4,
    name: 'TP16 8 — Esfera r=1, exterior al cono, z≥0',
    constraints: [
      C('x^2 + y^2 + z^2 <= 1'), C('z >= 0'), C('x^2 + y^2 >= z^2'),
    ],
    settings: { mode: 'sph' },
    limitsTex: '\\int_{0}^{2\\pi}\\!\\int_{\\pi/4}^{\\pi/2}\\!\\int_{0}^{1} f\\,\\rho^2\\sin\\phi\\,d\\rho\\,d\\phi\\,d\\theta',
    note: 'En esféricas: φ barre desde π/4 (el cono) hasta π/2 (el plano xy).',
  },
  {
    id: 'm4-tp16-6',
    module: 4,
    name: 'TP16 6 — Esfera de radio 2',
    constraints: [C('x^2 + y^2 + z^2 <= 4')],
    settings: { mode: 'sph' },
    limitsTex: '\\int_{0}^{2\\pi}\\!\\int_{0}^{\\pi}\\!\\int_{0}^{2} f\\,\\rho^2\\sin\\phi\\,d\\rho\\,d\\phi\\,d\\theta',
  },
  {
    id: 'm4-tp16-12',
    module: 4,
    name: 'TP16 12 — Esfera r=1 ∩ cilindro r=1/2',
    constraints: [C('x^2 + y^2 + z^2 <= 1'), C('x^2 + y^2 <= 0.25')],
    settings: { mode: 'cyl' },
    limitsTex: '\\int_{0}^{2\\pi}\\!\\int_{0}^{1/2}\\!\\int_{-\\sqrt{1-r^2}}^{\\sqrt{1-r^2}} f\\,r\\,dz\\,dr\\,d\\theta',
  },
  {
    id: 'm4-cilindro',
    module: 4,
    name: 'Cilindro recto r ≤ 2, 0 ≤ z ≤ 3',
    constraints: [C('x^2 + y^2 <= 4'), C('z >= 0'), C('z <= 3')],
    settings: { mode: 'cyl' },
    bbox: { x0: -2.6, x1: 2.6, y0: -2.6, y1: 2.6, z0: -0.5, z1: 3.6 },
    limitsTex: '\\int_{0}^{2\\pi}\\!\\int_{0}^{2}\\!\\int_{0}^{3} f\\,r\\,dz\\,dr\\,d\\theta',
  },
  {
    id: 'm4-parab-cyl',
    module: 4,
    name: 'Paraboloide bajo z = 4 (cilíndricas)',
    constraints: [C('z >= x^2 + y^2'), C('z <= 4')],
    settings: { mode: 'cyl' },
    bbox: { x0: -2.6, x1: 2.6, y0: -2.6, y1: 2.6, z0: -0.5, z1: 4.6 },
    limitsTex: '\\int_{0}^{2\\pi}\\!\\int_{0}^{2}\\!\\int_{r^2}^{4} f\\,r\\,dz\\,dr\\,d\\theta',
  },
  {
    id: 'm4-helado-sph',
    module: 4,
    name: 'Cono + esfera (esféricas)',
    constraints: [C('z >= sqrt(x^2 + y^2)'), C('x^2 + y^2 + z^2 <= 2')],
    settings: { mode: 'sph' },
    bbox: { x0: -1.8, x1: 1.8, y0: -1.8, y1: 1.8, z0: -1.8, z1: 1.8 },
    limitsTex: '\\int_{0}^{2\\pi}\\!\\int_{0}^{\\pi/4}\\!\\int_{0}^{\\sqrt{2}} f\\,\\rho^2\\sin\\phi\\,d\\rho\\,d\\phi\\,d\\theta',
  },
  {
    id: 'm4-octante',
    module: 4,
    name: 'Octante de bola ρ ≤ 2',
    constraints: [
      C('x^2 + y^2 + z^2 <= 4'),
      C('x >= 0'),
      C('y >= 0'),
      C('z >= 0'),
    ],
    settings: { mode: 'sph' },
    bbox: { x0: -0.3, x1: 2.4, y0: -0.3, y1: 2.4, z0: -0.3, z1: 2.4 },
    limitsTex: '\\int_{0}^{\\pi/2}\\!\\int_{0}^{\\pi/2}\\!\\int_{0}^{2} f\\,\\rho^2\\sin\\phi\\,d\\rho\\,d\\phi\\,d\\theta',
  },
]
