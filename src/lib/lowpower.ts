/**
 * Detecta dispositivos débiles (pocos núcleos, poca RAM o pantalla chica) para
 * bajar la densidad de malla y la resolución de dibujo. En un teléfono de gama
 * baja el 3D sigue siendo fluido; en una PC no cambia nada.
 */
export function isLowPower(): boolean {
  if (typeof navigator === 'undefined') return false
  const cores = navigator.hardwareConcurrency ?? 8
  // deviceMemory existe en Chromium; si no está, no descuenta nada
  const mem = (navigator as { deviceMemory?: number }).deviceMemory ?? 8
  const smallScreen =
    typeof window !== 'undefined' &&
    Math.min(window.screen.width, window.screen.height) < 480
  return cores <= 4 || mem <= 4 || smallScreen
}

const _low = isLowPower()
export const LOW_POWER = _low

/** densidad de grilla para marching (menos cubos = menos cómputo) */
export const MESH_N = LOW_POWER ? 26 : 36
export const MESH_N_SURF = LOW_POWER ? 24 : 34
/** devicePixelRatio máximo del canvas */
export const DPR: [number, number] = LOW_POWER ? [1, 1.25] : [1, 1.75]
