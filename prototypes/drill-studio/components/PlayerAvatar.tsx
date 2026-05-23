'use client'

/**
 * PlayerAvatar — figura silueta-stylized estilo Polygon Runway.
 *
 * Decisiones:
 * - NO usar Mixamo/Ready Player Me en Fase A — primitives Three.js dan
 *   más control + cero deps externos. Vibe Polygon Runway exactamente.
 * - Material clay con color cálido gold burnished — el avatar es "el
 *   protagonista editorial" sobre el verde frío del green.
 * - Animación procedural keyframed con interpolación cinematográfica
 *   (PHASES de choreography.ts).
 *
 * Cuando esto valide bien, en Fase B reemplazamos por GLB de Mixamo
 * con más anatomía, pero el feel debería mantenerse.
 */
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { LOOP_DURATION, PHASES, easeInOutCubic, lerp, progressInRange } from '@/lib/choreography'

const SKIN_COLOR = '#c9a14a' // gold burnished — material clay
const CLUB_COLOR = '#1a1714' // ink

export default function PlayerAvatar() {
  const root = useRef<THREE.Group>(null!)
  const torsoTwist = useRef<THREE.Group>(null!)
  const armsPivot = useRef<THREE.Group>(null!)
  const club = useRef<THREE.Group>(null!)

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() % LOOP_DURATION

    // Breath idle constante (ligero balanceo + respiración del torso)
    const breath = Math.sin(clock.getElapsedTime() * 1.2) * 0.012

    // Torso twist — rotación según fase del swing
    let twist = 0
    if (t < PHASES.setup.end) {
      twist = 0 // setup estable
    } else if (t < PHASES.backswing.end) {
      // Backswing — torso rota a la derecha (jugador diestro)
      const p = easeInOutCubic(progressInRange(t, PHASES.backswing.start, PHASES.backswing.end))
      twist = lerp(0, 0.18, p)
    } else if (t < PHASES.impact.end) {
      // Impact — rotación rápida hacia la línea
      const p = easeInOutCubic(progressInRange(t, PHASES.backswing.end, PHASES.impact.end))
      twist = lerp(0.18, -0.06, p)
    } else if (t < PHASES.ballRoll.end) {
      // Follow-through suave
      const p = easeInOutCubic(progressInRange(t, PHASES.impact.end, PHASES.ballRoll.end))
      twist = lerp(-0.06, -0.02, p)
    } else if (t < PHASES.reset.end) {
      // Reset al setup
      const p = easeInOutCubic(progressInRange(t, PHASES.ballRoll.end, PHASES.reset.end))
      twist = lerp(-0.02, 0, p)
    }

    // Brazos siguen al torso (en putting brazos y torso son una unidad)
    if (torsoTwist.current) {
      torsoTwist.current.rotation.y = twist
      torsoTwist.current.position.y = breath
    }
    if (armsPivot.current) {
      armsPivot.current.rotation.y = twist * 1.15 // ligera amplificación natural
    }
    if (club.current) {
      // El putter sigue los brazos pero con más amplitud
      club.current.rotation.y = twist * 1.25
    }
  })

  return (
    <group ref={root} position={[0, 0, -0.3]}>
      {/* Piernas (estables, no se mueven en putting) */}
      <mesh position={[-0.13, 0.45, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 0.9, 12]} />
        <meshStandardMaterial color={SKIN_COLOR} roughness={0.45} metalness={0.15} />
      </mesh>
      <mesh position={[0.13, 0.45, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 0.9, 12]} />
        <meshStandardMaterial color={SKIN_COLOR} roughness={0.45} metalness={0.15} />
      </mesh>

      {/* Zapatos (oscuros, accent) */}
      <mesh position={[-0.13, -0.02, 0.04]} castShadow>
        <boxGeometry args={[0.13, 0.06, 0.22]} />
        <meshStandardMaterial color="#1a1714" roughness={0.7} />
      </mesh>
      <mesh position={[0.13, -0.02, 0.04]} castShadow>
        <boxGeometry args={[0.13, 0.06, 0.22]} />
        <meshStandardMaterial color="#1a1714" roughness={0.7} />
      </mesh>

      {/* Torso + brazos + cabeza pivot — todo gira sobre el eje vertical de la cadera */}
      <group ref={torsoTwist} position={[0, 0.9, 0]}>
        {/* Torso (inclinado ligeramente hacia adelante, postura de putt) */}
        <mesh position={[0, 0.2, 0]} rotation={[0.18, 0, 0]} castShadow>
          <boxGeometry args={[0.38, 0.55, 0.22]} />
          <meshStandardMaterial color={SKIN_COLOR} roughness={0.45} metalness={0.15} />
        </mesh>

        {/* Cuello + cabeza */}
        <mesh position={[0, 0.6, 0.05]} rotation={[0.32, 0, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.07, 0.1, 10]} />
          <meshStandardMaterial color={SKIN_COLOR} roughness={0.45} metalness={0.15} />
        </mesh>
        <mesh position={[0, 0.72, 0.12]} castShadow>
          <sphereGeometry args={[0.13, 18, 14]} />
          <meshStandardMaterial color={SKIN_COLOR} roughness={0.5} metalness={0.12} />
        </mesh>
        {/* Gorra de visor — burgundy accent */}
        <mesh position={[0, 0.83, 0.12]} castShadow>
          <cylinderGeometry args={[0.135, 0.14, 0.05, 18]} />
          <meshStandardMaterial color="#6b1f2a" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.81, 0.27]} castShadow>
          <boxGeometry args={[0.27, 0.02, 0.1]} />
          <meshStandardMaterial color="#6b1f2a" roughness={0.6} />
        </mesh>

        {/* Brazos pivot — separado del torso para amplificar movement */}
        <group ref={armsPivot} position={[0, -0.05, 0.05]}>
          {/* Hombros + brazos como una "Y" hacia adelante (postura putt) */}
          <mesh position={[-0.18, -0.05, 0.05]} rotation={[0.65, 0, -0.1]} castShadow>
            <cylinderGeometry args={[0.045, 0.04, 0.45, 10]} />
            <meshStandardMaterial color={SKIN_COLOR} roughness={0.45} metalness={0.15} />
          </mesh>
          <mesh position={[0.18, -0.05, 0.05]} rotation={[0.65, 0, 0.1]} castShadow>
            <cylinderGeometry args={[0.045, 0.04, 0.45, 10]} />
            <meshStandardMaterial color={SKIN_COLOR} roughness={0.45} metalness={0.15} />
          </mesh>
          {/* Antebrazos juntos hacia adelante (grip único) */}
          <mesh position={[0, -0.32, 0.35]} rotation={[1.05, 0, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.05, 0.32, 10]} />
            <meshStandardMaterial color={SKIN_COLOR} roughness={0.45} metalness={0.15} />
          </mesh>
        </group>
      </group>

      {/* Putter — pivot separado al nivel del grip, gira con el torso */}
      <group ref={club} position={[0, 0.9, 0]}>
        <group position={[0, -0.05, 0.6]}>
          {/* Shaft */}
          <mesh position={[0, -0.05, 0]} rotation={[0.18, 0, 0]} castShadow>
            <cylinderGeometry args={[0.012, 0.012, 0.95, 10]} />
            <meshStandardMaterial color={CLUB_COLOR} roughness={0.3} metalness={0.7} />
          </mesh>
          {/* Putter head (mallet style) */}
          <mesh position={[0, -0.5, 0.05]} castShadow>
            <boxGeometry args={[0.12, 0.05, 0.06]} />
            <meshStandardMaterial color={CLUB_COLOR} roughness={0.25} metalness={0.85} />
          </mesh>
        </group>
      </group>
    </group>
  )
}
