'use client'

/**
 * PuttingGreen — escena del drill (Tier A upgrade).
 *
 * Cambios vs Fase A:
 *  + Grass procedural shader con noise multi-frecuencia (variación tonal real)
 *  + Edge entre green y fairway visible (transición de altura tonal)
 *  + Cup con depth real (hole geometry interior)
 *  + Flag con leve sway animation
 *  + Pelotas dispersas con sombras suaves
 *  + Grain shader sutil simulando textura de césped
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

const BALL_START_Z = -0.35
const CUP_Z = 1.15
const CUP_RADIUS = 0.057

// Custom shader material para grass con noise multi-frecuencia
function makeGrassMaterial(baseColor: string, accent: string) {
  const mat = new THREE.MeshStandardMaterial({
    color: baseColor,
    roughness: 0.92,
    metalness: 0.0,
  })

  // Inject custom noise in fragment shader para variación tonal sutil
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uAccent = { value: new THREE.Color(accent) }
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `
        #include <common>
        uniform vec3 uAccent;

        // Hash & noise (2D, GLSL classic)
        float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise2(vec2 p){
          vec2 i = floor(p); vec2 f = fract(p);
          float a = hash21(i);
          float b = hash21(i + vec2(1.0,0.0));
          float c = hash21(i + vec2(0.0,1.0));
          float d = hash21(i + vec2(1.0,1.0));
          vec2 u = f*f*(3.0-2.0*f);
          return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
        }
        `,
      )
      .replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        // Multi-frequency noise blend para textura de grass
        float n1 = noise2(vWorldPosition.xz * 4.0);
        float n2 = noise2(vWorldPosition.xz * 18.0) * 0.4;
        float n3 = noise2(vWorldPosition.xz * 60.0) * 0.18;
        float blend = clamp(n1 + n2 + n3, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, uAccent, blend * 0.35);
        // Sub-detail darker patches (sombras de césped más alto)
        float dark = step(0.78, noise2(vWorldPosition.xz * 8.0)) * 0.18;
        diffuseColor.rgb *= (1.0 - dark);
        `,
      )
      .replace(
        '#include <worldpos_vertex>',
        `
        #include <worldpos_vertex>
        vWorldPosition = worldPosition.xyz;
        `,
      )

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `
      #include <common>
      varying vec3 vWorldPosition;
      `,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `
      #include <common>
      varying vec3 vWorldPosition;
      uniform vec3 uAccent;

      float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise2(vec2 p){
        vec2 i = floor(p); vec2 f = fract(p);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0,0.0));
        float c = hash21(i + vec2(0.0,1.0));
        float d = hash21(i + vec2(1.0,1.0));
        vec2 u = f*f*(3.0-2.0*f);
        return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
      }
      `,
    )
  }

  return mat
}

export default function PuttingGreen() {
  const ball = useRef<THREE.Mesh>(null!)
  const ballGroup = useRef<THREE.Group>(null!)
  const flag = useRef<THREE.Mesh>(null!)

  // Materiales de grass — diferentes tonos para green / fairway
  const greenMat = useMemo(() => makeGrassMaterial('#4d6c3f', '#6b8a4a'), [])
  const fairwayMat = useMemo(() => makeGrassMaterial('#2f4628', '#3f5a32'), [])

  // Pelotas dispersas — reps previas
  const previousReps = useMemo(() => {
    const positions: Array<[number, number, number]> = []
    const seed = 42
    let rand = seed
    const next = () => {
      rand = (rand * 9301 + 49297) % 233280
      return rand / 233280
    }
    for (let i = 0; i < 10; i++) {
      const x = (next() - 0.5) * 0.7
      const z = -1.3 + next() * 0.6
      positions.push([x, 0.018, z])
    }
    return positions
  }, [])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() % LOOP_DURATION

    // Sway de la bandera (leve, atmosfera)
    if (flag.current) {
      flag.current.rotation.z = Math.sin(clock.getElapsedTime() * 1.6) * 0.08
    }

    if (!ball.current || !ballGroup.current) return

    if (t < PHASES.impact.start) {
      ball.current.position.z = BALL_START_Z
      ball.current.position.y = 0.018
      ball.current.rotation.x = 0
      ballGroup.current.visible = true
    } else if (t < PHASES.ballRoll.end) {
      const p = easeOutExpo(progressInRange(t, PHASES.impact.start, PHASES.ballRoll.end))
      const z = lerp(BALL_START_Z, CUP_Z, p)
      ball.current.position.z = z
      const dropP = Math.max(0, (p - 0.95) / 0.05)
      ball.current.position.y = lerp(0.018, -0.04, dropP)
      ball.current.rotation.x = -p * Math.PI * 6
      ballGroup.current.visible = true
    } else if (t < PHASES.reset.start) {
      ballGroup.current.visible = false
    } else {
      const p = easeInOutCubic(progressInRange(t, PHASES.reset.start, PHASES.reset.end))
      ball.current.position.z = BALL_START_Z
      ball.current.position.y = 0.018
      ball.current.rotation.x = 0
      ballGroup.current.visible = p > 0.4
    }
  })

  return (
    <group>
      {/* FAIRWAY base alrededor del green */}
      <mesh
        rotation-x={-Math.PI / 2}
        position-y={0}
        receiveShadow
        material={fairwayMat}
      >
        <circleGeometry args={[8, 64]} />
      </mesh>

      {/* GREEN — círculo elevado sutil con grass shader propio */}
      <mesh
        rotation-x={-Math.PI / 2}
        position-y={0.001}
        receiveShadow
        material={greenMat}
      >
        <circleGeometry args={[3.5, 56]} />
      </mesh>

      {/* Edge collar del green — transición */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.0005}>
        <ringGeometry args={[3.5, 3.65, 56]} />
        <meshStandardMaterial color="#3d5a2e" roughness={0.95} />
      </mesh>

      {/* Anillo de distancia a 1.5m */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.003, CUP_Z]}>
        <ringGeometry args={[0.85, 0.91, 48]} />
        <meshBasicMaterial color="#c9a14a" transparent opacity={0.32} />
      </mesh>

      {/* Línea de putt sutil */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.0035, (BALL_START_Z + CUP_Z) / 2]}>
        <planeGeometry args={[0.022, CUP_Z - BALL_START_Z]} />
        <meshBasicMaterial color="#c9a14a" transparent opacity={0.16} />
      </mesh>

      {/* CUP — bordemarcado + depth real (cilindro hundido) */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.004, CUP_Z]}>
        <ringGeometry args={[CUP_RADIUS, CUP_RADIUS + 0.014, 28]} />
        <meshBasicMaterial color="#1a1714" />
      </mesh>
      {/* Hole depth — cilindro negro hundido */}
      <mesh position={[0, -0.04, CUP_Z]}>
        <cylinderGeometry args={[CUP_RADIUS, CUP_RADIUS, 0.08, 24, 1, true]} />
        <meshStandardMaterial color="#0a0805" roughness={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.08, CUP_Z]}>
        <circleGeometry args={[CUP_RADIUS, 24]} />
        <meshStandardMaterial color="#050403" roughness={1} />
      </mesh>

      {/* FLAG */}
      <group position={[0, 0, CUP_Z]}>
        <mesh position={[0, 0.6, 0]} castShadow>
          <cylinderGeometry args={[0.008, 0.008, 1.2, 8]} />
          <meshStandardMaterial color="#1a1714" roughness={0.35} metalness={0.65} />
        </mesh>
        <mesh ref={flag} position={[0.18, 1.05, 0]} castShadow>
          <planeGeometry args={[0.35, 0.22]} />
          <meshStandardMaterial
            color="#6b1f2a"
            side={THREE.DoubleSide}
            roughness={0.7}
            metalness={0.02}
          />
        </mesh>
      </group>

      {/* BALL animado */}
      <group ref={ballGroup}>
        <mesh ref={ball} position={[0, 0.018, BALL_START_Z]} castShadow>
          <sphereGeometry args={[0.018, 20, 14]} />
          <meshStandardMaterial color="#f7f3ec" roughness={0.32} metalness={0.04} />
        </mesh>
        {/* Contact shadow sutil de la pelota */}
        <mesh
          ref={ball}
          rotation-x={-Math.PI / 2}
          position={[0, 0.005, BALL_START_Z]}
        >
          <circleGeometry args={[0.022, 12]} />
          <meshBasicMaterial color="#000" transparent opacity={0.25} />
        </mesh>
      </group>

      {/* Pelotas dispersas — reps previas */}
      {previousReps.map((pos, i) => (
        <mesh key={i} position={pos} castShadow>
          <sphereGeometry args={[0.018, 16, 10]} />
          <meshStandardMaterial color="#ebe3d3" roughness={0.45} metalness={0.04} />
        </mesh>
      ))}
    </group>
  )
}
