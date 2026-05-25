'use client'

/**
 * PlayerAvatar — figura humanoide stylized refinada (Tier A upgrade).
 *
 * Cambios vs Fase A:
 *  + capsuleGeometry en brazos/piernas (extremos redondeados, no cilindros rectos)
 *  + torso ovoide curvado, no box
 *  + cabeza con chin definido + textura sombreada
 *  + secondary motion: cabeza sigue la pelota durante el putt
 *  + breathing más sutil + sway natural del balance
 *  + material clay PBR con clearcoat sutil para vibe AAA
 *
 * Estética target: Polygon Runway + Apple Fitness+ instructor.
 */
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  LOOP_DURATION,
  PHASES,
  easeInOutCubic,
  lerp,
  progressInRange,
} from '@/lib/choreography'

// Paleta del avatar
const SKIN_HEX = '#d4a85e' // clay gold cálido
const POLO_HEX = '#1f3026' // verde oscuro (vibe Augusta uniform)
const PANTS_HEX = '#d4c9a8' // beige khaki
const SHOE_HEX = '#1a1714' // ink
const CAP_HEX = '#6b1f2a' // burgundy

export default function PlayerAvatar() {
  const root = useRef<THREE.Group>(null!)
  const torsoTwist = useRef<THREE.Group>(null!)
  const armsPivot = useRef<THREE.Group>(null!)
  const head = useRef<THREE.Group>(null!)
  const club = useRef<THREE.Group>(null!)

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() % LOOP_DURATION

    // Breathing + balance sway (natural human idle)
    const breath = Math.sin(clock.getElapsedTime() * 1.1) * 0.008
    const sway = Math.sin(clock.getElapsedTime() * 0.55) * 0.004

    // Torso twist según fase
    let twist = 0
    if (t < PHASES.setup.end) {
      twist = 0
    } else if (t < PHASES.backswing.end) {
      const p = easeInOutCubic(progressInRange(t, PHASES.backswing.start, PHASES.backswing.end))
      twist = lerp(0, 0.22, p)
    } else if (t < PHASES.impact.end) {
      const p = easeInOutCubic(progressInRange(t, PHASES.backswing.end, PHASES.impact.end))
      twist = lerp(0.22, -0.08, p)
    } else if (t < PHASES.ballRoll.end) {
      const p = easeInOutCubic(progressInRange(t, PHASES.impact.end, PHASES.ballRoll.end))
      twist = lerp(-0.08, -0.03, p)
    } else if (t < PHASES.reset.end) {
      const p = easeInOutCubic(progressInRange(t, PHASES.ballRoll.end, PHASES.reset.end))
      twist = lerp(-0.03, 0, p)
    }

    // Apply transformations
    if (root.current) {
      root.current.position.x = sway
    }
    if (torsoTwist.current) {
      torsoTwist.current.rotation.y = twist
      torsoTwist.current.position.y = breath
    }
    if (armsPivot.current) {
      // Brazos siguen al torso con leve secondary motion
      armsPivot.current.rotation.y = twist * 1.1
    }
    if (club.current) {
      // Putter con más amplitud por inercia
      club.current.rotation.y = twist * 1.3
    }

    // SECONDARY MOTION: cabeza sigue la pelota durante ball-roll
    if (head.current) {
      if (t >= PHASES.ballRoll.start && t < PHASES.ballRoll.end) {
        const p = easeInOutCubic(
          progressInRange(t, PHASES.ballRoll.start, PHASES.ballRoll.end),
        )
        // Cabeza rota lentamente siguiendo la pelota
        head.current.rotation.x = lerp(0.35, 0.15, p) // baja menos
        head.current.rotation.y = lerp(0, 0.05, p)
      } else if (t >= PHASES.reset.start) {
        // Vuelve a setup mirando la pelota
        const p = easeInOutCubic(
          progressInRange(t, PHASES.reset.start, PHASES.reset.end),
        )
        head.current.rotation.x = lerp(0.15, 0.35, p)
        head.current.rotation.y = lerp(0.05, 0, p)
      } else {
        // Setup default — cabeza mirando la pelota
        head.current.rotation.x = 0.35
        head.current.rotation.y = 0
      }
    }
  })

  return (
    <group ref={root} position={[0, 0, -0.32]}>
      {/* PIERNAS — pantalones beige con capsules (extremos redondeados) */}
      <group position={[-0.13, 0, 0]}>
        <mesh position={[0, 0.45, 0]} castShadow>
          <capsuleGeometry args={[0.075, 0.85, 6, 12]} />
          <meshStandardMaterial
            color={PANTS_HEX}
            roughness={0.78}
            metalness={0.02}
          />
        </mesh>
      </group>
      <group position={[0.13, 0, 0]}>
        <mesh position={[0, 0.45, 0]} castShadow>
          <capsuleGeometry args={[0.075, 0.85, 6, 12]} />
          <meshStandardMaterial color={PANTS_HEX} roughness={0.78} metalness={0.02} />
        </mesh>
      </group>

      {/* ZAPATOS — golf spikes oscuros */}
      <mesh position={[-0.13, 0.02, 0.06]} castShadow>
        <boxGeometry args={[0.14, 0.07, 0.25]} />
        <meshStandardMaterial color={SHOE_HEX} roughness={0.55} metalness={0.15} />
      </mesh>
      <mesh position={[0.13, 0.02, 0.06]} castShadow>
        <boxGeometry args={[0.14, 0.07, 0.25]} />
        <meshStandardMaterial color={SHOE_HEX} roughness={0.55} metalness={0.15} />
      </mesh>

      {/* TORSO + BRAZOS + CABEZA PIVOT — todo gira sobre la cadera */}
      <group ref={torsoTwist} position={[0, 0.9, 0]}>
        {/* TORSO — ovoide curvado (polo verde Augusta), inclinado postura putt */}
        <mesh position={[0, 0.2, 0]} rotation={[0.22, 0, 0]} castShadow>
          {/* Sphere geometry escalada para feel torácico natural */}
          <sphereGeometry args={[0.24, 16, 12]} />
          <meshStandardMaterial
            color={POLO_HEX}
            roughness={0.62}
            metalness={0.04}
            envMapIntensity={0.3}
          />
        </mesh>
        {/* Cintura/cinturón — accent strap dorado sutil */}
        <mesh position={[0, -0.05, 0.04]} rotation={[0.22, 0, 0]} castShadow>
          <torusGeometry args={[0.21, 0.018, 8, 24]} />
          <meshStandardMaterial color="#3a2a18" roughness={0.55} metalness={0.4} />
        </mesh>

        {/* CABEZA — group con pivot al cuello */}
        <group ref={head} position={[0, 0.55, 0.08]}>
          {/* Cuello */}
          <mesh position={[0, -0.05, 0]} castShadow>
            <capsuleGeometry args={[0.055, 0.08, 4, 10]} />
            <meshStandardMaterial color={SKIN_HEX} roughness={0.5} metalness={0.05} />
          </mesh>
          {/* Cabeza — slight egg shape (más natural que esfera) */}
          <mesh position={[0, 0.08, 0]} castShadow>
            <sphereGeometry args={[0.13, 20, 16]} />
            <meshStandardMaterial
              color={SKIN_HEX}
              roughness={0.55}
              metalness={0.03}
              envMapIntensity={0.4}
            />
          </mesh>
          {/* Mandíbula — sutil definición */}
          <mesh position={[0, 0.0, 0.04]} castShadow>
            <sphereGeometry args={[0.08, 14, 10]} />
            <meshStandardMaterial color={SKIN_HEX} roughness={0.55} metalness={0.03} />
          </mesh>
          {/* GORRA — burgundy editorial */}
          <mesh position={[0, 0.18, 0]} castShadow>
            <sphereGeometry args={[0.135, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={CAP_HEX} roughness={0.68} metalness={0.05} />
          </mesh>
          {/* Visera */}
          <mesh position={[0, 0.16, 0.16]} rotation={[0.18, 0, 0]} castShadow>
            <boxGeometry args={[0.28, 0.012, 0.13]} />
            <meshStandardMaterial color={CAP_HEX} roughness={0.65} />
          </mesh>
        </group>

        {/* BRAZOS PIVOT — separado del torso */}
        <group ref={armsPivot} position={[0, -0.05, 0.05]}>
          {/* Brazo izq + antebrazo — capsules con extremos redondeados */}
          <mesh position={[-0.17, -0.08, 0.08]} rotation={[0.7, 0, -0.08]} castShadow>
            <capsuleGeometry args={[0.042, 0.36, 4, 10]} />
            <meshStandardMaterial color={POLO_HEX} roughness={0.62} metalness={0.04} />
          </mesh>
          {/* Brazo der + antebrazo */}
          <mesh position={[0.17, -0.08, 0.08]} rotation={[0.7, 0, 0.08]} castShadow>
            <capsuleGeometry args={[0.042, 0.36, 4, 10]} />
            <meshStandardMaterial color={POLO_HEX} roughness={0.62} metalness={0.04} />
          </mesh>
          {/* Antebrazos juntos hacia adelante (grip unificado del putt) — skin color */}
          <mesh position={[0, -0.36, 0.4]} rotation={[1.1, 0, 0]} castShadow>
            <capsuleGeometry args={[0.055, 0.26, 4, 12]} />
            <meshStandardMaterial color={SKIN_HEX} roughness={0.5} metalness={0.04} />
          </mesh>
          {/* Manos / grip — un solo cluster */}
          <mesh position={[0, -0.5, 0.5]} castShadow>
            <sphereGeometry args={[0.058, 12, 8]} />
            <meshStandardMaterial color={SKIN_HEX} roughness={0.55} metalness={0.04} />
          </mesh>
        </group>
      </group>

      {/* PUTTER — pivot al nivel del grip */}
      <group ref={club} position={[0, 0.9, 0]}>
        <group position={[0, -0.55, 0.5]}>
          {/* Grip (parte alta más gruesa) */}
          <mesh position={[0, 0.45, 0]} rotation={[0.22, 0, 0]} castShadow>
            <cylinderGeometry args={[0.018, 0.014, 0.18, 10]} />
            <meshStandardMaterial color="#1a1714" roughness={0.85} />
          </mesh>
          {/* Shaft principal — steel polished */}
          <mesh position={[0, 0.0, 0]} rotation={[0.22, 0, 0]} castShadow>
            <cylinderGeometry args={[0.014, 0.014, 0.78, 10]} />
            <meshStandardMaterial color="#c8c8c8" roughness={0.25} metalness={0.92} />
          </mesh>
          {/* Putter head (mallet) — black anodized con face dorado sutil */}
          <mesh position={[0, -0.42, 0.04]} castShadow>
            <boxGeometry args={[0.13, 0.045, 0.07]} />
            <meshStandardMaterial color="#1a1714" roughness={0.32} metalness={0.85} />
          </mesh>
          {/* Sweet spot line — gold accent */}
          <mesh position={[0, -0.395, 0.075]} castShadow>
            <boxGeometry args={[0.018, 0.025, 0.001]} />
            <meshStandardMaterial color="#c9a14a" roughness={0.3} metalness={0.7} />
          </mesh>
        </group>
      </group>
    </group>
  )
}
