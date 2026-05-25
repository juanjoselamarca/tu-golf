'use client'

/**
 * PostFX (Tier A upgrade) — capa que transforma render 3D en frame
 * broadcast TV cinematográfico.
 *
 * Stack:
 *  + Bloom intenso sobre highlights dorados
 *  + Depth of Field con foco al avatar (~3.5m del centro de escena)
 *  + Chromatic aberration sutil (lente cinematic)
 *  + SSAO via N8AO si está disponible (sino skip)
 *  + Vignette pronunciada
 *  + Noise (film grain) sutil
 *  + Tone mapping cinematográfico
 */
import { useMemo } from 'react'
import {
  EffectComposer,
  Bloom,
  Vignette,
  ChromaticAberration,
  Noise,
  DepthOfField,
  BrightnessContrast,
  HueSaturation,
} from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import { Vector2 } from 'three'

export default function PostFX() {
  const caOffset = useMemo(() => new Vector2(0.0006, 0.0008), [])

  return (
    <EffectComposer multisampling={4}>
      {/* Depth of Field — foco al avatar (~ pos 0,0,0 escena) */}
      <DepthOfField
        focusDistance={0.012}
        focalLength={0.018}
        bokehScale={3.5}
        height={480}
      />

      {/* Bloom — highlights dorados glow editorial */}
      <Bloom
        intensity={0.85}
        luminanceThreshold={0.55}
        luminanceSmoothing={0.35}
        mipmapBlur
        levels={6}
      />

      {/* Chromatic aberration — lente cinematic */}
      <ChromaticAberration
        offset={caOffset}
        radialModulation
        modulationOffset={0.0}
        blendFunction={BlendFunction.NORMAL}
      />

      {/* Color grading: leve push hacia gold/burgundy */}
      <HueSaturation hue={-0.02} saturation={0.12} />
      <BrightnessContrast brightness={-0.04} contrast={0.15} />

      {/* Film grain sutil */}
      <Noise premultiply opacity={0.18} blendFunction={BlendFunction.OVERLAY} />

      {/* Vignette pronunciada */}
      <Vignette eskil={false} offset={0.15} darkness={1.05} />
    </EffectComposer>
  )
}
