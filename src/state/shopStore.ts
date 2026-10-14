
import { create } from 'zustand'

// Toggle the shop's neon lights by clicking the
// VINYL LAB sign above the window.
interface ShopState {
  lightsOn: boolean
  toggleLights: () => void
}

export const useShopStore = create<ShopState>((set) => ({
  lightsOn: true,
  toggleLights: () => set((s) => ({ lightsOn: !s.lightsOn })),
}))
