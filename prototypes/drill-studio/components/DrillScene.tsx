'use client'

/**
 * DrillScene — orquestador del Canvas R3F.
 *
 * Composición: ambiente (Environment HDRI suave) + lighting golden hour
 * + PuttingGreen + PlayerAvatar + CinematicCamera + PostFX.
 *
 * NO usamos drei <Environment> con HDRI externo para no depender de CDN —
 * en su lugar gradient sky color + directional lights cálidas que dan
 * el feel golden hour sin asset.
 */
import { Canvas } from '@react-three/fiber'
import PuttingGreen from './PuttingGreen'
import PlayerAvatar from './PlayerAvatar'
import CinematicCamera from './CinematicCamera'
import PostFX from './PostFX'

export default function DrillScene() {
  return (
    <Canvas
      gl={{
        antialias: true,
        alpha: false,
        toneMappingExposure: 1.1,
      }}
      dpr={[1, 2]}
      shadows
      style={{ position: 'absolute', inset: 0 }}
    >
      {/* Sky / fondo — gradient cálido golden hour */}
      <color attach="background" args={['#1a1411']} />
      <fog attach="fog" args={['#1a1411', 10, 35]} />

      {/* Luz cálida principal — golden hour, baja, larga sombra */}
      <directionalLight
        position={[-5, 6, -3]}
        intensity={2.4}
        color="#f5d28a"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={20}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
        shadow-bias={-0.0008}
      />
      {/* Rim light contraria — burgundy cool, para separación del avatar */}
      <directionalLight position={[3, 4, 4]} intensity={0.45} color="#8b5a6f" />
      {/* Fill ambient leve para sombras no totalmente negras */}
      <ambientLight intensity={0.18} color="#a89870" />

      <PuttingGreen />
      <PlayerAvatar />

      <CinematicCamera />
      <PostFX />
    </Canvas>
  )
}
