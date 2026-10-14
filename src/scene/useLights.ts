
import { useRef } from 'react'
import { useShopStore } from '../state/shopStore'

// Returns a function that calculates the neon sign's brightness (0–1)
// at a given time in seconds.
// When switched on, the neon tubes flicker briefly before stabilizing,
// simulating an electrical startup effect.
// When switched off, the lights quickly fade to near darkness.
export function useLights() {
  const memo = useRef({ on: true, since: -10 })
  return (t: number) => {
    const m = memo.current
    const on = useShopStore.getState().lightsOn
    if (on !== m.on) {
      m.on = on
      m.since = t
    }
    const age = t - m.since
    if (on) return age < 0.9 ? (Math.sin(age * 55) > 0.15 ? 1 : 0.08) : 1
    return age < 0.25 ? 0.03 + 0.4 * (1 - age / 0.25) : 0.03
  }
}
