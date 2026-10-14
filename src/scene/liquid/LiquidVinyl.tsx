import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, Vector4, type ShaderMaterial } from 'three'
import { AudioFeatures } from '../../audio/AudioFeatures'
import { engine, usePlayerStore } from '../../state/playerStore'
import vertexShader from './shaders/liquid.vert.glsl?raw'
import fragmentShader from './shaders/liquid.frag.glsl?raw'

const FLAT: [number, number, number] = [-Math.PI / 2, 0, 0]

export default function LiquidVinyl() {
  const material = useRef<ShaderMaterial>(null)
  const features = useRef(new AudioFeatures())

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uAudio: { value: new Vector4() },
    uPink: { value: new Color('#ff4fae') },
    uCyan: { value: new Color('#35e8f2') },
    uPurple: { value: new Color('#843bdf') },
  }), [])

  useFrame((_, delta) => {
    if (!material.current) return

    const dt = Math.min(delta, 0.1)
    const audio = features.current.sample(
      engine.getAnalyser(),
      usePlayerStore.getState().status === 'playing',
      dt,
    )

    const u = material.current.uniforms

    // Integrate speed, rather than multiplying time by changing audio values.
    // A nonzero baseline keeps the liquid flowing during pause and silence.
    u.uTime.value += dt * (0.32 + audio.bass * 0.65 + audio.level * 0.3)
    u.uAudio.value.set(audio.bass, audio.mid, audio.treble, audio.level)
  })

  return (
    <>
      {/* Clear resin rim retains the original record dimensions. */}
      <mesh renderOrder={3}>
        <cylinderGeometry args={[2, 2, 0.04, 128, 1, true]} />
        <meshPhysicalMaterial
          color="#c5faff"
          metalness={0}
          roughness={0.16}
          clearcoat={1}
          clearcoatRoughness={0.12}
          transparent
          opacity={0.5}
          depthWrite={false}
        />
      </mesh>

      <mesh position={[0, -0.019, 0]} rotation={FLAT}>
        <ringGeometry args={[0.7, 2, 128]} />
        <meshStandardMaterial
          color="#c5faff"
          transparent
          opacity={0.12}
          depthWrite={false}
        />
      </mesh>

      <mesh position={[0, 0.0205, 0]} rotation={FLAT} renderOrder={1}>
        <circleGeometry args={[2, 128]} />
        <shaderMaterial
          ref={material}
          uniforms={uniforms}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          transparent
          depthWrite={false}
        />
      </mesh>
    </>
  )
}