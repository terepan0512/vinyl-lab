import assert from 'node:assert/strict'
import { test } from 'node:test'
import { APPEARANCE_SETTINGS_VERSION, DEFAULT_LIQUID_SETTINGS, normalizeLiquidSettings, useLiquidSettings } from '../src/state/liquidSettings.ts'
import { DEFAULT_PIGMENT_APPEARANCE } from '../src/audio/paletteAppearance.ts'

test('appearance controls reject invalid values and bound opacity and relief safely', () => {
  const settings = useLiquidSettings.getState()
  settings.reset()
  try {
    settings.setSetting('opacity', -3)
    assert.equal(useLiquidSettings.getState().opacity, 0.25)
    settings.setSetting('opacity', 12)
    assert.equal(useLiquidSettings.getState().opacity, 1)
    settings.setSetting('relief', 5)
    assert.equal(useLiquidSettings.getState().relief, 2)
    settings.setSetting('saturation', -4)
    assert.equal(useLiquidSettings.getState().saturation, 0.5)
    settings.setSetting('saturation', 8)
    assert.equal(useLiquidSettings.getState().saturation, 2)
    settings.setSetting('lightness', 4)
    assert.equal(useLiquidSettings.getState().lightness, 0.14)
    settings.setSetting('opacity', NaN)
    settings.setSetting('flow', Infinity)
    settings.setSetting('saturation', NaN)
    assert.equal(useLiquidSettings.getState().opacity, 1)
    assert.equal(useLiquidSettings.getState().flow, DEFAULT_LIQUID_SETTINGS.flow)
    assert.equal(useLiquidSettings.getState().saturation, 2)
  } finally { settings.reset() }
})

test('appearance preferences persist numeric controls with a migration version and reset to translucent defaults', () => {
  const previous = globalThis.localStorage
  const saved = new Map()
  globalThis.localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) }
  try {
    const settings = useLiquidSettings.getState()
    settings.setSetting('opacity', 0.43)
    settings.setSetting('lightness', 0.12)
    settings.setSetting('saturation', 1.65)
    const persisted = JSON.parse(saved.get('vinyl-liquid-settings-v1'))
    assert.deepEqual(persisted, { ...DEFAULT_LIQUID_SETTINGS, opacity: 0.43, lightness: 0.12, saturation: 1.65,
      appearanceVersion: APPEARANCE_SETTINGS_VERSION })
    settings.reset()
    assert.deepEqual(JSON.parse(saved.get('vinyl-liquid-settings-v1')),
      { ...DEFAULT_LIQUID_SETTINGS, appearanceVersion: APPEARANCE_SETTINGS_VERSION })
  } finally {
    globalThis.localStorage = previous
    useLiquidSettings.getState().reset()
  }
})

test('legacy settings retain user preferences and inherit the new pigment intensity default', () => {
  const old = { opacity: 0.43, lightness: 0.12, flow: 1.8, relief: 0.7 }
  assert.deepEqual(normalizeLiquidSettings(old), { ...old, saturation: DEFAULT_PIGMENT_APPEARANCE.saturation })
  assert.deepEqual(normalizeLiquidSettings({ saturation: Infinity, opacity: -20, lightness: 4 }),
    { ...DEFAULT_LIQUID_SETTINGS, opacity: 0.25, lightness: 0.14 })
  for (const saved of [null, [], 'old', undefined]) assert.deepEqual(normalizeLiquidSettings(saved), DEFAULT_LIQUID_SETTINGS)
})

test('unversioned opacity defaults migrate without erasing customized appearance controls', () => {
  const old = { opacity: 0.68, lightness: 0.12, saturation: 1.7, flow: 1.8, relief: 0.7 }
  assert.equal(DEFAULT_LIQUID_SETTINGS.opacity, 0.82)
  assert.ok(DEFAULT_LIQUID_SETTINGS.opacity < 1)
  assert.deepEqual(normalizeLiquidSettings(old), { ...old, opacity: 0.82 })
  assert.deepEqual(normalizeLiquidSettings({ opacity: 0.68, lightness: 0, flow: 1.25, relief: 1 }),
    { ...DEFAULT_LIQUID_SETTINGS, lightness: 0 })
  for (const opacity of [0.43, 0.67, 0.69, 1]) {
    assert.deepEqual(normalizeLiquidSettings({ ...old, opacity }), { ...old, opacity })
  }
})

test('versioned settings preserve an intentional 68% opacity across later reloads', () => {
  const current = { ...DEFAULT_LIQUID_SETTINGS, opacity: 0.68, lightness: 0.11,
    appearanceVersion: APPEARANCE_SETTINGS_VERSION }
  assert.deepEqual(normalizeLiquidSettings(current),
    { ...DEFAULT_LIQUID_SETTINGS, opacity: 0.68, lightness: 0.11 })
  assert.deepEqual(normalizeLiquidSettings({ ...current, appearanceVersion: 99 }),
    { ...DEFAULT_LIQUID_SETTINGS, opacity: 0.68, lightness: 0.11 })
})

test('storage failure does not prevent immediate appearance changes', () => {
  const previous = globalThis.localStorage
  globalThis.localStorage = { setItem: () => { throw new Error('Storage unavailable') } }
  try {
    useLiquidSettings.getState().setSetting('flow', 1.85)
    assert.equal(useLiquidSettings.getState().flow, 1.85)
  } finally {
    globalThis.localStorage = previous
    useLiquidSettings.getState().reset()
  }
})
