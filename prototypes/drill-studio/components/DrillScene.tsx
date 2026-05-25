'use client'

/**
 * DrillScene — orquestador del Canvas R3F (UPGRADE Tier A).
 *
 * Cambios vs Fase A inicial:
 *  + Sky procedural Hosek-Wilkie con sol golden hour (drei <Sky>)
 *  + Environment preset "sunset" para IBL real (Poly Haven HDRI auto)
 *  + Fog volumétrico cálido para depth perception
 *  + Soft shadows (PCFSoftShadowMap) + bias afinado
 *  + Tonemapping ACESFilmicToneMapping para vibe broadcast TV
 *  + Environment3D component con árboles, horizonte, banderín lejano
 *  + Exposure tuned para golden hour
 */
import { Canvas } from '@react-three/fiber'
import { Environment, Sky } from '@react-three/drei'
import * as THREE from 'three'
import PuttingGreen from './PuttingGreen'
import PlayerAvatar from './PlayerAvatar'
import Environment3D from './Environment3D'
import CinematicCamera from './CinematicCamera'
import PostFX from './PostFX'

export default function DrillScene() {
  return (
    <Canvas
      gl={{
        antialias: true,
        alpha: false,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 0.85,
      }}
      dpr={[1, 2]}
      shadows="soft"
      style={{ position: 'absolute', inset: 0 }}
    >
      {/* Sky procedural con sol bajo (golden hour late afternoon) */}
      <Sky
        distance={450000}
        sunPosition={[-12, 6, -10]}
        inclination={0.49}
        azimuth={0.25}
        mieCoefficient={0.005}
        mieDirectionalG={0.85}
        rayleigh={3.2}
        turbidity={8}
      />

      {/* IBL environment para reflejos realistas en materiales */}
      <Environment preset="sunset" background={false} environmentIntensity={0.6} />

      {/* Fog cálido — depth perception sin matar las distancias */}
      <fog attach="fog" args={['#3d2818', 12, 38]} />

      {/* Sun key light — directional cálida baja con sombras largas */}
      <directionalLight
        position={[-8, 7, -5]}
        intensity={3.2}
        color="#ffd8a0"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={30}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
      />

      {/* Sky fill — luz fría desde arriba simulando dispersión atmosférica */}
      <hemisphereLight args={['#a8c5ff', '#3a2a18', 0.35]} />

      {/* Rim light contraria burgundy — separación del avatar del fondo */}
      <directionalLight position={[5, 3, 6]} intensity={0.55} color="#a87880" />

      <Environment3D />
      <PuttingGreen />
      <PlayerAvatar />

      <CinematicCamera />
      <PostFX />
    </Canvas>
  )
}
