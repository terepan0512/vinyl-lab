
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { MathUtils, type Group } from 'three'
import { usePlayerStore } from '../state/playerStore'
import VinylRecord from './VinylRecord'
import { createStrobeTexture, createWoodTextures } from './shopTextures'

// ---------- Geometry (1 unit ≈ 15 cm, relative to the turntable center) ----------
const C = { x: -0.3, z: 0.1 } // Platter center
const A = { x: 1.15, z: -0.85 } // Tonearm pivot
const L = 1.9 // Distance from the pivot to the stylus
const R_OUT = 0.95 // Outermost groove radius
const R_IN = 0.42 // Innermost groove radius

const PLINTH_TOP = 0.5
const RECORD_Y = 0.655
const RECORD_TOP = 0.68
const STYLUS_DROP = 0.095 // Vertical distance from the tonearm tube to the stylus tip

// Use the law of cosines to calculate the tonearm angle
// required for the stylus to reach a groove at radius r.
const dist = Math.hypot(C.x - A.x, C.z - A.z)
const thetaAC = Math.atan2(C.z - A.z, C.x - A.x)
function thetaFor(r: number) {
  const cosA = (L * L + dist * dist - r * r) / (2 * L * dist)
  return thetaAC - Math.acos(MathUtils.clamp(cosA, -1, 1))
}
const TH_OUT = thetaFor(R_OUT)
const TH_IN = thetaFor(R_IN)
const TH_REST = MathUtils.degToRad(98)
const REST = { x: A.x + L * Math.cos(TH_REST), z: A.z + L * Math.sin(TH_REST) }

