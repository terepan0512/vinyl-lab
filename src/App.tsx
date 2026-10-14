
import VinylScene from './scene/VinylScene'
import CoverEditor from './scene/CoverEditor'

// All controls are integrated into the 3D scene, including the
// amplifier's playback knob, the Add Record button, and the progress bar.
// The VINYL LAB neon sign above the window is clickable to toggle its light.
// Press Space to play/pause, or drag and drop MP3/WAV files onto the page.
export default function App() {
  return (
    <main className="booth">
      {/* The title is displayed as a neon sign in the 3D scene.
          A visually hidden h1 is retained for screen reader accessibility. */}
      <h1
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
        }}
      >
        Vinyl Lab
      </h1>
      <div className="stage">
        <VinylScene />
      </div>
      <CoverEditor />
    </main>
  )
}
