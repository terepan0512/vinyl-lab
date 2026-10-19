import { create } from 'zustand'
import { DEFAULT_PIGMENT_APPEARANCE } from '../audio/paletteAppearance.ts'

export interface LiquidSettings {
  opacity: number
  flow: number
  relief: number
  lightness: number
  saturation: number
}

export type LiquidSettingName = keyof LiquidSettings

export const DEFAULT_LIQUID_SETTINGS: Readonly<LiquidSettings> = Object.freeze({
  ...DEFAULT_PIGMENT_APPEARANCE,
  flow: 1.25,
  relief: 1,
})

export const LIQUID_SETTING_LIMITS = {
  opacity: { min: 0.25, max: 1, step: 0.01 },
  flow: { min: 0.25, max: 2.5, step: 0.05 },
  relief: { min: 0, max: 2, step: 0.05 },
  lightness: { min: 0, max: 0.14, step: 0.005 },
  saturation: { min: 0.5, max: 2, step: 0.05 },
} as const

const STORAGE_KEY = 'vinyl-liquid-settings-v1'
export const APPEARANCE_SETTINGS_VERSION = 2
const SETTING_NAMES = Object.keys(DEFAULT_LIQUID_SETTINGS) as LiquidSettingName[]

function boundedSetting(name: LiquidSettingName, value: number): number {
  const { min, max } = LIQUID_SETTING_LIMITS[name]
  return Math.max(min, Math.min(max, value))
}

/** Older saved preferences inherit newly introduced controls from the defaults. */
export function normalizeLiquidSettings(saved: unknown): LiquidSettings {
  const settings = { ...DEFAULT_LIQUID_SETTINGS }
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return settings
  const stored = saved as Record<string, unknown>
  for (const name of SETTING_NAMES) {
    const value = stored[name]
    if (typeof value === 'number' && Number.isFinite(value)) settings[name] = boundedSetting(name, value)
  }
  // The unversioned 68% default diluted every palette with the pale backing.
  // Keep customized opacity values, including 68% saved by the current UI.
  if (stored.appearanceVersion === undefined && stored.opacity === 0.68) {
    settings.opacity = DEFAULT_LIQUID_SETTINGS.opacity
  }
  return settings
}

function restoreSettings(): LiquidSettings {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_LIQUID_SETTINGS }
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    return normalizeLiquidSettings(saved)
  } catch { /* Settings also work when browser storage is unavailable. */ }
  return { ...DEFAULT_LIQUID_SETTINGS }
}

function persistSettings(settings: LiquidSettings) {
  try {
    if (typeof localStorage === 'undefined') return
    const values = Object.fromEntries(SETTING_NAMES.map(name => [name, settings[name]]))
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...values, appearanceVersion: APPEARANCE_SETTINGS_VERSION }))
  } catch { /* Keep the live settings even if browser storage is unavailable. */ }
}

interface LiquidSettingsState extends LiquidSettings {
  setSetting: (name: LiquidSettingName, value: number) => void
  reset: () => void
}

export const useLiquidSettings = create<LiquidSettingsState>((set, get) => ({
  ...restoreSettings(),
  setSetting: (name, value) => {
    if (!Number.isFinite(value)) return
    set({ [name]: boundedSetting(name, value) })
    persistSettings(get())
  },
  reset: () => {
    set({ ...DEFAULT_LIQUID_SETTINGS })
    persistSettings(get())
  },
}))
