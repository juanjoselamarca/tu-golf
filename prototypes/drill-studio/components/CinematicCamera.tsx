'use client'

/**
 * CinematicCamera — el "director de fotografía".
 *
 * Cada fase del drill tiene un shot diferente. Sin OrbitControls — el
 * usuario mira, no manipula. Eso es lo que separa "demo profesional"
 * de "modelo 3D en visor". Apple Fitness+ y Polygon Runway hacen
 * exactly esto.
 */
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import {
  LOOP_DURATION,
  PHASES,
  easeInOutCubic,
  easeOutExpo,
  lerp,
  progressInRange,
} from '@/lib/choreography'

type Shot = {
  pos: [number, number, number]
  lookAt: [number, number, number]
  fov: number
}

// Shots clave — la cámara interpola entre ellos según fase.
const SHOTS: Record<keyof typeof PHASES, Shot> = {
  // Intro: top-down editorial alta, lookAt al cup
  intro: { pos: [0, 6.5, -3.2], lookAt: [0, 0, 0.4], fov: 38 },
  // Setup: oblique trasera del avatar, plano cinematográfico
  setup: { pos: [-1.8, 1.6, -2.6], lookAt: [0, 1.0, 0], fov: 32 },
  // Backswing: lateral derecha, zoom-in al putter
  backswing: { pos: [2.4, 0.9, -0.1], lookAt: [0, 0.55, 0], fov: 28 },
  // Impact: low-angle frontal, slow-mo effect (con leve dolly-in)
  impact: { pos: [0.4, 0.18, -1.2], lookAt: [0, 0.3, 0.2], fov: 24 },
  // Ball roll: top-down sigue la pelota
  ballRoll: { pos: [0, 1.6, 0.45], lookAt: [0, 0, 0.6], fov: 36 },
  // Reset: orbita media alrededor del avatar
  reset: { pos: [-2.6, 1.4, 0.8], lookAt: [0, 0.8, 0], fov: 30 },
  // Outro: vuelve a top-down editorial pero más amplia
  outro: { pos: [0, 5.5, -2.8], lookAt: [0, 0, 0.4], fov: 42 },
}

function shotFor(t: number): { shot: Shot; nextShot: Shot; p: number } {
  for (const [key, range] of Object.entries(PHASES)) {
    if (t >= range.start && t < range.end) {
      const phaseKey = key as keyof typeof PHASES
      const nextKey = nextPhaseKey(phaseKey)
      const p = easeInOutCubic((t - range.start) / (range.end - range.start))
      return { shot: SHOTS[phaseKey], nextShot: SHOTS[nextKey], p }
    }
  }
  return { shot: SHOTS.outro, nextShot: SHOTS.outro, p: 1 }
}

function nextPhaseKey(k: keyof typeof PHASES): keyof typeof PHASES {
  const order: Array<keyof typeof PHASES> = [
    'intro',
    'setup',
    'backswing',
    'impact',
    'ballRoll',
    'reset',
    'outro',
  ]
  const i = order.indexOf(k)
  return order[Math.min(i + 1, order.length - 1)]
}

export default function CinematicCamera() {
  const cam = useRef<THREE.PerspectiveCamera>(null!)
  const target = useRef(new THREE.Vector3())

  useFrame(({ clock }) => {
    if (!cam.current) return
    const t = clock.getElapsedTime() % LOOP_DURATION
    const { shot, nextShot, p } = shotFor(t)

    // Interpolación entre shot actual y siguiente — feeling de tracking
    const easedP = t < PHASES.impact.start ? p : easeOutExpo(p)

    cam.current.position.set(
      lerp(shot.pos[0], nextShot.pos[0], easedP),
      lerp(shot.pos[1], nextShot.pos[1], easedP),
      lerp(shot.pos[2], nextShot.pos[2], easedP),
    )

    target.current.set(
      lerp(shot.lookAt[0], nextShot.lookAt[0], easedP),
      lerp(shot.lookAt[1], nextShot.lookAt[1], easedP),
      lerp(shot.lookAt[2], nextShot.lookAt[2], easedP),
    )
    cam.current.lookAt(target.current)

    cam.current.fov = lerp(shot.fov, nextShot.fov, easedP)
    cam.current.updateProjectionMatrix()
  })

  return <PerspectiveCamera ref={cam} makeDefault fov={32} near={0.05} far={200} />
}
