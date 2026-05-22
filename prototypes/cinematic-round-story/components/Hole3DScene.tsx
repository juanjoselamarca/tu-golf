'use client'

/**
 * Hole3DScene — escena R3F esquemática top-down/oblique de un par 4.
 *
 * Decisión: esquemático, no foto-realista. (a) no tenemos topología real
 * de FedeGolf, (b) low-poly corre suave en cualquier mobile, (c) el vibe
 * editorial (gold/burgundy) se ve mejor sobre geometría limpia que sobre
 * texturas. Inspiración: Augusta hole cards del Masters.
 *
 * Cámara: empieza alto y orbita en bajada cinematográfica (animación
 * controlada por useFrame, sin OrbitControls de drei — buscamos WOW
 * pasivo, no que el usuario manipule).
 */
import { Canvas, useFrame } from '@react-three/fiber'
import { OrthographicCamera, PerspectiveCamera, useTexture } from '@react-three/drei'
import { useRef, useMemo } from 'react'
import * as THREE from 'three'

// --- Geometría esquemática del hoyo (par 4 de 348 yardas) ---
// Coordenadas: x ancho, z largo (tee abajo, green arriba). Unidades arbitrarias.

const HOLE_LENGTH = 60 // largo total del hoyo en la escena
const HOLE_WIDTH = 18 // ancho fairway promedio
const TEE_Z = -HOLE_LENGTH / 2
const GREEN_Z = HOLE_LENGTH / 2

function Fairway() {
  // Forma de bowling-pin invertido — fairway que se ensancha hacia el green
  const shape = useMemo(() => {
    const s = new THREE.Shape()
    s.moveTo(-3, TEE_Z)
    s.lineTo(3, TEE_Z)
    s.bezierCurveTo(8, TEE_Z + 15, 6, GREEN_Z - 20, 9, GREEN_Z - 6)
    s.lineTo(-9, GREEN_Z - 6)
    s.bezierCurveTo(-6, GREEN_Z - 20, -8, TEE_Z + 15, -3, TEE_Z)
    return s
  }, [])

  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0.01}>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color="#3f5e3a" roughness={0.95} />
    </mesh>
  )
}

function Rough() {
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0}>
      <planeGeometry args={[HOLE_WIDTH * 2.2, HOLE_LENGTH * 1.1]} />
      <meshStandardMaterial color="#2a3a26" roughness={1} />
    </mesh>
  )
}

function Green() {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, GREEN_Z - 3]}>
      <circleGeometry args={[4.5, 48]} />
      <meshStandardMaterial color="#6e8d4f" roughness={0.85} />
    </mesh>
  )
}

function Flag() {
  return (
    <group position={[0.6, 0, GREEN_Z - 2.5]}>
      <mesh position={[0, 1.6, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 3.2, 8]} />
        <meshStandardMaterial color="#1a1714" />
      </mesh>
      <mesh position={[0.55, 2.9, 0]}>
        <planeGeometry args={[1.0, 0.55]} />
        <meshStandardMaterial color="#6b1f2a" side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function Bunker({ x, z, w, h }: { x: number; z: number; w: number; h: number }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[x, 0.015, z]}>
      <circleGeometry args={[Math.max(w, h) * 0.5, 24]} />
      <meshStandardMaterial color="#d8c391" roughness={0.7} />
    </mesh>
  )
}

function TeeBox() {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.015, TEE_Z + 0.5]}>
      <planeGeometry args={[3.5, 2.2]} />
      <meshStandardMaterial color="#8da76b" roughness={0.9} />
    </mesh>
  )
}

// --- Línea pulsante tee → green (el path del jugador) ---
function PlayerPath() {
  const ref = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    if (ref.current) {
      const t = clock.getElapsedTime()
      const mat = ref.current.material as THREE.MeshBasicMaterial
      mat.opacity = 0.55 + Math.sin(t * 2.4) * 0.25
    }
  })

  const curve = useMemo(() => {
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.05, TEE_Z + 0.5),
      new THREE.Vector3(-1.2, 0.05, TEE_Z + 12),
      new THREE.Vector3(0.8, 0.05, TEE_Z + 28),
      new THREE.Vector3(2.4, 0.05, TEE_Z + 42),
      new THREE.Vector3(0.6, 0.05, GREEN_Z - 2.5),
    ])
  }, [])

  return (
    <mesh ref={ref}>
      <tubeGeometry args={[curve, 80, 0.14, 8, false]} />
      <meshBasicMaterial color="#c9a14a" transparent opacity={0.8} />
    </mesh>
  )
}

// --- Cámara cinematográfica (orbital lento, descenso editorial) ---
function CinematicCamera() {
  const ref = useRef<THREE.PerspectiveCamera>(null)

  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.getElapsedTime()
    // Orbita lenta: 60s vuelta completa. Altura desciende de 80 a 55 los primeros 4s.
    const angle = (t * Math.PI) / 30
    const radius = 50
    const height = Math.max(80 - t * 6, 55)
    ref.current.position.set(Math.sin(angle) * radius, height, Math.cos(angle) * radius * 0.7)
    ref.current.lookAt(0, 0, 0)
  })

  return <PerspectiveCamera ref={ref} makeDefault fov={28} near={0.1} far={500} />
}

// --- Escena ---
export default function Hole3DScene() {
  return (
    <Canvas
      gl={{ antialias: true, alpha: false }}
      dpr={[1, 2]}
      shadows
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={['#0e0c0a']} />
      <fog attach="fog" args={['#0e0c0a', 80, 180]} />

      {/* Luz cálida estilo golden hour */}
      <ambientLight intensity={0.35} color="#f4e4c1" />
      <directionalLight
        position={[20, 40, 10]}
        intensity={1.6}
        color="#f4d28a"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight position={[-15, 20, -10]} intensity={0.3} color="#8a7ec9" />

      <Rough />
      <Fairway />
      <Green />
      <Flag />
      <TeeBox />

      {/* Bunkers laterales — par 4 típico */}
      <Bunker x={-7} z={-2} w={3.5} h={2.5} />
      <Bunker x={6.5} z={6} w={4} h={3} />
      <Bunker x={4.5} z={GREEN_Z - 7} w={3} h={2.5} />
      <Bunker x={-5} z={GREEN_Z - 8} w={2.5} h={2} />

      <PlayerPath />

      <CinematicCamera />
    </Canvas>
  )
}
