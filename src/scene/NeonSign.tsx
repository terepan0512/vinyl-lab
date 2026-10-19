import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, CanvasTexture, SRGBColorSpace, type MeshBasicMaterial, type PointLight } from 'three'
import { WALL_LIFT, WALL_Z } from './layout'
import { NEON_H, NEON_W, drawNeon } from './neonDraw'
import { useLights } from './useLights'

// ================= Adjust here =================
const SIGN = { x: -4.45, y: 0.34 + WALL_LIFT + 0.08, width: 4.6 } // Wall sign position and width
// ==========================================

function makeTex(which: 0 | 1) {
  const canvas = document.createElement('canvas')
  canvas.width = NEON_W
  canvas.height = NEON_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser does not support 2D canvas')
  drawNeon(ctx, which)
  const t = new CanvasTexture(canvas)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}

// Neon sign behind the counter: NO MUSIC pulses slowly in pink; NO LIFE occasionally flickers in cyan
export default function NeonSign() {
  const pink = useMemo(() => makeTex(0), [])
  const cyan = useMemo(() => makeTex(1), [])
  const pinkMat = useRef<MeshBasicMaterial>(null)
  const cyanMat = useRef<MeshBasicMaterial>(null)
  const pinkLight = useRef<PointLight>(null)
  const cyanLight = useRef<PointLight>(null)
  const level = useLights()
  useEffect(
    () => () => {
      pink.dispose()
      cyan.dispose()
    },
    [pink, cyan],
  )

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const lv = level(t)
    const p = (0.88 + 0.12 * Math.sin(t * 1.6)) * lv
    // The cyan tube flickers for 0.7 seconds every 6 seconds
    const phase = t % 6
    const bad = phase > 5.3
    const c = (bad ? (Math.sin(t * 70) > 0.1 ? 1 : 0.12) : 0.95 + 0.05 * Math.sin(t * 3)) * lv
    if (pinkMat.current) pinkMat.current.opacity = p
    if (cyanMat.current) cyanMat.current.opacity = c
    if (pinkLight.current) pinkLight.current.intensity = 5 * p
    if (cyanLight.current) cyanLight.current.intensity = 5 * c
  })

  const h = (SIGN.width * NEON_H) / NEON_W
  const z = WALL_Z + 0.05
  const mat = { transparent: true, toneMapped: false, blending: AdditiveBlending, depthWrite: false } as const

  return (
    <group>
      <mesh position={[SIGN.x, SIGN.y, z]}>
        <planeGeometry args={[SIGN.width, h]} />
        <meshBasicMaterial ref={pinkMat} map={pink} {...mat} />
      </mesh>
      <mesh position={[SIGN.x, SIGN.y, z + 0.001]}>
        <planeGeometry args={[SIGN.width, h]} />
        <meshBasicMaterial ref={cyanMat} map={cyan} {...mat} />
      </mesh>
      {/* Light cast by the sign onto the wall and counter */}
      <pointLight ref={pinkLight} position={[SIGN.x - 1.4, SIGN.y + 0.2, WALL_Z + 0.9]} color="#ff4fd8" intensity={5} decay={1} />
      <pointLight ref={cyanLight} position={[SIGN.x + 1.4, SIGN.y + 0.2, WALL_Z + 0.9]} color="#35f2ff" intensity={5} decay={1} />
    </group>
  )
}
