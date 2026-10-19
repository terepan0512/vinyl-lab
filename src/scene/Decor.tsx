import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import {
  CanvasTexture,
  ExtrudeGeometry,
  Shape,
  ShapeGeometry,
  AdditiveBlending,
  RepeatWrapping,
  type MeshBasicMaterial,
  SRGBColorSpace,
  TextureLoader,
} from 'three'
import { WALL_LIFT, WALL_Z } from './layout'
import { FRET_COUNT, NUT_Y, fretY, traceGuitarBody, tracePick } from './guitarShape'
import NeonSign from './NeonSign'
import TitleSign from './TitleSign'
import Towels from './Towels'
import { GLOW_SIZE, drawGlowFrame } from './neonDraw'
import { PICK_TEX, drawPickDesign, drawPickFace, type PickDesign, type PickKind } from './pickDraw'
import oorUrl from '../assets/poster-oor.jpg'
import bannerUrl from '../assets/banner-rad.jpg'

const DARK_METAL = '#1a1233'
const CHROME = { color: '#d5d8e0', metalness: 1, roughness: 0.22 } as const

// ---------------- Electric guitar ----------------
const BODY_SY = 1.18 // Stretch the body vertically for more realistic guitar proportions
const POCKET_Y = 1.95 * BODY_SY // Neck joint height
const BRIDGE_Y = 0.6
const Z_TOP = 0.27 // Front body depth (0.22 extrusion plus 0.04 bevels on both sides)

function Guitar({ x, y, tilt }: { x: number; y: number; tilt: number }) {
  const shape = useMemo(() => {
    const s = new Shape()
    traceGuitarBody(s)
    return s
  }, [])
  const bodyGeo = useMemo(
    () =>
      new ExtrudeGeometry(shape, {
        depth: 0.22,
        bevelEnabled: true,
        bevelThickness: 0.04,
        bevelSize: 0.04,
        bevelSegments: 3,
        curveSegments: 28,
      }),
    [shape],
  )
  const guardGeo = useMemo(() => new ShapeGeometry(shape, 28), [shape])
  useEffect(
    () => () => {
      bodyGeo.dispose()
      guardGeo.dispose()
    },
    [bodyGeo, guardGeo],
  )

  const frets = useMemo(() => Array.from({ length: FRET_COUNT }, (_, i) => fretY(i + 1)), [])
  const neckLen = NUT_Y - (POCKET_Y - 0.1)

  return (
    <group position={[x, y, WALL_Z + 0.06]} rotation={[0, 0, tilt]}>
      {/* Guitar body */}
      <mesh geometry={bodyGeo} scale={[1, BODY_SY, 1]} castShadow receiveShadow>
        <meshPhysicalMaterial color="#ff4fd8" metalness={0.25} roughness={0.25} clearcoat={1} clearcoatRoughness={0.08} />
      </mesh>
      {/* Pickguard */}
      <mesh geometry={guardGeo} position={[0, 0.28, Z_TOP + 0.004]} scale={[0.74, 0.62 * BODY_SY, 1]} receiveShadow>
        <meshPhysicalMaterial color="#120a2e" roughness={0.3} clearcoat={0.8} />
      </mesh>
      {/* Pickups */}
      {[1.0, 1.4, 1.8].map((py) => (
        <mesh key={py} position={[0, py, Z_TOP + 0.03]} castShadow>
          <boxGeometry args={[0.62, 0.07, 0.05]} />
          <meshStandardMaterial color="#efe8fb" roughness={0.45} />
        </mesh>
      ))}
      {/* Bridge */}
      <mesh position={[0, BRIDGE_Y, Z_TOP + 0.02]} castShadow>
        <boxGeometry args={[0.5, 0.12, 0.035]} />
        <meshStandardMaterial {...CHROME} />
      </mesh>
      {/* Knobs */}
      {[[0.5, 0.34], [0.3, 0.24], [0.1, 0.18]].map(([kx, ky]) => (
        <mesh key={kx} position={[kx, ky, Z_TOP + 0.045]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.055, 0.07, 20]} />
          <meshStandardMaterial {...CHROME} />
        </mesh>
      ))}

      {/* Neck */}
      <mesh position={[0, POCKET_Y - 0.1 + neckLen / 2, 0.2]} castShadow>
        <boxGeometry args={[0.25, neckLen, 0.07]} />
        <meshStandardMaterial color="#c9965a" roughness={0.5} />
      </mesh>
      {/* Fretboard */}
      <mesh position={[0, POCKET_Y - 0.1 + neckLen / 2, 0.24]}>
        <boxGeometry args={[0.21, neckLen, 0.015]} />
        <meshStandardMaterial color="#1b0f2e" roughness={0.45} />
      </mesh>
      {/* Frets */}
      {frets.map((fy, i) => (
        <mesh key={i} position={[0, fy, 0.25]}>
          <boxGeometry args={[0.21, 0.011, 0.012]} />
          <meshStandardMaterial {...CHROME} />
        </mesh>
      ))}
      {/* Headstock and tuning pegs */}
      <mesh position={[0, NUT_Y + 0.33, 0.2]} castShadow>
        <boxGeometry args={[0.36, 0.66, 0.05]} />
        <meshStandardMaterial color="#c9965a" roughness={0.5} />
      </mesh>
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} position={[-0.21, NUT_Y + 0.1 + i * 0.1, 0.2]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.022, 0.022, 0.1, 12]} />
          <meshStandardMaterial {...CHROME} />
        </mesh>
      ))}
      {/* Strings */}
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} position={[(i - 2.5) * 0.034, (BRIDGE_Y + NUT_Y) / 2, Z_TOP + 0.045]}>
          <cylinderGeometry args={[0.0055, 0.0055, NUT_Y - BRIDGE_Y, 6]} />
          <meshStandardMaterial {...CHROME} />
        </mesh>
      ))}
      {/* Hook */}
      <mesh position={[0, NUT_Y + 0.7, 0.1]} castShadow>
        <boxGeometry args={[0.1, 0.22, 0.12]} />
        <meshStandardMaterial {...CHROME} />
      </mesh>
    </group>
  )
}

