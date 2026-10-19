import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { usePlayerStore } from '../state/playerStore'
import LiquidVinyl from './liquid/LiquidVinyl'
import { createLabelTexture } from './vinylTextures'

// Convert 33⅓ revolutions per minute (RPM) to radians per second.
const MAX_SPEED = (33.3 / 60) * Math.PI * 2
const FLAT: [number, number, number] = [-Math.PI / 2, 0, 0]

export default function VinylRecord() {
  const group = useRef<Group>(null)
  const speed = useRef(0)

  const label = useMemo(() => createLabelTexture(), [])

  useEffect(() => {
    return () => {
      label.dispose()
    }
  }, [label])

  useFrame((_, delta) => {
    const playing = usePlayerStore.getState().status === 'playing'
    const target = playing ? MAX_SPEED : 0
    speed.current += (target - speed.current) * Math.min(1, delta * 2.5)
    if (group.current) group.current.rotation.y -= speed.current * delta
  })

  return (
    <>
      <group ref={group}>
        <LiquidVinyl />

        {/* Center label */}
        <mesh position={[0, 0.0215, 0]} rotation={FLAT}>
          <circleGeometry args={[0.7, 64]} />
          <meshStandardMaterial map={label} roughness={0.7} />
        </mesh>
      </group>
    </>
  )
}
