'use client'

/**
 * PuttingGreen — escena del drill.
 * - Green circular plano con ligero shading.
 * - Cup hacia adelante a 1.5m del avatar (la pelota rueda hacia ahí).
 * - Marca de distancia (anillo sutil) a 1.5m.
 * - Pelota animada según fase del swing.
 * - Pelotas dispersas detrás del avatar (reps previas, vibe practice).
 */
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  LOOP_DURATION,
  PHASES,
  easeOutExpo,
  easeInOutCubic,
  lerp,
  progressInRange,
} from '@/lib/choreography'

const BALL_START_Z = -0.35 // posición del ball antes del setup (frente al avatar)
const CUP_Z = 1.15 // 1.5m del ball (en escala de escena ≈ 1.5)
const CUP_RADIUS = 0.057 // hoyo regulación ≈ 4.25in

export default function PuttingGreen() {
  const ball = useRef<THREE.Mesh>(null!)
  const ballGroup = useRef<THREE.Group>(null!)

  // Pelotas dispersas — reps previas (visual storytelling: practice ongoing)
  const previousReps = useMemo(() => {
    const positions: Array<[number, number, number]> = []
    const seed = 42
    let rand = seed
    const next = () => {
      rand = (rand * 9301 + 49297) % 233280
      return rand / 233280
    }
    for (let i = 0; i < 8; i++) {
      const x = (next() - 0.5) * 0.7
      const z = -1.2 + next() * 0.5
      positions.push([x, 0.018, z])
    }
    return positions
  }, [])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() % LOOP_DURATION

    if (!ball.current || !ballGroup.current) return

    // Phase: ballRoll (8s → 12s) — la pelota sale del impact y rueda al cup
    if (t < PHASES.impact.start) {
      // Antes del impacto: pelota quieta en BALL_START_Z
      ball.current.position.z = BALL_START_Z
      ball.current.position.y = 0.018
      ball.current.rotation.x = 0
      ballGroup.current.visible = true
    } else if (t < PHASES.ballRoll.end) {
      // Animación de rolling
      const p = easeOutExpo(progressInRange(t, PHASES.impact.start, PHASES.ballRoll.end))
      const z = lerp(BALL_START_Z, CUP_Z, p)
      ball.current.position.z = z

      // Pelota cae en los últimos 5% del rolling
      const dropP = Math.max(0, (p - 0.95) / 0.05)
      ball.current.position.y = lerp(0.018, -0.04, dropP)

      // Rotación de la pelota mientras rueda
      ball.current.rotation.x = -p * Math.PI * 6

      ballGroup.current.visible = true
    } else if (t < PHASES.reset.start) {
      // Pelota desaparece dentro del cup
      ballGroup.current.visible = false
    } else {
      // Reset suave para próximo loop — pelota reaparece en setup
      const p = easeInOutCubic(progressInRange(t, PHASES.reset.start, PHASES.reset.end))
      ball.current.position.z = BALL_START_Z
      ball.current.position.y = 0.018
      ball.current.rotation.x = 0
      ballGroup.current.visible = p > 0.4
    }
  })

  return (
    <group>
      {/* Green plano grande con material clay verde fairway */}
      <mesh rotation-x={-Math.PI / 2} position-y={0} receiveShadow>
        <circleGeometry args={[6, 64]} />
        <meshStandardMaterial color="#3f5e3a" roughness={0.92} />
      </mesh>

      {/* Sub-green más oscuro (zona de putting con ligero shading) */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.001}>
        <circleGeometry args={[3.5, 48]} />
        <meshStandardMaterial color="#4a6e44" roughness={0.85} />
      </mesh>

      {/* Anillo de distancia a 1.5m — sutil, dorado */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.003, CUP_Z]}>
        <ringGeometry args={[0.85, 0.92, 48]} />
        <meshBasicMaterial color="#c9a14a" transparent opacity={0.35} />
      </mesh>

      {/* Línea de putt sutil del ball start al cup */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.0035, (BALL_START_Z + CUP_Z) / 2]}>
        <planeGeometry args={[0.02, CUP_Z - BALL_START_Z]} />
        <meshBasicMaterial color="#c9a14a" transparent opacity={0.18} />
      </mesh>

      {/* Cup — círculo negro con borde */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.004, CUP_Z]}>
        <ringGeometry args={[CUP_RADIUS, CUP_RADIUS + 0.012, 28]} />
        <meshBasicMaterial color="#1a1714" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.001, CUP_Z]}>
        <circleGeometry args={[CUP_RADIUS, 28]} />
        <meshBasicMaterial color="#0e0c0a" />
      </mesh>

      {/* Flag stick (visible referencia, vibe broadcast) */}
      <group position={[0, 0, CUP_Z]}>
        <mesh position={[0, 0.6, 0]} castShadow>
          <cylinderGeometry args={[0.008, 0.008, 1.2, 8]} />
          <meshStandardMaterial color="#1a1714" roughness={0.4} metalness={0.6} />
        </mesh>
        <mesh position={[0.18, 1.05, 0]} castShadow>
          <planeGeometry args={[0.35, 0.22]} />
          <meshStandardMaterial color="#6b1f2a" side={THREE.DoubleSide} roughness={0.7} />
        </mesh>
      </group>

      {/* Ball animado */}
      <group ref={ballGroup}>
        <mesh ref={ball} position={[0, 0.018, BALL_START_Z]} castShadow>
          <sphereGeometry args={[0.018, 16, 12]} />
          <meshStandardMaterial color="#f7f3ec" roughness={0.35} metalness={0.05} />
        </mesh>
      </group>

      {/* Pelotas dispersas detrás del avatar — reps previas */}
      {previousReps.map((pos, i) => (
        <mesh key={i} position={pos} castShadow>
          <sphereGeometry args={[0.018, 12, 8]} />
          <meshStandardMaterial color="#ebe3d3" roughness={0.5} opacity={0.85} transparent />
        </mesh>
      ))}
    </group>
  )
}
