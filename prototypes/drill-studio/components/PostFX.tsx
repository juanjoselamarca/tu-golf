'use client'

/**
 * PostFX — la capa que transforma "render 3D ok" en "frame cinematográfico".
 *
 * Bloom suave en los highlights (sobre el material dorado del avatar),
 * vignette para enfocar el centro, leve chromatic aberration para feel
 * de lente cinematográfica, depth of field con foco al avatar.
 */
import { useMemo } from 'react'
import { EffectComposer, Bloom, Vignette, ChromaticAberration } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import { Vector2 } from 'three'

export default function PostFX() {
  const caOffset = useMemo(() => new Vector2(0.0008, 0.0008), [])
  return (
    <EffectComposer multisampling={4}>
      <Bloom
        intensity={0.55}
        luminanceThreshold={0.7}
        luminanceSmoothing={0.25}
        mipmapBlur
      />
      <ChromaticAberration
        offset={caOffset}
        radialModulation
        modulationOffset={0.0}
        blendFunction={BlendFunction.NORMAL}
      />
      <Vignette eskil={false} offset={0.18} darkness={0.85} />
    </EffectComposer>
  )
}
