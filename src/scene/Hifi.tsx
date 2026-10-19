import { RoundedBox } from '@react-three/drei'

// Floor level beneath the cabinet, shared by the speakers and floor
export const FLOOR_Y = -3.0

const NEON_PINK = '#ff4fd8'
const NEON_CYAN = '#35f2ff'

// ---------------- Floor ----------------
function Floor() {
  return (
    <mesh position={[0, FLOOR_Y, 3]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[40, 16]} />
      <meshStandardMaterial color="#0b0620" metalness={0.3} roughness={0.35} />
    </mesh>
  )
}

// ---------------- Floorstanding speakers ----------------
function Speaker({ x, z, toe }: { x: number; z: number; toe: number }) {
  const W = 1.6
  const H = 3.8
  const D = 1.3
  const FEET = 0.12
  const k = 1.3 // Speaker driver scale factor
  const front = D / 2 + 0.002
  const chrome = <meshStandardMaterial color="#cfd3dc" metalness={1} roughness={0.25} />
  const rubber = <meshStandardMaterial color="#07041a" roughness={0.8} />

  return (
    <group position={[x, FLOOR_Y, z]} rotation={[0, toe, 0]}>
      {/* Feet */}
      {[-0.6, 0.6].flatMap((fx) =>
        [-0.5, 0.5].map((fz) => (
          <mesh key={`${fx}${fz}`} position={[fx, FEET / 2, fz]} castShadow>
            <cylinderGeometry args={[0.07, 0.08, FEET, 14]} />
            {chrome}
          </mesh>
        )),
      )}
      {/* Speaker cabinet */}
      <group position={[0, FEET + H / 2, 0]}>
        <RoundedBox args={[W, H, D]} radius={0.07} smoothness={4} castShadow receiveShadow>
          <meshStandardMaterial color="#14092e" metalness={0.35} roughness={0.42} />
        </RoundedBox>

        {/* Front panel */}
        <mesh position={[0, 0, front]}>
          <planeGeometry args={[W - 0.16, H - 0.16]} />
          <meshStandardMaterial color="#0d0624" metalness={0.5} roughness={0.5} />
        </mesh>

        {/* Tweeter: small dome */}
        <group position={[0, H * 0.32, front]} scale={k}>
          <mesh>
            <circleGeometry args={[0.2, 32]} />
            {rubber}
          </mesh>
          <mesh position={[0, 0, 0.004]}>
            <torusGeometry args={[0.19, 0.02, 10, 32]} />
            {chrome}
          </mesh>
          <mesh position={[0, 0, 0.004]} scale={[1, 1, 0.5]}>
            <sphereGeometry args={[0.13, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={NEON_CYAN} metalness={0.8} roughness={0.25} emissive={NEON_CYAN} emissiveIntensity={0.25} />
          </mesh>
        </group>

        {/* Woofer: large paper cone */}
        <group position={[0, -H * 0.03, front]} scale={k}>
          <mesh>
            <circleGeometry args={[0.5, 40]} />
            {rubber}
          </mesh>
          <mesh position={[0, 0, 0.006]}>
            <torusGeometry args={[0.5, 0.04, 10, 40]} />
            {chrome}
          </mesh>
          <mesh position={[0, 0, 0.008]}>
            <torusGeometry args={[0.38, 0.035, 10, 40]} />
            <meshStandardMaterial color="#1b1140" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0, 0.012]}>
            <torusGeometry args={[0.26, 0.012, 8, 40]} />
            <meshStandardMaterial color="#3a2a78" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0, 0.012]} scale={[1, 1, 0.6]}>
            <sphereGeometry args={[0.14, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#241a56" metalness={0.4} roughness={0.5} />
          </mesh>
        </group>

        {/* Bass reflex port */}
        <group position={[0, -H * 0.37, front]} scale={k}>
          <mesh>
            <circleGeometry args={[0.11, 24]} />
            <meshBasicMaterial color="#02010a" />
          </mesh>
          <mesh position={[0, 0, 0.004]}>
            <torusGeometry args={[0.11, 0.015, 8, 24]} />
            {chrome}
          </mesh>
        </group>

        {/* Neon: vertical strips on both sides and a pink horizontal strip at the bottom */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * (W / 2 - 0.05), 0, front + 0.004]}>
            <boxGeometry args={[0.025, H - 0.4, 0.02]} />
            <meshBasicMaterial color={s < 0 ? NEON_PINK : NEON_CYAN} toneMapped={false} />
          </mesh>
        ))}
        <mesh position={[0, -H / 2 + 0.1, front + 0.004]}>
          <boxGeometry args={[W - 0.3, 0.025, 0.02]} />
          <meshBasicMaterial color={NEON_PINK} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

