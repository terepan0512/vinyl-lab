
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, CanvasTexture, SRGBColorSpace, type Group, type MeshBasicMaterial } from 'three'
import { WALL_Z } from './layout'
import { TITLE_H, TITLE_W, drawTitle } from './neonDraw'
import { useShopStore } from '../state/shopStore'
import { useLights } from './useLights'

// ================= Position Configuration =================
const POS = { x: 0, y: 7.28, width: 3.8 } // Directly above the window, in the gap between the two towels
// ==========================================================

function makeTex(layer: 0 | 1) {
  const canvas = document.createElement('canvas')
  canvas.width = TITLE_W
  canvas.height = TITLE_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser does not support 2D canvas.')
  drawTitle(ctx, layer)
  const t = new CanvasTexture(canvas)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}

// VINYL LAB neon sign mounted above the window.
// Click to toggle the lights on or off.
// When switched on, the neon tubes flicker briefly before stabilizing.
export default function TitleSign() {
  const pink = useMemo(() => makeTex(0), [])
  const cyan = useMemo(() => makeTex(1), [])
  const pinkMat = useRef<MeshBasicMaterial>(null)
  const cyanMat = useRef<MeshBasicMaterial>(null)
  const box = useRef<Group>(null)
  const [hover, setHover] = useState(false)
  const level = useLights()
  useEffect(
    () => () => {
      pink.dispose()
      cyan.dispose()
      document.body.style.cursor = ''
    },
    [pink, cyan],
  )

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const lv = level(t)
    const pulse = 0.94 + 0.06 * Math.sin(t * 1.9)
    const boost = hover ? 1.12 : 1
    if (pinkMat.current) pinkMat.current.opacity = Math.min(1, lv * pulse * boost)
    if (cyanMat.current) cyanMat.current.opacity = Math.min(1, lv * boost)
    if (box.current) {
      const s = box.current.scale.x + ((hover ? 1.03 : 1) - box.current.scale.x) * 0.2
      box.current.scale.set(s, s, 1)
    }
  })

  const h = (POS.width * TITLE_H) / TITLE_W
  const mat = { transparent: true, toneMapped: false, blending: AdditiveBlending, depthWrite: false } as const

  return (
    <group ref={box} position={[POS.x, POS.y, WALL_Z + 0.06]}>
      <mesh>
        <planeGeometry args={[POS.width, h]} />
        <meshBasicMaterial ref={pinkMat} map={pink} {...mat} />
      </mesh>
      <mesh position={[0, 0, 0.001]}>
        <planeGeometry args={[POS.width, h]} />
        <meshBasicMaterial ref={cyanMat} map={cyan} {...mat} />
      </mesh>

      {/* Invisible interaction area for pointer events */}
      <mesh
        position={[0, 0, 0.01]}
        onClick={(e) => {
          e.stopPropagation()
          useShopStore.getState().toggleLights()
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHover(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHover(false)
          document.body.style.cursor = ''
        }}
      >
        <planeGeometry args={[POS.width + 0.3, h + 0.2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}
