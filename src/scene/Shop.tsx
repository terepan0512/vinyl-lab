import { useEffect, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, CanvasTexture, SRGBColorSpace, Texture } from 'three'
import {
  createSpinesTexture,
  createWoodTextures,
} from './shopTextures'
import { createCityTexture, createRainTexture } from './cityTexture'
import { useCoverStore } from '../state/coverStore'
import { COVER_SIZE, COVER_STYLES, drawGeneratedCover } from './coverGen'
import { WALL_LIFT, WALL_Z } from './layout'
import { drawPlate } from './ampDraw'
import Decor from './Decor'

// 1 unit ≈ 15 cm. Record radius = 1; sleeve side length ≈ 2.07
export { WALL_Z }
const SLEEVE = 2.07
const LEAN = 0.08

const NEON_PINK = '#ff4fd8'
const NEON_CYAN = '#35f2ff'
const DARK_METAL = '#1a1233'

// Leave space for the window in the center, with sleeves arranged in groups on both sides
const COLUMNS = [-5.45, -3.2, 3.2, 5.45]
const LEDGES = [4.0 + WALL_LIFT, 1.3 + WALL_LIFT] // Heights of the upper and lower display ledges
const WIN = { w: 3.6, h: 5.2, y: 3.7 + WALL_LIFT } // Window opening dimensions; y is the center height

function Wall() {
  const wood = useMemo(
    () =>
      createWoodTextures({
        boards: 8, vertical: true, seed: 7, hue: 255, light: 13, sat: 30,
        repeatX: 34 / 8, repeatY: 14 / 8,
      }),
    [],
  )
  useEffect(() => () => { wood.map.dispose(); wood.bumpMap.dispose() }, [wood])

  return (
    <mesh position={[0, 4, WALL_Z]} receiveShadow>
      <planeGeometry args={[34, 14]} />
      <meshStandardMaterial map={wood.map} bumpMap={wood.bumpMap} bumpScale={1.2} roughness={0.8} />
    </mesh>
  )
}

function CyberWindow({ neon }: { neon: number }) {
  const city = useMemo(() => createCityTexture(), [])
  const rain = useMemo(() => createRainTexture(), [])
  useEffect(() => () => { city.dispose(); rain.dispose() }, [city, rain])

  // Animate the rain falling downward
  useFrame((_, dt) => {
    rain.offset.y += dt * 0.9
  })

  const { w, h, y } = WIN
  const t = 0.12 // Window frame thickness
  const D = 0.3 // Depth of the window frame projecting from the wall
  const z = WALL_Z
  const frame = <meshStandardMaterial color="#0c0820" metalness={0.7} roughness={0.35} />

  return (
    <group>
      {/* Cityscape outside the window (unlit to preserve neon color saturation) */}
      <mesh position={[0, y, z + 0.02]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={city} toneMapped={false} />
      </mesh>
      {/* Rain */}
      <mesh position={[0, y, z + 0.05]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={rain} transparent opacity={0.55} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
      </mesh>
      {/* Glass pane used only for environmental reflections */}
      <mesh position={[0, y, z + 0.1]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial color="#9aa8ff" transparent opacity={0.07} roughness={0.04} metalness={0} envMapIntensity={2} depthWrite={false} />
      </mesh>

      {/* Window frame */}
      <mesh position={[0, y + h / 2 + t / 2, z + D / 2]} castShadow receiveShadow>
        <boxGeometry args={[w + t * 2, t, D]} />
        {frame}
      </mesh>
      <mesh position={[0, y - h / 2 - t / 2, z + D / 2]} castShadow receiveShadow>
        <boxGeometry args={[w + t * 2, t, D]} />
        {frame}
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (w / 2 + t / 2), y, z + D / 2]} castShadow receiveShadow>
          <boxGeometry args={[t, h, D]} />
          {frame}
        </mesh>
      ))}
      {/* Window muntins: one vertical and one horizontal */}
      <mesh position={[0, y, z + 0.14]} castShadow>
        <boxGeometry args={[0.07, h, 0.12]} />
        {frame}
      </mesh>
      <mesh position={[0, y + 0.9, z + 0.14]} castShadow>
        <boxGeometry args={[w, 0.07, 0.12]} />
        {frame}
      </mesh>

      {/* Neon light strips along the inside of the window frame */}
      <mesh position={[0, y + h / 2 - 0.02, z + 0.26]}>
        <boxGeometry args={[w, 0.035, 0.035]} />
        <meshBasicMaterial color={NEON_PINK} toneMapped={false} />
      </mesh>
      <mesh position={[0, y - h / 2 + 0.02, z + 0.26]}>
        <boxGeometry args={[w, 0.035, 0.035]} />
        <meshBasicMaterial color={NEON_CYAN} toneMapped={false} />
      </mesh>
      <mesh position={[-w / 2 + 0.02, y, z + 0.26]}>
        <boxGeometry args={[0.035, h, 0.035]} />
        <meshBasicMaterial color={NEON_PINK} toneMapped={false} />
      </mesh>
      <mesh position={[w / 2 - 0.02, y, z + 0.26]}>
        <boxGeometry args={[0.035, h, 0.035]} />
        <meshBasicMaterial color={NEON_CYAN} toneMapped={false} />
      </mesh>

      {/* Windowsill */}
      <mesh position={[0, y - h / 2 - t - 0.05, z + 0.27]} castShadow receiveShadow>
        <boxGeometry args={[w + 0.8, 0.1, 0.55]} />
        <meshStandardMaterial color={DARK_METAL} metalness={0.5} roughness={0.4} />
      </mesh>

      {/* Neon light from outside spills into the shop */}
      <pointLight position={[-0.7, y, z + 1.0]} color={NEON_PINK} intensity={neon} decay={1} />
      <pointLight position={[0.9, y - 1.3, z + 1.0]} color={NEON_CYAN} intensity={neon * 0.8} decay={1} />
    </group>
  )
}

