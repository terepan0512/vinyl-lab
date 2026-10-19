import { useId } from 'react'
import { LIQUID_SETTING_LIMITS, useLiquidSettings, type LiquidSettingName } from '../state/liquidSettings'
import './liquidControls.css'

const CONTROLS: { name: LiquidSettingName; label: string }[] = [
  { name: 'opacity', label: 'Opacity' },
  { name: 'flow', label: 'Flow' },
  { name: 'relief', label: 'Relief' },
  { name: 'lightness', label: 'Brightness' },
  { name: 'saturation', label: 'Color intensity' },
]

function formatValue(name: LiquidSettingName, value: number): string {
  if (name === 'opacity') return `${Math.round(value * 100)}%`
  if (name === 'lightness') return `+${Math.round(value * 100)}%`
  return `${value.toFixed(2)}×`
}

export default function LiquidControls() {
  const settings = useLiquidSettings()
  const id = useId()

  return <details className="liquid-controls">
    <summary>Liquid controls <span>{formatValue('opacity', settings.opacity)} opacity · {formatValue('flow', settings.flow)} flow</span></summary>
    <div className="liquid-controls__sliders">
      {CONTROLS.map(({ name, label }) => <label className="liquid-controls__control" key={name} htmlFor={`${id}-${name}`}>
        <span>{label}<output htmlFor={`${id}-${name}`}>{formatValue(name, settings[name])}</output></span>
        <input id={`${id}-${name}`} type="range" {...LIQUID_SETTING_LIMITS[name]} value={settings[name]}
          aria-valuetext={formatValue(name, settings[name])} onChange={event => settings.setSetting(name, Number(event.target.value))} />
      </label>)}
    </div>
    <div className="liquid-controls__footer">
      <p>Brightness raises perceptual lightness, and color intensity controls pigment chroma. These display controls keep the analyzed colors and hue relationship intact. Motion follows live loudness, attacks, and frequency balance every frame.</p>
      <button type="button" onClick={settings.reset}>Reset liquid</button>
    </div>
  </details>
}
