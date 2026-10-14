
import { useLayoutEffect, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { MathUtils, Object3D, type PerspectiveCamera } from 'three'
import Shop, { WALL_Z } from './Shop'
import Turntable from './Turntable'
import Amp from './Amp'
import Hifi from './Hifi'

// ================= Lighting Configuration =================
// Scene too dark: increase wallSpot, deckSpot, ambient, or env.
// Album covers too bright: decrease wallSpot.
// Neon light outside the window too weak or too strong: adjust neon.
const LOOK = {
  exposure: 1.1,
  env: 0.9, // Environment reflection intensity (primarily affects highlights on metal, records, and countertops)
  ambient: 0.3,
  hemi: 0.45,
  wallSpot: 7, // Spotlights illuminating the wall and record sleeves
  deckSpot: 15, // Spotlights illuminating the counter and turntable
  neon: 14, // Neon light spilling in through the window
}
const TARGET = { y: 1.9, z: -0.6 } // Camera look-at target
const PITCH_DEG = 22 // Camera downward tilt; increase to reveal more of the record surface
// ==========================================================

function CameraRig() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)

  useLayoutEffect(() => {
    const aspect = size.width / size.height
    // Frame the scene based on both width and height:
    // approximately x ±8.8 (central ±5.6 on mobile), y from -3.2 to 7.6.
    const halfWidth = aspect >= 1.1 ? 9.4 : 5.6
    const halfHeight = 6.9 // Vertical space above and below the camera target, including the cabinet base and extra margin
    const tan = Math.tan(MathUtils.degToRad(camera.fov / 2))
    const distance = Math.max(11, halfWidth / (tan * aspect), halfHeight / tan)
    const pitch = MathUtils.degToRad(PITCH_DEG)
    camera.position.set(0, TARGET.y + Math.sin(pitch) * distance, TARGET.z + Math.cos(pitch) * distance)
    camera.lookAt(0, TARGET.y, TARGET.z)
    camera.updateProjectionMatrix()
  }, [camera, size.width, size.height])

  return null
}

interface SpotProps {
  position: [number, number, number]
  aim: [number, number, number]
  intensity: number
  angle: number
  color: string
  shadowSize?: number
}

function Spot({ position, aim, intensity, angle, color, shadowSize = 1024 }: SpotProps) {
  // Create a dedicated target object to avoid relying on a ref
  // that becomes available only after the initial render.
  const target = useMemo(() => new Object3D(), [])

  useLayoutEffect(() => {
    target.position.set(...aim)
    target.updateMatrixWorld()
  }, [target, aim])

  return (
    <>
      <spotLight
        position={position}
        target={target}
        color={color}
        intensity={intensity}
        angle={angle}
        penumbra={0.85}
        decay={0}
        castShadow
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <primitive object={target} />
    </>
  )
}

export default function VinylScene() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 35, near: 0.5, far: 100, position: [0, 8, 12] }}
      onCreated={({ gl }) => {
        gl.toneMappingExposure = LOOK.exposure
      }}
    >
      <color attach="background" args={['#07041a']} />
      <CameraRig />

      <ambientLight intensity={LOOK.ambient} color="#8f7cff" />
      <hemisphereLight args={['#7a6cff', '#10062a', LOOK.hemi]} />

      {/* Two spotlights: pink on the left, blue on the right */}
      <Spot position={[-4.3, 8.5, 1.5]} aim={[-4.3, 3.6, WALL_Z]} intensity={LOOK.wallSpot} angle={0.5} color="#ff6ad5" />
      <Spot position={[4.3, 8.5, 1.5]} aim={[4.3, 3.6, WALL_Z]} intensity={LOOK.wallSpot} angle={0.5} color="#6a8cff" />

      {/* Main turntable spotlight with a cool lavender-white tone */}
      <Spot position={[-1.6, 8, 5]} aim={[0, 0.6, 0.2]} intensity={LOOK.deckSpot} angle={0.4} color="#fff0fa" shadowSize={2048} />

      {/* Spotlight illuminating the amplifier */}
      <Spot position={[5, 9, 5.5]} aim={[4.1, 0.6, 0.3]} intensity={LOOK.deckSpot} angle={0.38} color="#e6dcff" />

      {/* Procedural environment lighting:
          Soft pink, cyan, and purple light panels provide
          reflections on metallic surfaces and countertops. */}
      <Environment resolution={256} environmentIntensity={LOOK.env}>
        <Lightformer form="rect" intensity={4} color="#ff4fd8" position={[-6, 3, 3]} scale={[3, 6, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={4} color="#35f2ff" position={[6, 3, 3]} scale={[3, 6, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={3} color="#8f7cff" position={[0, 7, 4]} scale={[10, 3, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={2} color="#ffffff" position={[0, 6, -3]} scale={[12, 3, 1]} target={[0, 0, 0]} />
      </Environment>

      <Shop neon={LOOK.neon} />
      <Hifi />

      {/* Scale up the turntable and amplifier as the main focal points.
          Adjust the Z offset to keep the enlarged front edges
          within the countertop boundaries. */}
      <group position={[1.125, 0, -0.7]} scale={1.25}>
        <Turntable />
      </group>
      <group position={[0.7, 0, 0.2]} scale={1}>
        <Amp />
      </group>

      <OrbitControls
        target={[0, TARGET.y, TARGET.z]}
        enablePan={false}
        enableZoom={false}
        enableDamping
        minPolarAngle={MathUtils.degToRad(50)}
        maxPolarAngle={MathUtils.degToRad(84)}
        minAzimuthAngle={-0.5}
        maxAzimuthAngle={0.5}
      />
    </Canvas>
  )
}
