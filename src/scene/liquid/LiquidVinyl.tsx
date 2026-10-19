import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, DataTexture, LinearFilter, RedFormat, RepeatWrapping, UnsignedByteType, Vector3, Vector4, type ShaderMaterial } from 'three'
import { AudioFeatures } from '../../audio/AudioFeatures'
import { SIGNAL_SAMPLES } from '../../audio/AudioSignal'
import { engine, usePlayerStore } from '../../state/playerStore'
import vertexShader from './shaders/liquid.vert.glsl?raw'
import fragmentShader from './shaders/liquid.frag.glsl?raw'
import liquidSurface from './shaders/liquidSurface.glsl?raw'
import { applyTrajectoryPalette } from './palette'
import { sampleColorTrajectory } from '../../audio/musicColorAnalysis'
import { ViscousMotion } from './ViscousMotion'
import { PigmentBalance } from './PigmentBalance'
import { PigmentField } from './PigmentField'
import { DEFAULT_LIQUID_SETTINGS, useLiquidSettings } from '../../state/liquidSettings'
import { createLiquidNoiseTexture } from './noiseTexture'

const FLAT: [number, number, number] = [-Math.PI / 2, 0, 0]
const vertexSource = vertexShader.replace('#include <liquid_surface>', liquidSurface)
const fragmentSource = fragmentShader.replace('#include <liquid_surface>', liquidSurface)