// Image poster. useLoader caches the image; a purple placeholder keeps the scene visible while loading.
const IMG_ASPECT = 1036 / 732 // ONE OK ROCK poster with black borders cropped out

interface ImagePosterProps {
  x: number
  y: number
  w: number
  src: string
  rot: number
  aspect?: number
}

function PosterBody({ w, src, aspect }: { w: number; src: string; aspect: number }) {
  const tex = useLoader(TextureLoader, src)
  useLayoutEffect(() => {
    tex.colorSpace = SRGBColorSpace
    tex.anisotropy = 8
    tex.needsUpdate = true
  }, [tex])
  return (
    <mesh>
      <planeGeometry args={[w, w * aspect]} />
      {/* Use an unlit material to keep this image visible in a corner beyond the spotlight */}
      <meshBasicMaterial map={tex} color="#bdb6dc" />
    </mesh>
  )
}

function ImagePoster({ x, y, w, src, rot, aspect = IMG_ASPECT }: ImagePosterProps) {
  const h = w * aspect
  return (
    <group position={[x, y, WALL_Z + 0.02]} rotation={[0, 0, rot]}>
      <Suspense
        fallback={
          <mesh>
            <planeGeometry args={[w, h]} />
            <meshBasicMaterial color="#6a5aa8" />
          </mesh>
        }
      >
        <PosterBody w={w} src={src} aspect={aspect} />
      </Suspense>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (w / 2 - 0.12), h / 2 - 0.03, 0.012]} rotation={[0, 0, s * 0.5]}>
          <planeGeometry args={[0.32, 0.12]} />
          <meshStandardMaterial color="#efe3bd" transparent opacity={0.75} roughness={0.5} />
        </mesh>
      ))}
    </group>
  )
}

// ---------------- Original light sticks: two overlapping sticks hung from one hook by wrist straps ----------------
const STICK_R = 0.07 // Tube radius (slender)

function makeGlowTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 8
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser does not support 2D canvas')
  const g = ctx.createLinearGradient(0, 0, 0, 256)
  g.addColorStop(0, '#ff4fd8')
  g.addColorStop(0.5, '#35f2ff')
  g.addColorStop(1, '#ff4fd8') // Matching endpoint colors keep scrolling seamless
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 8, 256)
  const t = new CanvasTexture(canvas)
  t.colorSpace = SRGBColorSpace
  t.wrapT = RepeatWrapping
  return t
}