export default function Turntable() {
  const arm = useRef<Group>(null)
  const angle = useRef(TH_REST)
  const lift = useRef(1) // 1 = raised, 0 = lowered

  const wood = useMemo(
    () => createWoodTextures({ boards: 3, vertical: false, seed: 5, hue: 255, light: 11, sat: 22, repeatX: 1, repeatY: 1 }),
    [],
  )
  const strobe = useMemo(() => createStrobeTexture(), [])
  useEffect(
    () => () => { wood.map.dispose(); wood.bumpMap.dispose(); strobe.dispose() },
    [wood, strobe],
  )

  useFrame((_, delta) => {
    const { status, currentTime, duration } = usePlayerStore.getState()
    const playing = status === 'playing'
    const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0

    const target = playing ? TH_OUT + (TH_IN - TH_OUT) * progress : TH_REST
    angle.current += (target - angle.current) * Math.min(1, delta * 2.2)

    const arrived = Math.abs(target - angle.current) < MathUtils.degToRad(1.2)
    const targetLift = playing && arrived ? 0 : 1
    lift.current += (targetLift - lift.current) * Math.min(1, delta * 4)

    if (arm.current) {
      // Raise the tonearm around its local Z-axis first,
      // then rotate it around the Y-axis (Euler order: XYZ).
      arm.current.rotation.set(0, -angle.current, lift.current * 0.06)
    }
  })

  const chrome = { color: '#d0d3d8', metalness: 1, roughness: 0.22 } as const

  return (
    <group position={[-0.9, 0, 0.7]}>
      {/* Turntable plinth */}
      <RoundedBox args={[3.1, PLINTH_TOP - 0.04, 2.4]} radius={0.06} smoothness={4} position={[0, 0.04 + (PLINTH_TOP - 0.04) / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial map={wood.map} bumpMap={wood.bumpMap} bumpScale={0.8} roughness={0.3} metalness={0.2} />
      </RoundedBox>

      {/* Four support feet */}
      {[-1.35, 1.35].flatMap((x) => [-1, 1].map((z) => (
        <mesh key={`${x}${z}`} position={[x, 0.02, z]} castShadow>
          <cylinderGeometry args={[0.1, 0.12, 0.04, 20]} />
          <meshStandardMaterial color="#0d0d0f" roughness={0.6} />
        </mesh>
      )))}

      {/* Turntable platter */}
      <mesh position={[C.x, 0.56, C.z]} castShadow receiveShadow>
        <cylinderGeometry args={[1.05, 1.05, 0.12, 96]} />
        <meshStandardMaterial color="#2b2d31" metalness={0.9} roughness={0.32} />
      </mesh>

      {/* Stroboscopic ring */}
      <mesh position={[C.x, 0.621, C.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.05, 96]} />
        <meshBasicMaterial map={strobe} transparent depthWrite={false} />
      </mesh>

      {/* Rubber platter mat */}
      <mesh position={[C.x, 0.63, C.z]} receiveShadow>
        <cylinderGeometry args={[0.98, 0.98, 0.02, 96]} />
        <meshStandardMaterial color="#141416" roughness={0.9} />
      </mesh>

      {/* Vinyl record */}
      <group position={[C.x, RECORD_Y, C.z]} scale={0.5}>
        <VinylRecord />
      </group>

      {/* Center spindle */}
      <mesh position={[C.x, 0.76, C.z]} castShadow>
        <cylinderGeometry args={[0.018, 0.018, 0.2, 16]} />
        <meshStandardMaterial {...chrome} />
      </mesh>

      {/* Control buttons and indicator light */}
      {[-1.25, -0.95].map((x) => (
        <mesh key={x} position={[x, PLINTH_TOP + 0.02, 0.95]} castShadow>
          <cylinderGeometry args={[0.07, 0.07, 0.04, 24]} />
          <meshStandardMaterial color="#0f0f11" metalness={0.6} roughness={0.35} />
        </mesh>
      ))}
      <mesh position={[-0.65, PLINTH_TOP + 0.01, 0.95]}>
        <sphereGeometry args={[0.025, 12, 12]} />
        <meshStandardMaterial color="#ff4fd8" emissive="#ff4fd8" emissiveIntensity={1.6} />
      </mesh>

      {/* Tonearm pivot base */}
      <mesh position={[A.x, PLINTH_TOP + 0.14, A.z]} castShadow receiveShadow>
        <cylinderGeometry args={[0.14, 0.17, 0.28, 40]} />
        <meshStandardMaterial {...chrome} />
      </mesh>

      {/* Tonearm rest */}
      <mesh position={[REST.x, PLINTH_TOP + 0.13, REST.z]} castShadow>
        <cylinderGeometry args={[0.03, 0.04, 0.26, 16]} />
        <meshStandardMaterial {...chrome} />
      </mesh>
      <mesh position={[REST.x, PLINTH_TOP + 0.27, REST.z]} castShadow>
        <boxGeometry args={[0.14, 0.04, 0.07]} />
        <meshStandardMaterial color="#1a1a1d" roughness={0.5} />
      </mesh>

      {/* Tonearm assembly (local +X axis points toward the stylus) */}
      <group ref={arm} position={[A.x, RECORD_TOP + STYLUS_DROP, A.z]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.075, 0.075, 0.12, 28]} />
          <meshStandardMaterial {...chrome} />
        </mesh>
        <mesh position={[L / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.022, 0.022, L, 20]} />
          <meshStandardMaterial {...chrome} />
        </mesh>
        <mesh position={[-0.3, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.09, 0.09, 0.24, 28]} />
          <meshStandardMaterial color="#26272b" metalness={0.85} roughness={0.35} />
        </mesh>

        {/* Headshell */}
        <mesh position={[L - 0.04, -0.02, 0]} castShadow>
          <boxGeometry args={[0.3, 0.035, 0.1]} />
          <meshStandardMaterial color="#1a1a1d" metalness={0.5} roughness={0.4} />
        </mesh>
        <mesh position={[L + 0.04, -0.055, 0]} castShadow>
          <boxGeometry args={[0.16, 0.07, 0.085]} />
          <meshStandardMaterial color="#111113" roughness={0.5} />
        </mesh>
        <mesh position={[L + 0.04, -0.09, 0]}>
          <coneGeometry args={[0.012, 0.03, 8]} />
          <meshStandardMaterial color="#35f2ff" emissive="#35f2ff" emissiveIntensity={0.9} />
        </mesh>
      </group>
    </group>
  )
}