export default function LiquidVinyl() {
  const material = useRef<ShaderMaterial>(null)
  const features = useMemo(() => new AudioFeatures(), [])
  const motion = useMemo(() => new ViscousMotion(), [])
  const balance = useMemo(() => new PigmentBalance(), [])
  const field = useMemo(() => new PigmentField(), [])
  const analysis = usePlayerStore(state => state.analysis)
  const sourceId = analysis?.sourceId
  const noise = useMemo(() => createLiquidNoiseTexture(), [])
  const texture = useMemo(() => {
    const signal = new DataTexture(features.signal.data, SIGNAL_SAMPLES, 2, RedFormat, UnsignedByteType)
    signal.minFilter = LinearFilter
    signal.magFilter = LinearFilter
    signal.wrapS = RepeatWrapping
    signal.generateMipmaps = false
    signal.needsUpdate = true
    return signal
  }, [features])

  const uniforms = useMemo(() => ({
    uFlowTime: { value: 0 },
    uAudio: { value: new Vector4() },
    uFlow: { value: new Vector4() },
    uDynamics: { value: new Vector4() },
    uAppearance: { value: new Vector4(DEFAULT_LIQUID_SETTINGS.opacity, DEFAULT_LIQUID_SETTINGS.relief,
      DEFAULT_LIQUID_SETTINGS.lightness, DEFAULT_LIQUID_SETTINGS.flow) },
    uSignal: { value: texture },
    uNoise: { value: noise },
    uHistoryCursor: { value: SIGNAL_SAMPLES - 1 },
    uColorA: { value: new Color('#aaaaaa') },
    uColorB: { value: new Color('#aaaaaa') },
    uColorC: { value: new Color('#aaaaaa') },
    uPaletteWeights: { value: new Vector3(1 / 3, 1 / 3, 1 / 3) },
    uPigmentQuantilesA: { value: new Vector4().fromArray(field.quantiles, 0) },
    uPigmentQuantilesB: { value: new Vector4().fromArray(field.quantiles, 4) },
    uGlow: { value: 0 },
  }), [texture, noise, field])

  useEffect(() => {
    const colors = [uniforms.uColorA.value, uniforms.uColorB.value, uniforms.uColorC.value]
    const sample = analysis ? sampleColorTrajectory(analysis.colors, engine.element.currentTime) : null
    applyTrajectoryPalette(colors, sample?.palette ?? null, useLiquidSettings.getState())
  }, [analysis, uniforms])

  useEffect(() => {
    const reset = () => {
      features.reset()
      motion.reset()
      balance.reset()
      field.reset()
      const u = material.current?.uniforms as typeof uniforms | undefined
      if (!u) return
      u.uFlowTime.value = 0
      u.uAudio.value.set(0, 0, 0, 0)
      u.uFlow.value.set(0, 0, 0, 0)
      u.uDynamics.value.set(0, 0, 0, 0)
      u.uPaletteWeights.value.fromArray(balance.weights)
      u.uPigmentQuantilesA.value.fromArray(field.quantiles, 0)
      u.uPigmentQuantilesB.value.fromArray(field.quantiles, 4)
    }
    reset()
    const audio = engine.element
    audio.addEventListener('seeking', reset)
    audio.addEventListener('emptied', reset)
    audio.addEventListener('ended', reset)
    return () => {
      audio.removeEventListener('seeking', reset)
      audio.removeEventListener('emptied', reset)
      audio.removeEventListener('ended', reset)
    }
  }, [features, motion, balance, field, sourceId])

  useEffect(() => () => { texture.dispose(); noise.dispose() }, [texture, noise])

  useFrame((_, delta) => {
    if (!material.current) return

    const dt = Math.min(delta, 0.1)
    const playing = usePlayerStore.getState().status === 'playing'
    const audio = features.sample(
      engine.getAnalyser(),
      playing,
      dt,
    )

    const u = material.current.uniforms as typeof uniforms
    const appearance = useLiquidSettings.getState()
    // The trajectory was computed on import. Playback only looks up audio time.
    const sample = analysis ? sampleColorTrajectory(analysis.colors, engine.element.currentTime) : null
    applyTrajectoryPalette([u.uColorA.value, u.uColorB.value, u.uColorC.value], sample?.palette ?? null, appearance)
    u.uGlow.value = sample?.glow ?? 0
    // Motion uses live audio every frame; section labels and precomputed tempo
    // never gate or step the flow. Only pigment colors use the stored trajectory.
    const fluid = motion.update(audio, dt, appearance.flow)
    u.uPaletteWeights.value.fromArray(balance.update(audio, dt, playing))
    const active = fluid.level > 0 || fluid.onset > 0
    const quantiles = field.update(fluid, dt, active)
    // Recalibration is throttled; smooth its measured response across frames.
    // No additional texture reads or render-target readbacks are needed.
    const follow = 1 - Math.exp(-dt * 12)
    const a = u.uPigmentQuantilesA.value, b = u.uPigmentQuantilesB.value
    if (active) {
      a.set(a.x + (quantiles[0] - a.x) * follow, a.y + (quantiles[1] - a.y) * follow,
        a.z + (quantiles[2] - a.z) * follow, a.w + (quantiles[3] - a.w) * follow)
      b.set(b.x + (quantiles[4] - b.x) * follow, b.y + (quantiles[5] - b.y) * follow,
        b.z + (quantiles[6] - b.z) * follow, 1)
    }
    u.uSignal.value.needsUpdate = true
    u.uHistoryCursor.value = features.signal.cursor
    u.uFlowTime.value = fluid.travel
    u.uAudio.value.set(fluid.bass, fluid.mid, fluid.treble, fluid.level)
    u.uFlow.value.set(fluid.flowX, fluid.flowY, fluid.swirl, fluid.stretch)
    u.uDynamics.value.set(fluid.level, fluid.onset, fluid.timbre, fluid.treble)
    u.uAppearance.value.set(appearance.opacity, appearance.relief, appearance.lightness, appearance.flow)
  })

  return (
    <>
      {/* Clear resin rim retains the original record dimensions. */}
      <mesh renderOrder={3}>
        <cylinderGeometry args={[2, 2, 0.04, 128, 1, true]} />
        <meshPhysicalMaterial
          color="#eeeeee"
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
        {/* A softly lit resin backing keeps transparent pigment readable over the dark deck. */}
        <meshBasicMaterial
          color="#d9dfe8"
          toneMapped={false}
          transparent
          opacity={0.72}
          depthWrite={false}
        />
      </mesh>

      <mesh position={[0, 0.0205, 0]} rotation={FLAT} renderOrder={1}>
        {/* Radial subdivisions let the surface rise between the label and rim. */}
        <ringGeometry args={[0.7, 1.952, 128, 24]} />
        <shaderMaterial
          ref={material}
          uniforms={uniforms}
          vertexShader={vertexSource}
          fragmentShader={fragmentSource}
          toneMapped={false}
          transparent
          depthWrite={false}
        />
      </mesh>
    </>
  )
}
