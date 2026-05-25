'use client'

/**
 * Environment3D — el "mundo" alrededor del green.
 *
 * Saca al avatar del vacío:
 *  - Horizonte distante (plano con gradient sky → fairway)
 *  - Árboles low-poly editorial (Quaternius-style)
 *  - Banderines / structuras lejanas sugiriendo cancha
 *  - Fog volumétrico para profundidad
 *
 * Vibe Augusta back nine — late afternoon, cypress trees siluetas.
 */
import { useMemo } from 'react'
import * as THREE from 'three'

interface TreeProps {
  position: [number, number, number]
  scale?: number
  hue?: 'dark' | 'cool' | 'warm'
}

function Tree({ position, scale = 1, hue = 'dark' }: TreeProps) {
  const trunkColor = '#3a2618'
  const leafColors = {
    dark: '#1f3a23',
    cool: '#2a4530',
    warm: '#3f5d35',
  }
  return (
    <group position={position} scale={scale}>
      {/* Tronco */}
      <mesh position={[0, 0.7, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.12, 1.4, 8]} />
        <meshStandardMaterial color={trunkColor} roughness={0.95} />
      </mesh>
      {/* Copa cone (cypress style) */}
      <mesh position={[0, 2.3, 0]} castShadow>
        <coneGeometry args={[0.85, 3.2, 10]} />
        <meshStandardMaterial color={leafColors[hue]} roughness={0.95} />
      </mesh>
      {/* Copa secundaria más pequeña en la cima */}
      <mesh position={[0, 3.8, 0]} castShadow>
        <coneGeometry args={[0.45, 1.6, 8]} />
        <meshStandardMaterial color={leafColors[hue]} roughness={0.95} />
      </mesh>
    </group>
  )
}

function OakTree({ position, scale = 1 }: TreeProps) {
  return (
    <group position={position} scale={scale}>
      {/* Tronco más grueso */}
      <mesh position={[0, 0.8, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.2, 1.6, 8]} />
        <meshStandardMaterial color="#3a2618" roughness={0.95} />
      </mesh>
      {/* Copa esférica/blob */}
      <mesh position={[0, 2.4, 0]} castShadow>
        <icosahedronGeometry args={[1.5, 1]} />
        <meshStandardMaterial color="#2d4a2a" roughness={0.95} flatShading />
      </mesh>
      <mesh position={[-0.8, 2.3, 0.4]} castShadow>
        <icosahedronGeometry args={[0.9, 0]} />
        <meshStandardMaterial color="#345231" roughness={0.95} flatShading />
      </mesh>
      <mesh position={[0.7, 2.5, -0.4]} castShadow>
        <icosahedronGeometry args={[1.0, 0]} />
        <meshStandardMaterial color="#28412a" roughness={0.95} flatShading />
      </mesh>
    </group>
  )
}

export default function Environment3D() {
  // Posiciones determinísticas pero variadas — ring de árboles alrededor del green
  const trees = useMemo(() => {
    const arr: Array<{
      type: 'cypress' | 'oak'
      pos: [number, number, number]
      scale: number
      hue: TreeProps['hue']
    }> = []
    const seed = 17
    let r = seed
    const rand = () => ((r = (r * 9301 + 49297) % 233280) / 233280)

    // Ring of cypress (taller, dramatic siluetas) — far background
    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2 + rand() * 0.1
      const radius = 12 + rand() * 3
      arr.push({
        type: 'cypress',
        pos: [Math.sin(angle) * radius, 0, Math.cos(angle) * radius - 2],
        scale: 0.9 + rand() * 0.5,
        hue: rand() > 0.5 ? 'dark' : 'cool',
      })
    }

    // Oaks closer, fewer — mid distance
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + rand() * 0.3
      const radius = 7 + rand() * 1.5
      // Skip si está en la línea de putt (delante del avatar)
      const z = Math.cos(angle) * radius
      const x = Math.sin(angle) * radius
      if (z > -1 && z < 4 && Math.abs(x) < 2) continue
      arr.push({
        type: 'oak',
        pos: [x, 0, z - 1],
        scale: 0.7 + rand() * 0.4,
        hue: 'warm',
      })
    }

    return arr
  }, [])

  return (
    <group>
      {/* Horizonte lejano — silueta de árboles muy distantes */}
      <mesh position={[0, 3.5, -22]} receiveShadow>
        <planeGeometry args={[80, 14]} />
        <meshBasicMaterial color="#1c2a22" transparent opacity={0.95} />
      </mesh>

      {/* Fog atmosférico cálido — depth perception */}
      {/* (definido en DrillScene <fog> attach) */}

      {/* Árboles */}
      {trees.map((t, i) =>
        t.type === 'cypress' ? (
          <Tree key={i} position={t.pos} scale={t.scale} hue={t.hue} />
        ) : (
          <OakTree key={i} position={t.pos} scale={t.scale} />
        ),
      )}

      {/* Suelo extendido más allá del green — fairway/rough oscuro */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.005, 0]} receiveShadow>
        <circleGeometry args={[40, 64]} />
        <meshStandardMaterial color="#1a2418" roughness={1} />
      </mesh>

      {/* "Banderín distante" sugiriendo otro hoyo — vibe cancha real */}
      <group position={[-8, 0, -6]}>
        <mesh position={[0, 0.8, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 1.6, 6]} />
          <meshStandardMaterial color="#1a1714" roughness={0.4} metalness={0.6} />
        </mesh>
        <mesh position={[0.2, 1.45, 0]}>
          <planeGeometry args={[0.4, 0.25]} />
          <meshStandardMaterial color="#c9a14a" side={THREE.DoubleSide} roughness={0.7} />
        </mesh>
      </group>
    </group>
  )
}