function Stick({ swing, dx, dz, phase }: { swing: number; dx: number; dz: number; phase: number }) {
  const glow = useMemo(makeGlowTexture, [])
  useEffect(() => () => glow.dispose(), [glow])
  const mat = useRef<MeshBasicMaterial>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    glow.offset.y = (t * 0.08 + phase) % 1
    if (mat.current) mat.current.opacity = 0.88 + 0.08 * Math.sin(t * 2.2 + phase * 6)
  })
  const R = STICK_R
  const chrome = <meshStandardMaterial color="#d5d8e0" metalness={1} roughness={0.25} />
  const dark = <meshStandardMaterial color="#1a1233" metalness={0.5} roughness={0.4} />

  // The anchor is at the origin; the strap drops 0.28 to the handle, with the stick hanging downward
  return (
    <group position={[dx, 0, dz]} rotation={[0, 0, swing]}>
      {/* Wrist strap: a small vertical loop */}
      <mesh position={[0, -0.14, 0]}>
        <torusGeometry args={[0.1, 0.012, 8, 28]} />
        <meshStandardMaterial color="#ff4fd8" emissive="#ff4fd8" emissiveIntensity={0.5} roughness={0.5} />
      </mesh>
      <group position={[0, -0.28, 0]} rotation={[0, 0, Math.PI]}>
        {/* Handle (at the top) */}
        <mesh position={[0, 0.3, 0]} castShadow>
          <cylinderGeometry args={[R * 1.05, R * 0.8, 0.6, 20]} />
          {dark}
        </mesh>
        <mesh position={[0, 0.01, 0]}>
          <cylinderGeometry args={[R * 0.9, R * 0.9, 0.03, 20]} />
          {chrome}
        </mesh>
        <mesh position={[0, 0.32, R * 1.0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.02, 12]} />
          <meshBasicMaterial color="#35f2ff" toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.62, 0]} castShadow>
          <cylinderGeometry args={[R * 1.3, R * 1.15, 0.07, 20]} />
          {chrome}
        </mesh>
        {/* Light tube: length 1.0 */}
        <mesh position={[0, 1.16, 0]}>
          <cylinderGeometry args={[R * 0.8, R * 0.8, 1.0, 20, 1, true]} />
          <meshBasicMaterial ref={mat} map={glow} transparent toneMapped={false} />
        </mesh>
        <mesh position={[0, 1.16, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 1.0, 10]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.7} toneMapped={false} />
        </mesh>
        <mesh position={[0, 1.16, 0]}>
          <cylinderGeometry args={[R, R, 1.0, 20, 1, true]} />
          <meshPhysicalMaterial color="#dfe6ff" transparent opacity={0.16} roughness={0.05} clearcoat={1} depthWrite={false} />
        </mesh>
        <mesh position={[0, 1.68, 0]}>
          <sphereGeometry args={[R, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#ff4fd8" metalness={0.6} roughness={0.25} />
        </mesh>
      </group>
    </group>
  )
}

function LightSticks({ x, y }: { x: number; y: number }) {
  const chrome = <meshStandardMaterial color="#d5d8e0" metalness={1} roughness={0.25} />
  return (
    <group position={[x, y, WALL_Z]}>
      {/* Hook: wall plate and projecting rod, with a ball tip to retain the strap */}
      <mesh position={[0, 0, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.09, 0.09, 0.03, 20]} />
        {chrome}
      </mesh>
      <mesh position={[0, 0, 0.12]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 0.2, 10]} />
        {chrome}
      </mesh>
      <mesh position={[0, 0, 0.23]} castShadow>
        <sphereGeometry args={[0.04, 14, 10]} />
        {chrome}
      </mesh>
      {/* Hang the two sticks with slightly different angles */}
      <Stick swing={0.1} dx={0.02} dz={0.13} phase={0} />
      <Stick swing={-0.09} dx={-0.02} dz={0.17} phase={0.5} />
      <pointLight position={[0.3, -1.2, 0.6]} color="#c08cff" intensity={3} decay={1} distance={5} />
    </group>
  )
}

// ---------------- Guitar pick display frame ----------------
// Nine picks in a 3 × 3 grid. Some are solid; others have original skull, eye, lightning, or record designs.
// base is the pick color, art is the design color, and dark is the design cutout color (usually the base color).
const BLACK = '#1a1240' // Use deep indigo for dark picks so they remain visible against the dark backing
type PickDef = { x: number; y: number; r: number; base: string; kind: PickKind; art?: string; dark?: string; design?: PickDesign; grad?: [string, string] }

