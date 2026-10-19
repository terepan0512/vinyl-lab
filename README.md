# Vinyl Lab

A React/Three.js liquid record driven by uploaded audio, with local Python/librosa
feature extraction and precomputed music-to-color trajectories.

## Run locally

Dependencies are already installed in this workspace. Start both services:

```sh
npm run analysis
```

In another terminal:

```sh
npm run dev
```

Open the Vite URL, drop an MP3/WAV onto the page, wait for analysis, and press
Space to play. Compare A and C in the color panel; teach B your own colors with
the annotation and training controls. Each available model has a fixed song
identity, acoustic sections, and a seekable three-color trajectory. A shared
composition layer assigns Main, Accent, and Counterpoint
pigments with an audio-conditioned analogous, split-complementary, or triadic
relationship. Annotations and trained B models can be exported and imported as JSON.
Open "Liquid controls" to adjust Opacity, Flow, Relief, Brightness, and Color intensity; "Reset
liquid" restores their defaults. These controls change the rendered surface
without recomputing the music palette.

For a fresh checkout, use Python 3.11+ (tested here with Python 3.14):

```sh
npm ci
python3 -m venv .venv
.venv/bin/python -m pip install -r analysis/requirements.txt
```

`analysis/requirements.lock.txt` records the exact environment used for validation.
The service binds only to `127.0.0.1:8787`; Vite proxies `/api/analyze` and
`/api/train-color` to it. Restart the analysis service after updating its Python
code. Audio and training annotations are sent to this local process and are not
saved by the service or uploaded to an external provider. MP3/WAV uploads are
limited to 128 MB; training requests to 4 MB and 2,000 annotations.

## Three color models

Python/librosa measures MFCC, spectral centroid, RMS, spectral flatness, chroma
and onset strength, with a global tempo estimate when enough beats exist.

| Model | Method | Availability |
| --- | --- | --- |
| A (`rule-based-v7`) | Reference-calibrated timbre plus pitch salience preserved before averaging, rhythmic patterns, directed chroma changes, and timbral continuity | Immediately after analysis |
| B (`personal-ridge-v1`) | NumPy ridge regression from your annotations to Oklab; identity and time colors are trained separately | At least 6 distinct works per trained scope |
| C (`fusion-v3`) | A separate spectral-envelope/chord-template predictor with the same explicit track-context layer | Immediately after analysis |

Six works is an implementation threshold, not evidence of sufficient training
data. B uses grouped five-fold validation, training-fold-only scaling, and equal
weight per work. It learns Main only; its other two pigments come from the shared
composition rules. With identity labels only, its trajectory stays constant;
with time labels only, its fixed identity is the mean of its time predictions.
B remains unavailable until a compatible trained model exists; it never presents
A as a personal result.

These three models are separate from the **three palette roles** (Main, Accent,
Counterpoint) and **three temporal layers** (identity, sections, trajectory). The
versioned `palette-relations-v4` design layer selects one relationship per track
from measured rhythmic activity, harmonic change, dynamics, and noisiness. It
checks pairwise Oklab separation both for gamut-mapped swatches and a conservative
approximation of the default transparent resin appearance. Wider hue spacing and
lightness/chroma candidate searches account for the contrast lost over pale backing.
These are design thresholds, not accessibility contrast requirements or guaranteed
GPU pixel differences. Reflection is a separate material effect rather than the
third pigment.

A's reference is generated offline from a balanced set of pure, harmonic,
filtered-noise, and percussive signals. Its two PCA axes retain 47.94% of that
reference's standardized MFCC variance; they were not trained on real songs,
uploaded files, or human color labels. This remains a static timbre component.
A/C now preserve salient pitch observations in each window before combining the
track; they also retain rhythmic recurrence, directed pitch-class transitions,
and relative timbral dynamics. `harmony-anchor-v2` and `temporal-structure-v2`
describe these explicit rules. Supported harmony anchors hue, with timbre as a fallback
and modifier. Pigment strength is computed separately so opposing acoustic directions
do not routinely cancel into gray. Temporal patterns make bounded angle, chroma,
and lightness adjustments instead of adding a common blue offset. These are visual
design choices; A and C can agree when harmony dominates. B's trained predictor is unchanged.

