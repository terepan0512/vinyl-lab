
import { Suspense, useLayoutEffect, useMemo } from 'react'
import { useLoader } from '@react-three/fiber'
import { PlaneGeometry, SRGBColorSpace, TextureLoader } from 'three'
import { WALL_Z } from './layout'
import oorTowel from '../assets/towel-oor.png'
import radTowel from '../assets/towel-rad.jpg'
import bnTowel from '../assets/towel-bn.jpg'

// Towels are displayed on the wall above the window and record sleeve racks,
// each draped over a wooden rod.
// The fabric is modeled using a slightly wavy plane, with the top edge fixed
// and the displacement increasing toward the bottom.
const ROD = '#2a1a44'
const OOR_ASPECT = 2094 / 400 // Actual aspect ratio after cropping transparent edges

function Cloth({ w, h, src }: { w: number; h: number; src: string }) {
  const tex = useLoader(TextureLoader, src)
  useLayoutEffect(() => {
    tex.colorSpace = SRGBColorSpace
    tex.anisotropy = 8
    tex.needsUpdate = true
  }, [tex])

  const geo = useMemo(() => {
    const g = new PlaneGeometry(w, h, 40, 12)
    const pos = g.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const sag = (h / 2 - y) / h // 0 at the top edge, 1 at the bottom edge
      pos.setZ(i, Math.sin(x * 2.6 + 0.6) * 0.045 * sag + Math.sin(x * 6.1) * 0.012 * sag)
    }
    g.computeVertexNormals()
    return g
  }, [w, h])
  useLayoutEffect(() => () => geo.dispose(), [geo])

  return (
    <mesh geometry={geo} position={[0, -h / 2, 0]} castShadow receiveShadow>
      {/* Add subtle emissive lighting to prevent the fabric from appearing
          too dark, as the spotlights provide limited illumination at this height. */}
      <meshStandardMaterial map={tex} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={0.55} roughness={0.95} alphaTest={0.5} />
    </mesh>
  )
}

// Wooden rod with mounting brackets at both ends.
// An additional center bracket is added for longer rods.
function Rod({ x, len, top }: { x: number; len: number; top: number }) {
  const mounts = len > 3 ? [-1, 0, 1] : [-1, 1]
  return (
    <group position={[x, top, WALL_Z + 0.16]}>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, len + 0.3, 14]} />
        <meshStandardMaterial color={ROD} roughness={0.5} metalness={0.2} />
      </mesh>
      {mounts.map((s) => (
        <group key={s} position={[s * (len / 2 + 0.1), 0, 0]}>
          <mesh position={[0, 0, -0.06]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 0.12, 10]} />
            <meshStandardMaterial color="#cfd3dc" metalness={1} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0, -0.12]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 0.02, 18]} />
            <meshStandardMaterial color="#cfd3dc" metalness={1} roughness={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// Towel centered at cx, with width w, hanging downward from the rod.
function Towel({ cx, top, w, aspect, src }: { cx: number; top: number; w: number; aspect: number; src: string }) {
  const h = w / aspect
  return (
    <group position={[cx, top - 0.02, WALL_Z + 0.21]}>
      <Suspense
        fallback={
          <mesh position={[0, -h / 2, 0]}>
            <planeGeometry args={[w, h]} />
            <meshBasicMaterial color="#6a5aa8" />
          </mesh>
        }
      >
        <Cloth w={w} h={h} src={src} />
      </Suspense>
    </group>
  )
}

// Position one rod directly above each row of record sleeve racks.
// The left rod holds one long towel, while the right rod holds
// two towels side by side with a 0.1-unit gap.
const SHELF_L = 4.55 // Length of each record sleeve rack
const TOP = 7.75
const BN_ASPECT = 749 / 306 // Aspect ratio of the cropped back number towel

export default function Towels() {
  const gap = 0.1
  const w = (SHELF_L - gap) / 2
  return (
    <group>
      <Rod x={-4.325} len={SHELF_L} top={TOP} />
      <Towel cx={-4.325} top={TOP} w={SHELF_L} aspect={OOR_ASPECT} src={oorTowel} />

      <Rod x={4.325} len={SHELF_L} top={TOP} />
      <Towel cx={4.325 - (w + gap) / 2} top={TOP} w={w} aspect={1193 / 475} src={radTowel} />
      <Towel cx={4.325 + (w + gap) / 2} top={TOP} w={w} aspect={BN_ASPECT} src={bnTowel} />
    </group>
  )
}