const PICKS: PickDef[] = [
  {
    x: -0.46, y: 0.46, r: 0.2, base: BLACK, kind: 'none',
    design: { layout: 'badge', ink: '#35f2ff', hole: BLACK, icon: 'stripes', lines: ['Toru', 'dragonfly'] },
  },
  { x: 0, y: 0.46, r: -0.15, base: '#35f2ff', kind: 'skull', art: '#1a1240', dark: '#35f2ff' },
  { x: 0.46, y: 0.46, r: 0.3, base: '#2a1d8f', kind: 'eye', art: '#ff6ad5', dark: '#2a1d8f' },
  { x: -0.46, y: 0, r: -0.3, base: '#ff4fd8', kind: 'bolt', art: '#1a1240', dark: '#ff4fd8' },
  {
    x: 0, y: 0, r: 0.06, base: '#26282c', kind: 'none',
    design: { layout: 'word', ink: '#e8e8ec', dot: '#35f2ff', lines: ['TORU', 'ONE OK ROCK', 'dragonfly'] },
  },
  { x: 0.46, y: 0, r: -0.2, base: BLACK, kind: 'skull', art: '#ff6ad5', dark: BLACK },
  { x: -0.46, y: -0.46, r: 0.25, base: BLACK, kind: 'eye', art: '#35f2ff', dark: BLACK },
  { x: 0, y: -0.46, r: -0.1, base: '#7c6bff', kind: 'note', art: '#ffffff', dark: '#7c6bff' },
  { x: 0.46, y: -0.46, r: 0.2, base: '#35f2ff', kind: 'record', art: '#1a1240', dark: '#35f2ff' },
]