function Ledge({ x, len, y }: { x: number; len: number; y: number }) {
  return (
    <group>
      <mesh position={[x, y - 0.03, WALL_Z + 0.2]} castShadow receiveShadow>
        <boxGeometry args={[len, 0.06, 0.4]} />
        <meshStandardMaterial color={DARK_METAL} metalness={0.5} roughness={0.45} />
      </mesh>
      <mesh position={[x, y + 0.03, WALL_Z + 0.4]} castShadow receiveShadow>
        <boxGeometry args={[len, 0.12, 0.04]} />
        <meshStandardMaterial color={DARK_METAL} metalness={0.5} roughness={0.45} />
      </mesh>
      {/* Light strip along the underside of the display ledge */}
      <mesh position={[x, y - 0.075, WALL_Z + 0.4]}>
        <boxGeometry args={[len, 0.025, 0.025]} />
        <meshBasicMaterial color={NEON_PINK} toneMapped={false} />
      </mesh>
    </group>
  )
}

function Sleeve({ x, y, idx }: { x: number; y: number; idx: number }) {
  // Prefer uploaded or generated custom covers; otherwise use the default cover generated from the index
  const custom = useCoverStore((s) => s.covers[idx])
  const [tex, setTex] = useState<Texture | null>(null)
  useEffect(() => {
    let dead = false
    let made: Texture | null = null
    const finish = (source: HTMLCanvasElement | HTMLImageElement) => {
      if (dead) return
      made = new Texture(source)
      made.needsUpdate = true
      made.colorSpace = SRGBColorSpace
      made.anisotropy = 8
      setTex(made)
    }
    if (custom) {
      const img = new Image()
      img.onload = () => finish(img)
      img.src = custom
    } else {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = COVER_SIZE
      const ctx = canvas.getContext('2d')
      if (ctx) drawGeneratedCover(ctx, idx * 11 + 3, idx % COVER_STYLES.length)
      finish(canvas)
    }
    return () => {
      dead = true
      made?.dispose()
    }
  }, [custom, idx])
  const [hover, setHover] = useState(false)
  useEffect(() => {
    document.body.style.cursor = hover ? 'pointer' : ''
    return () => {
      document.body.style.cursor = ''
    }
  }, [hover])

  return (
    <group
      position={[x, y, WALL_Z + 0.28]}
      rotation={[-LEAN, 0, 0]}
      onClick={(e) => {
        e.stopPropagation()
        useCoverStore.getState().openEditor(idx)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHover(true)
      }}
      onPointerOut={() => setHover(false)}
    >
      <mesh position={[0, SLEEVE / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[SLEEVE, SLEEVE, 0.03]} />
        <meshStandardMaterial attach="material-0" color="#e4dcf2" roughness={0.9} />
        <meshStandardMaterial attach="material-1" color="#e4dcf2" roughness={0.9} />
        <meshStandardMaterial attach="material-2" color="#e4dcf2" roughness={0.9} />
        <meshStandardMaterial attach="material-3" color="#e4dcf2" roughness={0.9} />
        <meshPhysicalMaterial
          attach="material-4"
          map={tex ?? undefined}
          roughness={0.5}
          clearcoat={0.35}
          clearcoatRoughness={0.35}
        />
        <meshStandardMaterial attach="material-5" color="#cfc6e4" roughness={0.9} />
      </mesh>
    </group>
  )
}

const DRAWER_LABELS = ['A–D', 'E–H', 'I–L', 'M–P', 'Q–T', 'U–Z']

function plateTexture(text: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser does not support 2D canvas.')
  drawPlate(ctx, 256, 64, text, '#35f2ff')
  const t = new CanvasTexture(canvas)
  t.colorSpace = SRGBColorSpace
  return t
}

// Counter with a worktop and storage cabinet below. Record compartments with outward-facing spines flank six letter-labeled drawers.
function Counter() {
  const top = useMemo(
    () =>
      createWoodTextures({
        boards: 5, vertical: false, seed: 21, hue: 262, light: 19, sat: 30,
        repeatX: 13 / 7, repeatY: 3.6 / 7,
      }),
    [],
  )
  const bays = useMemo(() => [71, 72, 73, 74].map((seed) => createSpinesTexture(seed)), [])
  const plates = useMemo(() => DRAWER_LABELS.map((l) => plateTexture(l)), [])
  useEffect(
    () => () => {
      top.map.dispose()
      top.bumpMap.dispose()
      bays.forEach((t) => t.dispose())
      plates.forEach((t) => t.dispose())
    },
    [top, bays, plates],
  )

  const dark = '#0e0828'
  const panel = <meshStandardMaterial color={dark} metalness={0.4} roughness={0.55} />
  const BAY_X = [-5.3, -3.3, 3.3, 5.3]
  const DRAWER_X = [-1.5, 0, 1.5]
  const DRAWER_Y = [-0.9, -2.15]

  return (
    <group>
      {/* Countertop */}
      <mesh position={[0, -0.15, 0.1]} castShadow receiveShadow>
        <boxGeometry args={[13, 0.3, 3.6]} />
        <meshStandardMaterial attach="material-0" color={dark} roughness={0.6} />
        <meshStandardMaterial attach="material-1" color={dark} roughness={0.6} />
        {/* Give the countertop a glossy finish to reflect the neon lighting */}
        <meshStandardMaterial attach="material-2" map={top.map} bumpMap={top.bumpMap} bumpScale={0.8} roughness={0.22} metalness={0.15} />
        <meshStandardMaterial attach="material-3" color="#07041a" roughness={0.8} />
        <meshStandardMaterial attach="material-4" color="#1a1040" roughness={0.5} />
        <meshStandardMaterial attach="material-5" color="#07041a" roughness={0.8} />
      </mesh>

      {/* Cabinet structure: two side panels, back panel, bottom panel, toe kick, and two dividers */}
      {[-6.4, 6.4].map((x) => (
        <mesh key={x} position={[x, -1.65, 0.1]} castShadow receiveShadow>
          <boxGeometry args={[0.2, 2.7, 3.4]} />
          {panel}
        </mesh>
      ))}
      <mesh position={[0, -1.65, -1.6]} receiveShadow>
        <boxGeometry args={[12.6, 2.7, 0.1]} />
        <meshStandardMaterial color="#07041a" roughness={0.9} />
      </mesh>
      <mesh position={[0, -2.8, 0.1]} receiveShadow>
        <boxGeometry args={[12.6, 0.1, 3.4]} />
        {panel}
      </mesh>
      <mesh position={[0, -2.875, 1.8]} castShadow>
        <boxGeometry args={[12.6, 0.25, 0.1]} />
        {panel}
      </mesh>
      {[-2.3, 2.3].map((x) => (
        <mesh key={x} position={[x, -1.525, 0.1]} castShadow receiveShadow>
          <boxGeometry args={[0.1, 2.45, 3.3]} />
          {panel}
        </mesh>
      ))}

      {/* Record compartments on both sides, with spines facing outward */}
      {BAY_X.map((x, i) => (
        <mesh key={x} position={[x, -1.55, 1.45]} receiveShadow>
          <planeGeometry args={[2.0, 2.35]} />
          <meshStandardMaterial map={bays[i]} roughness={0.75} />
        </mesh>
      ))}

      {/* Six drawers in the center */}
      {DRAWER_Y.flatMap((y, row) =>
        DRAWER_X.map((x, col) => {
          const idx = row * DRAWER_X.length + col
          return (
            <group key={idx}>
              <mesh position={[x, y, 1.85]} castShadow receiveShadow>
                <boxGeometry args={[1.4, 1.12, 0.1]} />
                <meshStandardMaterial color="#1a1233" metalness={0.6} roughness={0.38} />
              </mesh>
              {/* Drawer handle */}
              <mesh position={[x, y + 0.28, 1.92]}>
                <boxGeometry args={[0.6, 0.05, 0.05]} />
                <meshBasicMaterial color={NEON_CYAN} toneMapped={false} />
              </mesh>
              {/* Letter label */}
              <mesh position={[x, y - 0.12, 1.906]}>
                <planeGeometry args={[0.9, 0.225]} />
                <meshBasicMaterial map={plates[idx]} transparent toneMapped={false} />
              </mesh>
            </group>
          )
        }),
      )}

      {/* Light strips along the front edge and underside of the countertop and the cabinet base */}
      <mesh position={[0, -0.06, 1.915]}>
        <boxGeometry args={[13, 0.03, 0.03]} />
        <meshBasicMaterial color={NEON_CYAN} toneMapped={false} />
      </mesh>
      <mesh position={[0, -0.32, 1.88]}>
        <boxGeometry args={[12.6, 0.03, 0.03]} />
        <meshBasicMaterial color={NEON_PINK} toneMapped={false} />
      </mesh>
      <mesh position={[0, -2.74, 1.84]}>
        <boxGeometry args={[12.6, 0.025, 0.025]} />
        <meshBasicMaterial color={NEON_CYAN} toneMapped={false} />
      </mesh>
      {/* Subtle purple light in front of the cabinet to illuminate its surface */}
      <pointLight position={[0, -1.2, 3.6]} color="#a78bff" intensity={6} decay={1} />
    </group>
  )
}

export default function Shop({ neon = 14 }: { neon?: number }) {
  return (
    <group>
      <Wall />
      <Counter />
      <CyberWindow neon={neon} />

      {LEDGES.map((y) => (
        <group key={y}>
          <Ledge x={-4.325} len={4.55} y={y} />
          <Ledge x={4.325} len={4.55} y={y} />
        </group>
      ))}

      {LEDGES.flatMap((y, row) =>
        COLUMNS.map((x, col) => {
          const idx = row * COLUMNS.length + col
          return <Sleeve key={idx} x={x} y={y} idx={idx} />
        }),
      )}

      <Decor />
    </group>
  )
}