// ---------------- Headphone stand and hi-fi headphones ----------------
// A wide, flat headband with oval earcups, brushed metal outer plates, and soft pink-rimmed ear cushions.
function Headphones({ x, z, ry }: { x: number; z: number; ry: number }) {
  const R = 0.52 // Headband radius
  const stemTop = 1.4 // Headphone stand top height
  const yc = stemTop - R // Headband center height
  const CUP_Y = yc - 0.36 // Earcup center height
  const chrome = <meshStandardMaterial color="#cfd3dc" metalness={1} roughness={0.25} />
  const brushed = <meshStandardMaterial color="#9a96b8" metalness={1} roughness={0.38} />
  const shell = <meshStandardMaterial color="#17102f" metalness={0.45} roughness={0.32} />
  const leather = <meshStandardMaterial color="#1b1038" roughness={0.55} />
  const padArc = Math.PI * 0.5

  return (
    <group position={[x, 0, z]} rotation={[0, ry, 0]}>
      {/* Stand: base, upright, and small disc supporting the headband */}
      <mesh position={[0, 0.03, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.38, 0.4, 0.06, 32]} />
        <meshStandardMaterial color="#1a1233" metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.065, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.33, 0.012, 8, 40]} />
        <meshBasicMaterial color={NEON_CYAN} toneMapped={false} />
      </mesh>
      <mesh position={[0, (stemTop - 0.12) / 2 + 0.03, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.035, stemTop - 0.12, 14]} />
        {chrome}
      </mesh>
      <mesh position={[0, stemTop - 0.1, 0]} scale={[1, 0.3, 1]}>
        <sphereGeometry args={[0.15, 20, 12]} />
        {chrome}
      </mesh>

      {/* Headband: wide flat band with pink padding inside */}
      <mesh position={[0, yc, 0]} scale={[1, 1, 2.2]} castShadow>
        <torusGeometry args={[R, 0.05, 12, 48, Math.PI]} />
        {leather}
      </mesh>
      <mesh position={[0, yc, 0]} rotation={[0, 0, Math.PI / 2 - padArc / 2]} scale={[1, 1, 1.9]}>
        <torusGeometry args={[R - 0.04, 0.032, 10, 32, padArc]} />
        <meshStandardMaterial color={NEON_PINK} emissive={NEON_PINK} emissiveIntensity={0.25} roughness={0.5} />
      </mesh>

      {/* Two earcups */}
      {[-1, 1].map((s) => (
        <group key={s}>
          {/* Metal sliders at the headband ends, inserted into the earcup tops */}
          <mesh position={[s * R, yc - 0.1, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.22, 12]} />
            {chrome}
          </mesh>
          <group position={[s * (R + 0.02), CUP_Y, 0]}>
            {/* Oval earcup shell */}
            <mesh scale={[0.17, 0.31, 0.26]} castShadow>
              <sphereGeometry args={[1, 36, 24]} />
              {shell}
            </mesh>
            {/* Outer brushed metal plate */}
            <mesh position={[s * 0.168, 0, 0]} rotation={[0, s * Math.PI / 2, 0]} scale={[0.82, 1.1, 1]}>
              <circleGeometry args={[0.23, 40]} />
              {brushed}
            </mesh>
            {/* Pink light ring in the center of the plate */}
            <mesh position={[s * 0.17, 0, 0]} rotation={[0, s * Math.PI / 2, 0]} scale={[0.82, 1.1, 1]}>
              <torusGeometry args={[0.12, 0.011, 8, 36]} />
              <meshBasicMaterial color={NEON_PINK} toneMapped={false} />
            </mesh>
            {/* Soft oval ear cushions facing the listener */}
            <mesh position={[-s * 0.15, 0, 0]} rotation={[0, Math.PI / 2, 0]} scale={[0.85, 1.15, 1]}>
              <torusGeometry args={[0.18, 0.075, 14, 36]} />
              <meshStandardMaterial color="#2a1650" roughness={0.9} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  )
}

export default function Hifi() {
  return (
    <group>
      <Floor />
      {/* One floorstanding speaker on each side of the cabinet, angled slightly inward */}
      <Speaker x={-7.9} z={0.4} toe={0.18} />
      <Speaker x={7.9} z={0.4} toe={-0.18} />
      {/* Headphone stand at the front left of the counter, beneath the sign */}
      <Headphones x={-4.5} z={1.25} ry={0.35} />
    </group>
  )
}