function PickFrame({ x, y }: { x: number; y: number }) {
  const pickGeo = useMemo(() => {
    const s = new Shape()
    tracePick(s)
    return new ExtrudeGeometry(s, {
      depth: 0.02,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.008,
      bevelSegments: 2,
      curveSegments: 16,
    })
  }, [])
  // Design textures for each pick (none for solid picks)
  const faces = useMemo(
    () =>
      PICKS.map((p) => {
        if (p.kind === 'none' && !p.design) return null
        const canvas = document.createElement('canvas')
        canvas.width = PICK_TEX
        canvas.height = PICK_TEX
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('This browser does not support 2D canvas')
        if (p.design) drawPickDesign(ctx, p.design)
        else drawPickFace(ctx, p.kind, p.art ?? '#ffffff', p.dark ?? p.base)
        const t = new CanvasTexture(canvas)
        t.colorSpace = SRGBColorSpace
        t.anisotropy = 8
        return t
      }),
    [],
  )
  useEffect(() => () => faces.forEach((t) => t?.dispose()), [faces])

  // Gradient pick: map a diagonal gradient texture onto the pick outline
  const bodyGeo = useMemo(() => {
    const sh = new Shape()
    tracePick(sh)
    return new ShapeGeometry(sh, 16)
  }, [])
  const bodies = useMemo(
    () =>
      PICKS.map((p) => {
        if (!p.grad) return null
        const canvas = document.createElement('canvas')
        canvas.width = 128
        canvas.height = 128
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('This browser does not support 2D canvas')
        const g = ctx.createLinearGradient(20, 0, 108, 128)
        g.addColorStop(0, p.grad[0])
        g.addColorStop(1, p.grad[1])
        ctx.fillStyle = g
        ctx.fillRect(0, 0, 128, 128)
        const t = new CanvasTexture(canvas)
        t.colorSpace = SRGBColorSpace
        // A 1 × 1 texture maps to the pick outline at x ∈ [-.5,.5], y ∈ [-.55,.55]
        t.repeat.set(1, 1 / 1.1)
        t.offset.set(0.5, 0.55 / 1.1)
        return t
      }),
    [],
  )
  useEffect(
    () => () => {
      bodyGeo.dispose()
      bodies.forEach((t) => t?.dispose())
    },
    [bodyGeo, bodies],
  )

  const S = 1.7 // Outer frame side length
  const HALO = S + 1.1 // Halo plane side length
  const halo = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = GLOW_SIZE
    canvas.height = GLOW_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('This browser does not support 2D canvas')
    drawGlowFrame(ctx, (S / HALO) * GLOW_SIZE)
    const t = new CanvasTexture(canvas)
    t.colorSpace = SRGBColorSpace
    return t
  }, [S, HALO])
  useEffect(
    () => () => {
      pickGeo.dispose()
      halo.dispose()
    },
    [pickGeo, halo],
  )

  const t = 0.1 // Frame thickness
  const D = 0.14
  const frame = <meshStandardMaterial color={DARK_METAL} metalness={0.6} roughness={0.4} />

  return (
    <group position={[x, y, WALL_Z]}>
      <mesh position={[0, S / 2 - t / 2, D / 2]} castShadow>
        <boxGeometry args={[S, t, D]} />
        {frame}
      </mesh>
      <mesh position={[0, -S / 2 + t / 2, D / 2]} castShadow>
        <boxGeometry args={[S, t, D]} />
        {frame}
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (S / 2 - t / 2), 0, D / 2]} castShadow>
          <boxGeometry args={[t, S, D]} />
          {frame}
        </mesh>
      ))}
      {/* Velvet backing */}
      <mesh position={[0, 0, 0.02]} receiveShadow>
        <planeGeometry args={[S - t * 2, S - t * 2]} />
        <meshStandardMaterial color="#0a0620" roughness={1} />
      </mesh>
      {/* Picks */}
      {PICKS.map((p, i) => (
        <mesh key={i} geometry={pickGeo} position={[p.x, p.y, 0.035]} rotation={[0, 0, p.r]} scale={0.37} castShadow>
          <meshPhysicalMaterial color={p.base} roughness={0.3} clearcoat={0.8} clearcoatRoughness={0.15} />
          {bodies[i] && (
            <mesh geometry={bodyGeo} position={[0, 0, 0.0295]}>
              <meshBasicMaterial map={bodies[i]} toneMapped={false} />
            </mesh>
          )}
          {faces[i] && (
            <mesh position={[0, -0.02, 0.031]}>
              <planeGeometry args={[0.8, 0.8]} />
              <meshBasicMaterial map={faces[i]} transparent toneMapped={false} depthWrite={false} />
            </mesh>
          )}
        </mesh>
      ))}
      {/* Glass */}
      <mesh position={[0, 0, D - 0.01]}>
        <planeGeometry args={[S - t * 2, S - t * 2]} />
        <meshStandardMaterial color="#9aa8ff" transparent opacity={0.06} roughness={0.05} envMapIntensity={2} depthWrite={false} />
      </mesh>
      {/* Outer neon tubes: pink at the top and left, cyan at the bottom and right */}
      {[
        { p: [0, S / 2 - 0.015], a: [S, 0.03], c: '#ff4fd8' },
        { p: [-(S / 2 - 0.015), 0], a: [0.03, S], c: '#ff4fd8' },
        { p: [0, -(S / 2 - 0.015)], a: [S, 0.03], c: '#35f2ff' },
        { p: [S / 2 - 0.015, 0], a: [0.03, S], c: '#35f2ff' },
      ].map((b, i) => (
        <mesh key={i} position={[b.p[0], b.p[1], D + 0.004]}>
          <boxGeometry args={[b.a[0], b.a[1], 0.02]} />
          <meshBasicMaterial color={b.c} toneMapped={false} />
        </mesh>
      ))}
      {/* Halo: behind the frame, visible around its edge on the wall */}
      <mesh position={[0, 0, 0.008]} renderOrder={-1}>
        <planeGeometry args={[HALO, HALO]} />
        <meshBasicMaterial map={halo} transparent toneMapped={false} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  )
}

export default function Decor() {
  return (
    <group>
      {/* VINYL LAB sign above the window; click to toggle its lights */}
      <TitleSign />

      {/* Neon sign behind the counter */}
      <NeonSign />

      {/* Wall above the window: two towels hanging from a wooden rod */}
      <Towels />

      {/* Left: electric guitar with two light sticks hanging beside it */}
      <Guitar x={-7.7} y={0.9 + WALL_LIFT} tilt={0.15} />
      <LightSticks x={-7.0} y={6.2 + WALL_LIFT} />

      {/* Right: poster, pick display frame, and RADWIMPS poster (portrait crop) */}
      <ImagePoster x={7.7} y={5.68} w={1.3} src={oorUrl} rot={-0.03} />
      <PickFrame x={7.7} y={3.56} />
      <ImagePoster x={7.7} y={1.44} w={1.3} aspect={640 / 452} src={bannerUrl} rot={0.04} />
    </group>
  )
}
