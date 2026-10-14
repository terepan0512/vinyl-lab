
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { usePlayerStore } from '../state/playerStore'
import {
  SHEEN_BLENDING,
  createGrooveMaps,
  createLabelTexture,
  createSheenTexture,
} from './vinylTextures'

// Convert 33⅓ revolutions per minute (RPM) to radians per second.
const MAX_SPEED = (33.3 / 60) * Math.PI * 2
const FLAT: [number, number, number] = [-Math.PI / 2, 0, 0]

export default function VinylRecord() {
  const group = useRef<Group>(null)
  const speed = useRef(0)

  const grooves = useMemo(() => createGrooveMaps(), [])
  const sheen = useMemo(() => createSheenTexture(), [])
  const label = useMemo(() => createLabelTexture(), [])

  useEffect(() => {
    return () => {
      grooves.bumpMap.dispose()
      grooves.roughnessMap.dispose()
      sheen.dispose()
      label.dispose()
    }
  }, [grooves, sheen, label])

  useFrame((_, delta) => {
    const playing = usePlayerStore.getState().status === 'playing'
    const target = playing ? MAX_SPEED : 0
    speed.current += (target - speed.current) * Math.min(1, delta * 2.5)
    if (group.current) group.current.rotation.y -= speed.current * delta
  })

  return (
    <>
      <group ref={group}>
        {/* Vinyl record body */}
        <mesh>
          <cylinderGeometry args={[2, 2, 0.04, 128]} />
          <meshStandardMaterial color="#0a0a0a" metalness={0.5} roughness={0.4} />
        </mesh>

        {/* Grooved vinyl surface */}
        <mesh position={[0, 0.0205, 0]} rotation={FLAT}>
          <circleGeometry args={[2, 128]} />
          <meshStandardMaterial
            color="#26262e"
            metalness={0.35}
            roughness={1}
            roughnessMap={grooves.roughnessMap}
            bumpMap={grooves.bumpMap}
            bumpScale={3}
            envMapIntensity={1.6}
          />
        </mesh>

        {/* Center label */}
        <mesh position={[0, 0.0215, 0]} rotation={FLAT}>
          <circleGeometry args={[0.7, 64]} />
          <meshStandardMaterial map={label} roughness={0.7} />
        </mesh>
      </group>

      {/* Stationary specular highlight overlay */}
      <mesh position={[0, 0.024, 0]} rotation={FLAT}>
        <circleGeometry args={[2, 128]} />
        <meshBasicMaterial
          map={sheen}
          transparent
          depthWrite={false}
          blending={SHEEN_BLENDING}
        />
      </mesh>
    </>
  )
}
