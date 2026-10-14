import { RoundedBox } from '@react-three/drei'

// 地面在柜子底下，音响和地板都以它为基准
export const FLOOR_Y = -3.0

const NEON_PINK = '#ff4fd8'
const NEON_CYAN = '#35f2ff'

// ---------------- 地板 ----------------
function Floor() {
  return (
    <mesh position={[0, FLOOR_Y, 3]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[40, 16]} />
      <meshStandardMaterial color="#0b0620" metalness={0.3} roughness={0.35} />
    </mesh>
  )
}

// ---------------- 落地音箱 ----------------
function Speaker({ x, z, toe }: { x: number; z: number; toe: number }) {
  const W = 1.6
  const H = 3.8
  const D = 1.3
  const FEET = 0.12
  const k = 1.3 // 喇叭单元的放大倍数
  const front = D / 2 + 0.002
  const chrome = <meshStandardMaterial color="#cfd3dc" metalness={1} roughness={0.25} />
  const rubber = <meshStandardMaterial color="#07041a" roughness={0.8} />

  return (
    <group position={[x, FLOOR_Y, z]} rotation={[0, toe, 0]}>
      {/* 脚 */}
      {[-0.6, 0.6].flatMap((fx) =>
        [-0.5, 0.5].map((fz) => (
          <mesh key={`${fx}${fz}`} position={[fx, FEET / 2, fz]} castShadow>
            <cylinderGeometry args={[0.07, 0.08, FEET, 14]} />
            {chrome}
          </mesh>
        )),
      )}
      {/* 箱体 */}
      <group position={[0, FEET + H / 2, 0]}>
        <RoundedBox args={[W, H, D]} radius={0.07} smoothness={4} castShadow receiveShadow>
          <meshStandardMaterial color="#14092e" metalness={0.35} roughness={0.42} />
        </RoundedBox>

        {/* 前面板 */}
        <mesh position={[0, 0, front]}>
          <planeGeometry args={[W - 0.16, H - 0.16]} />
          <meshStandardMaterial color="#0d0624" metalness={0.5} roughness={0.5} />
        </mesh>

        {/* 高音：小圆顶 */}
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

        {/* 低音：大纸盆 */}
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

        {/* 倒相孔 */}
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

        {/* 霓虹：左右两条竖灯，底部一条粉色横灯 */}
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

// ---------------- 耳机架和 hifi 耳机 ----------------
// 头梁是一条扁平的宽带，耳罩是椭圆的，外面一块拉丝金属盖板，里面是粉边的软耳垫。
function Headphones({ x, z, ry }: { x: number; z: number; ry: number }) {
  const R = 0.52 // 头梁半径
  const stemTop = 1.4 // 耳机架顶端高度
  const yc = stemTop - R // 头梁圆心高度
  const CUP_Y = yc - 0.36 // 耳罩中心高度
  const chrome = <meshStandardMaterial color="#cfd3dc" metalness={1} roughness={0.25} />
  const brushed = <meshStandardMaterial color="#9a96b8" metalness={1} roughness={0.38} />
  const shell = <meshStandardMaterial color="#17102f" metalness={0.45} roughness={0.32} />
  const leather = <meshStandardMaterial color="#1b1038" roughness={0.55} />
  const padArc = Math.PI * 0.5

  return (
    <group position={[x, 0, z]} rotation={[0, ry, 0]}>
      {/* 架子：底座、立杆、托住头梁的小圆盘 */}
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

      {/* 头梁：扁平的宽带，里面一段粉色软垫 */}
      <mesh position={[0, yc, 0]} scale={[1, 1, 2.2]} castShadow>
        <torusGeometry args={[R, 0.05, 12, 48, Math.PI]} />
        {leather}
      </mesh>
      <mesh position={[0, yc, 0]} rotation={[0, 0, Math.PI / 2 - padArc / 2]} scale={[1, 1, 1.9]}>
        <torusGeometry args={[R - 0.04, 0.032, 10, 32, padArc]} />
        <meshStandardMaterial color={NEON_PINK} emissive={NEON_PINK} emissiveIntensity={0.25} roughness={0.5} />
      </mesh>

      {/* 两个耳罩 */}
      {[-1, 1].map((s) => (
        <group key={s}>
          {/* 头梁末端的金属滑杆，插进耳罩顶 */}
          <mesh position={[s * R, yc - 0.1, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.22, 12]} />
            {chrome}
          </mesh>
          <group position={[s * (R + 0.02), CUP_Y, 0]}>
            {/* 椭圆的罩体 */}
            <mesh scale={[0.17, 0.31, 0.26]} castShadow>
              <sphereGeometry args={[1, 36, 24]} />
              {shell}
            </mesh>
            {/* 外面的拉丝金属盖板 */}
            <mesh position={[s * 0.168, 0, 0]} rotation={[0, s * Math.PI / 2, 0]} scale={[0.82, 1.1, 1]}>
              <circleGeometry args={[0.23, 40]} />
              {brushed}
            </mesh>
            {/* 盖板中间一圈粉色灯 */}
            <mesh position={[s * 0.17, 0, 0]} rotation={[0, s * Math.PI / 2, 0]} scale={[0.82, 1.1, 1]}>
              <torusGeometry args={[0.12, 0.011, 8, 36]} />
              <meshBasicMaterial color={NEON_PINK} toneMapped={false} />
            </mesh>
            {/* 里面朝向头的软耳垫，椭圆的 */}
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
      {/* 柜子两边各一只落地音箱，略微向内转 */}
      <Speaker x={-7.9} z={0.4} toe={0.18} />
      <Speaker x={7.9} z={0.4} toe={-0.18} />
      {/* 台面左前角的耳机架，在灯牌下面 */}
      <Headphones x={-4.5} z={1.25} ry={0.35} />
    </group>
  )
}
