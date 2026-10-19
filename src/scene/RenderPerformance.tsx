import { useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { usePlayerStore } from '../state/playerStore'
import { RenderBudget } from './renderBudget'

/** Resolution adapts slowly; audio sampling and liquid motion still run each frame. */
export default function RenderPerformance() {
  const setDpr = useThree(state => state.setDpr)
  const budget = useMemo(() => new RenderBudget(window.devicePixelRatio), [])
  useFrame((_, delta) => {
    const suspended = document.hidden || usePlayerStore.getState().status === 'analyzing'
    const ratio = budget.sample(delta, suspended)
    if (ratio !== null) setDpr(ratio)
  })
  return null
}
