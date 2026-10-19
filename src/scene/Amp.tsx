import { useEffect, useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import {
  CanvasTexture,
  MathUtils,
  SRGBColorSpace,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
} from 'three'
import { usePlayerStore } from '../state/playerStore'
import { BAR, DISPLAY_H, DISPLAY_W, drawDisplay, drawPlate, drawPlayIcon } from './ampDraw'

function fmt(s: number) {
  if (!Number.isFinite(s) || s < 0) s = 0
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

function makeTexture(w: number, h: number): [CanvasTexture, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser does not support 2D canvas')
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 8
  return [tex, ctx]
}

const pointer = (on: boolean) => () => {
  document.body.style.cursor = on ? 'pointer' : ''
}

// Front panel depth in amplifier local coordinates
const FRONT = 1.0

export default function Amp() {
  const playGroup = useRef<Group>(null)
  const addGroup = useRef<Group>(null)
  const ring = useRef<Mesh>(null)
  const press = useRef({ play: 0, add: 0 })

  const [display, dctx] = useMemo(() => makeTexture(DISPLAY_W, DISPLAY_H), [])
  const [icon, ictx] = useMemo(() => makeTexture(128, 128), [])
  const [plate, pctx] = useMemo(() => makeTexture(256, 64), [])
  const lastKey = useRef('')
  const lastPlaying = useRef<boolean | null>(null)

  // Hidden file picker opened by Add record
  const picker = useMemo(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.mp3,.wav,audio/mpeg,audio/wav'
    input.onchange = () => {
      const file = input.files?.[0]
      if (file) usePlayerStore.getState().loadFile(file)
      input.value = ''
    }
    return input
  }, [])

  useEffect(() => {
    drawPlate(pctx, 256, 64, 'ADD RECORD')
    plate.needsUpdate = true
    return () => {
      display.dispose()
      icon.dispose()
      plate.dispose()
      document.body.style.cursor = ''
    }
  }, [display, icon, plate, pctx])

  // Space toggles play/pause; files can be dropped anywhere on the page
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target
      if (
        e.code !== 'Space' ||
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLButtonElement ||
        t instanceof HTMLSelectElement ||
        (t instanceof HTMLElement && (t.isContentEditable || t.closest('summary')))
      )
        return
      e.preventDefault()
      void usePlayerStore.getState().toggle()
    }
    const onOver = (e: DragEvent) => e.preventDefault()
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      const file = e.dataTransfer?.files[0]
      if (file) usePlayerStore.getState().loadFile(file)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('dragover', onOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  useFrame((_, delta) => {
    const s = usePlayerStore.getState()
    const playing = s.status === 'playing'
    const hasTrack = !!s.track
    const progress = s.duration > 0 ? Math.min(1, s.currentTime / s.duration) : 0

    // Display: redraw only when its contents change, at most a few times per second
    const key = `${s.track?.title ?? ''}|${Math.floor(s.currentTime)}|${Math.floor(s.duration)}|${playing}|${s.error ?? ''}|${Math.round(progress * 96)}|${s.status}|${Math.floor(s.analysisProgress * 100)}`
    if (key !== lastKey.current) {
      lastKey.current = key
      drawDisplay(dctx, {
        title: s.track?.title ?? '',
        time: fmt(s.currentTime),
        duration: fmt(s.duration),
        progress,
        playing,
        hasTrack,
        error: s.error,
        status: s.status,
        analysisProgress: s.analysisProgress,
      })
      display.needsUpdate = true
    }

    // Playback knob icon and halo
    if (lastPlaying.current !== playing) {
      lastPlaying.current = playing
      drawPlayIcon(ictx, 128, playing)
      icon.needsUpdate = true
    }
    if (ring.current) {
      const m = ring.current.material as MeshBasicMaterial
      m.color.set(playing ? '#35f2ff' : hasTrack ? '#ff4fd8' : '#3b2a66')
    }

    // Button press animation
    const p = press.current
    if (playGroup.current) {
      playGroup.current.position.z = MathUtils.lerp(playGroup.current.position.z, FRONT + 0.02 - p.play * 0.04, Math.min(1, delta * 20))
    }
    if (addGroup.current) {
      addGroup.current.position.z = MathUtils.lerp(addGroup.current.position.z, FRONT + 0.02 - p.add * 0.04, Math.min(1, delta * 20))
    }
  })

  const onDisplayDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const uv = e.uv
    if (!uv || uv.y > 0.36) return // Only the lower light bar responds
    const ratio = MathUtils.clamp((uv.x * DISPLAY_W - BAR.x0) / (BAR.x1 - BAR.x0), 0, 1)
    const { duration, track, seek } = usePlayerStore.getState()
    if (track && duration > 0) seek(ratio * duration)
  }

  const chrome = { color: '#cfd3dc', metalness: 1, roughness: 0.22 } as const

  return (
    <group position={[3.4, 0, 0.1]}>
      {/* Amplifier body */}
      <RoundedBox args={[3.6, 1.0, 2.0]} radius={0.05} smoothness={4} position={[0, 0.5, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#17142e" metalness={0.8} roughness={0.38} />
      </RoundedBox>
      {/* Feet */}
      {[-1.5, 1.5].flatMap((x) => [-0.8, 0.8].map((z) => (
        <mesh key={`${x}${z}`} position={[x, 0.02, z]}>
          <cylinderGeometry args={[0.1, 0.12, 0.04, 20]} />
          <meshStandardMaterial color="#07041a" roughness={0.6} />
        </mesh>
      )))}
      {/* Top ventilation slots */}
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[0, 1.004, -0.7 + i * 0.16]}>
          <boxGeometry args={[2.8, 0.012, 0.05]} />
          <meshStandardMaterial color="#07041a" roughness={0.8} />
        </mesh>
      ))}

      {/* Front panel */}
      <mesh position={[0, 0.5, FRONT + 0.006]} receiveShadow>
        <boxGeometry args={[3.4, 0.88, 0.012]} />
        <meshStandardMaterial color="#2a2748" metalness={0.9} roughness={0.3} />
      </mesh>

      {/* Display: click the lower light bar to seek */}
      <mesh
        position={[-0.55, 0.64, FRONT + 0.016]}
        onPointerDown={onDisplayDown}
        onPointerOver={pointer(true)}
        onPointerOut={pointer(false)}
      >
        <planeGeometry args={[2.1, 0.525]} />
        <meshBasicMaterial map={display} toneMapped={false} />
      </mesh>
      {/* Display bezel */}
      <mesh position={[-0.55, 0.64, FRONT + 0.012]}>
        <planeGeometry args={[2.18, 0.6]} />
        <meshBasicMaterial color="#05020f" />
      </mesh>

      {/* Playback knob */}
      <group
        ref={playGroup}
        position={[1.17, 0.58, FRONT + 0.02]}
        onPointerDown={(e) => { e.stopPropagation(); press.current.play = 1 }}
        onPointerUp={() => { press.current.play = 0 }}
        onPointerOut={() => { press.current.play = 0; pointer(false)() }}
        onPointerOver={pointer(true)}
        onClick={(e) => { e.stopPropagation(); void usePlayerStore.getState().toggle() }}
      >
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.06]} castShadow>
          <cylinderGeometry args={[0.27, 0.29, 0.12, 48]} />
          <meshStandardMaterial {...chrome} />
        </mesh>
        <mesh position={[0, 0, 0.122]}>
          <circleGeometry args={[0.21, 40]} />
          <meshBasicMaterial map={icon} transparent toneMapped={false} />
        </mesh>
        <mesh ref={ring} position={[0, 0, -0.005]}>
          <torusGeometry args={[0.34, 0.018, 12, 56]} />
          <meshBasicMaterial color="#3b2a66" toneMapped={false} />
        </mesh>
      </group>

      {/* Add record button */}
      <group
        ref={addGroup}
        position={[-1.0, 0.2, FRONT + 0.02]}
        onPointerDown={(e) => { e.stopPropagation(); press.current.add = 1 }}
        onPointerUp={() => { press.current.add = 0 }}
        onPointerOut={() => { press.current.add = 0; pointer(false)() }}
        onPointerOver={pointer(true)}
        onClick={(e) => { e.stopPropagation(); picker.click() }}
      >
        <mesh position={[0, 0, 0.05]} castShadow>
          <boxGeometry args={[1.1, 0.2, 0.1]} />
          <meshStandardMaterial color="#120a33" metalness={0.5} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0, 0.102]}>
          <planeGeometry args={[0.96, 0.24]} />
          <meshBasicMaterial map={plate} transparent toneMapped={false} />
        </mesh>
        {/* Light strip along the top of the button */}
        <mesh position={[0, 0.108, 0.05]}>
          <boxGeometry args={[1.1, 0.014, 0.1]} />
          <meshBasicMaterial color="#ff4fd8" toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}