The four reported SoundCloud downloads were reproduced locally: A-v5 mapped them
to nearly identical peach/brown colors because the two PCA axes discarded most
of their measured differences. This was a mapping failure, not a download-source
cache. A-v6 then separated hues but retained a muted appearance. Current A-v7
core colors are purple `#a780f4`, cyan `#00b8d9`, green `#00c996`, and yellow
`#bfac00`. Full browser uploads agree with the independent color calculation.
The revised rules distinguish these recordings and controlled same-synth
sequences; similar acoustic patterns can still receive similar colors. Filenames,
hashes, and download sources never choose colors. These checks are not a human
perception study or a guarantee of unique color fingerprints.

Stale A/C results are recalculated from retained features. **Recalculate Colors**
also refreshes them explicitly without uploading the file again. A palette-only
B migration reuses the same trained artifact and preserves its Main prediction.

Colors, including A's frozen reference projection, and their relationship are
precomputed before play; PCA does not run in the render loop. The three color values
vary together gently along the trajectory while retaining that relationship.
A and C are design hypotheses, B learns the supplied Main-color preferences,
and none has been validated as a universal synesthesia model. Emotion is
unestimated; no audio embedding or pretrained emotion model is used.

The surface samples live FFT bands, spectral changes, RMS attacks, and a spectral
centroid proxy every render frame. These drive independent transport, swirl, and
stretch channels for procedural 2D marbling with inertia. The Flow control scales
the response; precomputed color sections do not step or gate the motion. Quiet
audio receives a compressive display response, and motion decays after silence.
These are acoustic proxies, not recognized instruments or a physical fluid solver.

The three pigment pools start with equal area targets. Live changes in relative
bass/mid/treble, spectral brightness, and attacks redistribute their target shares
between 22% and 48%; Main is not permanently the largest pool. A six-second
relative baseline limits persistent mastering bias. Pause and silence hold the
allocation, while seeking or loading a new file restores thirds. A small CPU
sample of the current spatial field recalibrates its distribution at most ten
times per second, avoiding the old fixed thresholds that could leave Main
covering much more than its nominal share. These are approximate surface-area
targets, not liquid volumes or exact rendered-pixel percentages. The predicted
Color Identity and palette hues are unchanged by this redistribution.

The default pigment opacity is 82%, with local thickness variation over pale
resin backing. **Brightness** lifts perceptual Oklab lightness by 0.06 and
**Color intensity** requests 1.35 times the pigment chroma before gamut mapping.
This replaces the earlier white-mixing lift, which made colors paler. The three
exported music colors remain unchanged. The composition check approximates these
defaults; custom appearance settings and the display gamut can reduce separation.
Unversioned saved opacity at the previous 68% default migrates to 82%; other
custom settings remain. Current settings include an appearance-version marker.

Rendering now caches static shadows, limits the moving deck shadow to 12 updates
per second, and reuses a small spatial-noise texture. A lighter surface mesh and
shared shader calculations reduce duplicated work. Resolution starts at a device
pixel ratio of at most 1.5 and adjusts slowly between 0.75 and that device's cap
when sustained frame times indicate pressure or headroom. Audio sampling and
liquid motion continue every render frame; these adjustments do not change the
music analysis or palette. Browser checks now cover six synthetic WAV uploads,
the revised palettes, UI/material agreement, and default surface screenshots.
Real-audio browser playback also verifies changing pigment shares and flow, pause
stability, and 20 GPU area checks. Actual frame rates and live-flow appearance
across devices still need review.

[Algorithm, measurements and limitations](docs/audio-liquid.md)

[Personalized model and perception-study protocol](docs/color-study.md)

## Checks

```sh
npm test
npm run test:analysis
npm run build
```

`npm run lint` also checks existing scene files, some of which have pre-existing
React hook immutability errors. New analysis/color modules can be checked with:

```sh
npx eslint src/audio/*.ts src/state/playerStore.ts src/scene/liquid/*.ts* src/ui/ColorJourney.tsx tests/*.test.mjs
```

For hosting, run an analysis service and configure the same-origin
`/api/analyze` and `/api/train-color` routes: static `dist` files alone do not
provide Python analysis. `npm run preview` previews the static production bundle
and does not proxy requests to the analysis service.
