/**
 * Choreography — el "guion" del cinematic en código.
 * Loop de 18 segundos con keyframes para cámara, avatar y pelota.
 *
 * Decision: timeline explícito (no random) para que cada loop sea
 * idéntico al anterior — sensación de "demo profesional" no "animación
 * casual". Cuando migremos a app real, este timeline se reutiliza para
 * cualquier drill cambiando los assets.
 */

export const LOOP_DURATION = 18 // segundos

/** Interpolación con easing tipo cubic-bezier (0.16, 1, 0.3, 1) — feel cinematográfico. */
export function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/** Lerp con clamp en [0,1]. */
export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t)
}

/** Saca el progreso normalizado [0,1] dentro de un rango [start,end] del loop. */
export function progressInRange(t: number, start: number, end: number): number {
  if (t < start) return 0
  if (t > end) return 1
  return (t - start) / (end - start)
}

/**
 * Animation phases del putting stroke (en segundos del LOOP).
 *
 * 0–3s    : intro · cámara desciende desde top-down a oblique
 * 3–6s    : setup · avatar idle, cámara orbita lenta
 * 6–8s    : backswing · cámara zoom-in lateral, slow-mo
 * 8–9s    : impact + ball roll · cámara sigue la pelota
 * 9–12s   : ball drops in cup · cámara low angle
 * 12–15s  : reset · cámara orbita alrededor del avatar
 * 15–18s  : outro · cámara vuelve a top-down editorial
 */
export const PHASES = {
  intro: { start: 0, end: 3 },
  setup: { start: 3, end: 6 },
  backswing: { start: 6, end: 8 },
  impact: { start: 8, end: 9 },
  ballRoll: { start: 9, end: 12 },
  reset: { start: 12, end: 15 },
  outro: { start: 15, end: 18 },
} as const
