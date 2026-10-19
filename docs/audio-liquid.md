# Audio, Three Color Models, and Liquid Visuals

## Three different sets of three

| Concept | Contents | Meaning in the interface |
| --- | --- | --- |
| Three models | A Rule-based, B Personalized, C Feature Fusion | Compare three mapping methods on the same music |
| Three color roles | Main, Accent, Counterpoint | Three pigments mixed into the liquid at the current time, rather than one color from each model |
| Three time layers | Global Color Identity, section palettes, continuous trajectory | A fixed identity, section summaries, and colors that follow the music timeline |

Each available model predicts its own Main color. A separate, shared design layer composes
Accent and Counterpoint using an audio-conditioned color relationship. A restrained track may
use analogous hues; other tracks may use split complements or a triad. These are three pigment
roles, not the physical RGB primaries. Reflected white light is a separate material effect.
The scheme is a design rule, not a claim that the recording contains a naturally correct palette.

## Usage and data flow

1. Import an MP3/WAV file. The frontend sends the audio to the local Python service at `127.0.0.1:8787`.
2. Python/librosa measures the entire audio file and reports progress for the actual processing stages.
3. A browser Worker precomputes A and C. If a compatible personalized model is available, it also computes B.
4. Play the track when the results are ready. Switch between A/B/C to compare their Color Identity, three-color trajectory, and liquid visuals.
5. Save personal labels under "Teach Model B Your Colors," then train and apply B. Without a trained model, B is shown as untrained.

Results retain `featureBackend`, `extractorVersion`, `parameters`, model versions, and raw measurements.
`sourceId` is the SHA-256 hash of the original audio bytes; renaming the same file does not change it.
The same environment, input, and model produce reproducible colors. Switching tracks cancels the
client request and old Worker, so an old result cannot overwrite the new track.
`modelRevision` combines the A/C rule version or B training time with `palette-relations-v4`.
This preserves both core-predictor and palette-design provenance, and keeps predictions from
different B training runs separate. The track container uses `music-color-models-v2`; the core
A predictor is now `rule-based-v7`. B remains `personal-ridge-v1`; C is `fusion-v3`.
B's learned predictor is unchanged; all derived palettes use the shared design layer.

The audio endpoint is `POST /api/analyze`, with a 128 MB limit. Personalized training uses
`POST /api/train-color`, with a 4 MB request limit and at most 2,000 labels. The service listens
only on the local machine and does not save audio, labels, or models. Labels and Model B are
stored in the current browser and can be imported or exported separately as JSON. Restart
`npm run analysis` after updating the Python code. Vite proxies both endpoints; static hosting
still requires a configured analysis service.

## Measurements from Python/librosa

The implementation is `analysis/features.py`: librosa 0.11.0, 22050 Hz, a 2048-point Hann STFT,
and a 512-sample hop. If mixing channels causes substantial phase cancellation, the channel
with the most energy is used.

| Dimension | Measurements used | Meaning and limitations |
| --- | --- | --- |
| Timbre | 13 MFCCs, 40 Slaney Mel bands, orthonormal DCT-II; spectral flatness | Spectral envelope and noisiness, rather than instrument classification |
| Spectral brightness | Spectral centroid in Hz | Its relationship to visual lightness is a design rule |
| Loudness proxy | PCM RMS, 20 log10(RMS) | Neither LUFS nor a complete measure of perceived loudness |
| Rhythm | Log-Mel onset strength, global tempo from `beat_track` | BPM may have half-time or double-time errors |
| Harmony | 12 pitch-class chroma, L1 normalization, fixed A440 tuning | Does not provide precise key or melody recognition |
| Emotion | Not estimated | `emotion.status = not-estimated` |

Measurements are summarized every 0.25 seconds. RMS uses the root mean square; spectral centroid,
flatness, MFCCs, and chroma are energy-weighted. Onset strength uses the interval maximum. Tempo
comes from the original onset sequence: BPM is returned only with at least three onsets and three
tracked beats; otherwise it is null. No audio embeddings or pretrained emotion model are used.

Official definitions: [MFCC](https://librosa.org/doc/0.11.0/generated/librosa.feature.mfcc.html),
[spectral centroid](https://librosa.org/doc/0.11.0/generated/librosa.feature.spectral_centroid.html),
[chroma](https://librosa.org/doc/0.11.0/generated/librosa.feature.chroma_stft.html),
[onset strength](https://librosa.org/doc/0.11.0/generated/librosa.onset.onset_strength.html),
[beat tracking](https://librosa.org/doc/0.11.0/generated/librosa.beat.beat_track.html).

## Model A: interpretable rules, rule-based-v7

The implementation is `src/audio/musicColorAnalysis.ts`, `timbreProjection.ts`, and
the frozen `timbreReference.json` reference. The following static component is retained from
v5; the complete track identity also uses the sequence context described below.

- Exclude MFCC0, which mainly reflects level. Use all twelve MFCC1–12 shape coefficients,
  subtract frozen reference means, and divide by conservative per-coefficient scales.
  The scale floor is the larger of 8 MFCC units and 25% of the median reference standard
  deviation; coefficients with little variation cannot receive arbitrarily large weight.
- Project the standardized vector onto two frozen PCA components, with each component's
  largest absolute coefficient given a positive sign. Divide each axis by its reference
  standard deviation, floored at 0.5. The two axes retain **47.94%** of standardized variance
  in the synthetic reference. They do not retain every timbre distinction.
- Bound the projected vector continuously with `(x, y) / sqrt(1 + x² + y²)`. Its length is
  retained as timbre strength. This avoids turning arbitrarily small residuals near the
  reference center into fully saturated colors. The PCA axes become visual color axes by
  design, without a fixed hue offset or a human-trained color target.
- Remove the uniform twelve-pitch-class floor from chroma and form a harmonic direction along
  the circle of fifths, offset by 265°. The energy above that floor and the directional
  concentration determine the harmony weight, capped at 25% rather than v4's 65%, so common
  harmonic evidence does not overwhelm different timbres. Weak harmonic evidence receives
  still less weight; this does not claim to identify a musical mode.
- **Spectral flatness only adjusts chroma; it no longer pulls timbre toward a fixed 190° teal.**
  More noise can reduce chroma, while MFCCs and chroma features determine the color direction.
- Normalize RMS over approximately −60 to −6 dBFS and spectral centroid logarithmically over
  120–5000 Hz. Lightness is `L = 0.36 + 0.28 × level + 0.09 × brightness`;
  neither feature directly rotates the hue.
- Combine bounded timbre and harmonic evidence directly as Cartesian coordinates, then set
  `a = combinedX × chromaScale` and `b = combinedY × chromaScale`, where
  `chromaScale = 0.25 × (1 − 0.3 × noiseWeight)`. There is no minimum color-chroma floor:
  uncertain or opposing evidence can stay near neutral. An entirely silent track has a
  neutral gray Color Identity.

`analysis/timbre_reference.py` creates the engineering reference offline: four equally weighted
spectrum families (pure, harmonic, filtered noise, percussive), eight frequency positions from
approximately 65 to 2489 Hz, and three envelopes yield 96 short signals. It measures each with
the actual Python upload extractor, including the same 40 Slaney Mel bands and orthonormal DCT-II.
No uploaded files, real-music corpus, existing six color fixtures, or human color labels enter
the fit. The browser loads only the frozen means, scales, two components, and axis standard deviations;
projection and color calculation happen during precomputation, not every animation frame.
Synthetic PCA standardization is not a trained perceptual music-to-color model.

The timbre/harmony summary for the global Color Identity averages over active sound duration:
frames below 2.5% of peak RMS or in absolute silence are excluded. RMS is still calculated
separately as a root mean square, preventing loud sections from completely dominating the track's
identity. Local windows remain energy-weighted. `identityMapping` exports the timbre direction,
strength and reference version, plus harmony direction and weights for inspection.

The local Main target starts with the current rule prediction, then the shared palette layer
limits its movement around the fixed Color Identity. It moves all three pigments together,
rather than building the third pigment by bleaching Main toward white.
Tracks with similar timbre or harmony can still receive similar colors. A whole-track mean loses
event order and can hide different section structures even when the local trajectory differs.
PCA further discards some spectral information. The current rules have not been calibrated
against a real pop-music collection or human labels; the synthetic reference does not establish
a desired real-song color distribution.

Filenames, download-site names, and file hashes do not enter A's color prediction. The reported
four SoundCloud downloads were found locally and analyzed in full. A-v5 produced `#c48773`,
`#cd8976`, `#cf8a7a`, and `#d18a7f`: the complaint was reproduced. The synthetic reference's two
PCA axes retained only about 8–42% of those pairwise standardized MFCC differences. Neither
meaningful gamut clipping nor a shared download-source key caused that collapse.

The earlier A-v6 correction produced these intermediate core colors:

| Recording | A-v5 | A-v6 |
| --- | --- | --- |
| blu3 | `#c48773` | `#a789d3` |
| Spinnin | `#cd8976` | `#8aa8c9` |
| Fatigue, BUDA — Dancing | `#cf8a7a` | `#bea59f` |
| FATIGUE, Soloman Lo — I Wouldn't Do That | `#d18a7f` | `#d79c61` |

That correction changed minimum pairwise displayed Oklab distance from about 0.0065 to 0.0791.
This demonstrates separation for the reported recordings, not a universal perceptual threshold.
Original audio and full extracted user-track features remain outside repository fixtures and
were not added to training or the frozen synthetic reference.

### Shared track context: harmony-anchor-v2 / temporal-structure-v2

A-v6/C-v2 still muted confident pitch evidence by summing unrelated hue vectors.
Opposing directions could cancel into gray; the sequence y coordinate also supplied
an often shared blue offset. A-v7/C-v3 separate the hue direction from pigment strength.

| Recording | Current A-v7 | Current C-v3 |
| --- | --- | --- |
| blu3 | `#a780f4` | `#a473ee` |
| Spinnin | `#00b8d9` | `#00acde` |
| Fatigue, BUDA — Dancing | `#00c996` | `#00bca5` |
| FATIGUE, Soloman Lo — I Wouldn't Do That | `#bfac00` | `#bca100` |

Minimum pairwise displayed Oklab distance is about 0.1229 for A and 0.1089 for C
on these four recordings. These are development checks, not human perception scores.
The same original recordings were uploaded through the browser and matched these
independently computed results. The mapping does not recognize song identity,
lyrics, cultural associations, or flag colors, and does not promise unique palettes.

1. In each audible window, remove the uniform chroma floor and square positive excess.
   Normalize that local profile and weight it by its original excess mass and
   `1 - sqrt(flatness)`. Combine windows before taking a track harmonic direction.
   Nearly uniform observations contribute vanishingly little.
2. Retain salience `S = clamp(meanExcess / 0.18)`, directional coherence `Q`, and
   reliability `R = sum(excessMass * (1 - sqrt(flatness))) / sum(excessMass)`.
   Reliability preserves absolute noise attenuation that directional normalization
   would otherwise cancel. Track harmony weight is `w = 0.85 * S * R * clamp(Q / 0.65)`.
3. Form the hue carrier `v = (1 - w) * staticAB + 0.20 * w * unitHarmony`.
   Separately retain chroma mass `M = (1 - w) * staticChroma + 0.20 * w`.
   An ambiguity gate `min(1, length(v) / max(1e-12, 0.1 * M))` keeps an almost
   exactly opposing carrier continuous through neutral. Otherwise supported
   evidence retains its pigment intensity rather than routinely becoming gray.
4. Temporal descriptors still measure detrended rhythmic recurrence, pitch-class
   transitions, contour, and timbral modulation. Hue rotates by
   `24 * temporalStrength * coordinate.x + harmonyStrength * (32 * direction + 12 * contour)`
   degrees. Chroma is multiplied by
   `1 + 0.2 * harmonyStrength * stepContrast + 0.1 * timbreStrength * timbrePulseContrast`.
   The former Cartesian sequence y offset is not added to the color.
5. Lightness remains the static value plus `0.055 * temporalStrength * pulseContrast`
   and `0.04 * timbreStrength * (2 * continuity - 1)`, bounded to 0–1.
   Silence bypasses this layer. Chroma and hue convert through the existing sRGB
   gamut mapping. All coefficients are explicit visual design choices, and
   strengths are engineering measures rather than calibrated probabilities.

A and C retain different static predictors but share this harmony anchor, so they
may agree when harmonic evidence is strong. B's trained Main prediction bypasses
the layer. No cohort-dependent repulsion or minimum distance between different
songs is imposed. Per-song pigment relationships are checked separately below.

`identityMapping.trackContext` exports all contributions and the original static prediction.
The existing 250 ms features are sufficient; Python's original measurements and B's 28-feature
input remain unchanged. Harmonic/percussive separation and harmonic CQT were investigated on
the four files but are not required or enabled in the production extractor. All context work
runs once during color precomputation. It never hashes filenames or repels uploaded tracks.

The fixed synthetic reference was not fitted to the four songs. Independent controls use one
synth/production chain, reordered identical note multisets, gain changes, and static low-pass
processing. They check sequence sensitivity and limited mastering tolerance. These features
remain coarse: they do not transcribe the lead melody or ensure every different song receives
a distant color. The three temporal layers and stable playback trajectory remain unchanged.

Stale A/C model revisions automatically rebuild from retained features. **Recalculate Colors**
performs the same deterministic calculation explicitly without a new upload or extraction.
B keeps its learned predictor; a palette migration can reuse the same artifact to recompose
its designed accents while preserving its Main prediction.

## Model B: regression from personal labels, personal-ridge-v1

Training is implemented in `analysis/personal_model.py`, with browser prediction in
`src/audio/personalColorModel.ts`. It actually fits the user's saved color labels; A's predictions
are not used as training targets.

The input is the 28-dimensional `acoustic-v1` representation: logarithms of RMS, spectral centroid,
and flatness; log1p of onset strength; MFCC1–12/100; and normalized chroma12. MFCC0, filenames,
sourceId, and timestamps are excluded. The target is the human-selected color converted to Oklab
`L,a,b`. It learns one Main color at a time. Accent and Counterpoint come from the shared
palette-design layer, rather than from additional learned outputs; it does not claim to train
three separate color-output models.

Color Identity (`identity`) and colors at a given time (`time`) are trained separately. Each scope
requires at least six work groups before training starts. This is the current implementation
threshold, not scientific evidence that six tracks are enough to learn a person's perceptions.

| Trained scopes | Fixed Color Identity | Local three-color palette |
| --- | --- | --- |
| `identity` and `time` | Identity regression prediction | Time regression prediction and derived colors |
| `identity` only | Identity regression prediction | The same fixed Main color and derived colors; the trajectory is constant |
| `time` only | Duration-weighted average of time predictions over active sound frames | Time regression prediction and derived colors |
| Neither | No personalized result | B is unavailable; A is not substituted as a personal prediction |

NumPy implements weighted Ridge regression with an intercept and fixed `alpha=10`. Each work has
equal total weight. Five-fold validation holds out entire work groups; feature means, scales,
intercepts, and regression coefficients use only that fold's training works. The comparison is
the training fold's weighted mean-color baseline. The interface shows the held-out Oklab distance
of **unsmoothed regression predictions**, not a validation score for the final smoothed trajectory.
After validation, all labels are used to fit an exportable model. These steps are implemented
locally without calling scikit-learn.

The interface provides an annotation mode that hides the liquid and predicted colors, a Work ID,
and label/model import and export. Different encodings, edits, or remasters of the same work
should be assigned the same Work ID manually to prevent the work from leaking into validation.
Duplicate labels with the same `sourceId + scope + time` keep the latest revision; repeated edits
are not treated as additional independent samples. See [color-study.md](color-study.md) for usage
and the proposed perception study.

## Model C: interpretable feature fusion, fusion-v3

The implementation is `src/audio/fusionColorModel.ts`. C is an **untrained, hand-written fusion
method**. It does not reuse A's MFCC projection with a simple hue offset, and uses neither a large
audio/text model nor emotion recognition.

1. Use MFCC1–12 and the orthonormal DCT-II basis for a truncated inverse DCT over 40 Mel bands,
   reconstructing a centered, smooth log-Mel envelope. This is not a complete reconstruction of
   the original spectrum. MFCC0 is excluded so recording gain does not change the timbre direction.
2. Compare low/high-band means to form the Oklab a axis, and compare the middle bands with the
   outer bands to form the b axis, normalizing by the envelope RMS. Assigning frequency bands to
   color axes is a visual convention defined by this model.
3. Compare chroma with 24 major/minor triad templates across 12 roots. Root, third, and fifth have
   weights `1, 0.8, 0.9`. Centered cosine correlation, pitch-class concentration, and the score gap
   between neighboring root candidates jointly determine confidence. These are harmonic-evidence
   templates, not a complete key detector. Roots map along the circle of fifths, and harmony
   contributes at most 60%.
4. Fuse the two coordinate sets. Weak or opposing evidence may produce low chroma. Flatness only
   lowers saturation; there is no fixed hue anchor.
5. Measured onsets and available BPM adjust lightness and chroma without changing the core hue.
   Without onsets, BPM alone does not invent pulsation.

The local Main target starts with the current fusion prediction, then the shared palette layer
limits its movement around the fixed Color Identity. It derives the other pigments and controls
their motion together. C retains its spectral and harmonic static predictor and now adds the
shared salient-harmony and temporal track context before composing a fixed identity.
These coefficients are design hypotheses to validate, rather than the single correct
relationship between music and color.

## Shared pigment relationships: palette-relations-v4

The implementation is `src/audio/paletteRelationships.ts`. Earlier palettes often looked like
three shades of one color because Accent stayed near Main, while Highlight was a lighter,
less saturated version of Main. The composition layer now treats all three slots as pigments.
It leaves the supplied Main color intact and adds an explicit, separately versioned aesthetic
decision about the other two colors. A/C's separate sequence-context update changes their Main results;
B and C retain their existing core prediction methods.

The scheme is selected once from the entire recording's active audio frames. Harmonic change
uses changes in normalized chroma profiles; rhythmic activity uses variation in measured onset
strength with the available tempo; dynamics uses RMS variation. Spectral flatness contributes
to the contrast score, without acting as a fixed hue attractor.

The normalized scores use explicit heuristics. `harmonicChange` is three times the mean
adjacent chroma cosine distance, clamped to 0–1. `rhythmicActivity` is the mean absolute onset
change divided by twice mean onset strength, clamped and multiplied by a tempo factor.
`dynamics` is three times the standard deviation of peak-normalized RMS, clamped to 0–1.
The combination is `activity = 0.6 × rhythmicActivity + 0.25 × harmonicChange + 0.15 × dynamics`.
The contrast score is `0.16 + 0.62 × activity + 0.12 × harmonicChange + 0.1 × noiseRatio`,
clamped to 0–1. Absolute recording gain does not choose the scheme for audible input.

| Relationship | Hue offsets from Main | Selection rule |
| --- | --- | --- |
| Analogous | 0°, +50°, −50° | Activity below 0.2, contrast below 0.3, and noise ratio below 0.18 |
| Split-complementary | 0°, +140°, +220° | The default for other active arrangements |
| Triadic | 0°, +120°, +240° | Activity at least 0.52, or harmonic change at least 0.6 |

These thresholds and offsets are composition choices. They do not recognize emotion or prove
that a given musical passage needs complementary colors. No random colors, file-name hashes,
or record-rotation values choose the relationship. The plan records `scheme`, `silent`,
`contrast`, `activity`, `harmonicChange`, `rhythmicActivity`, `noiseRatio`, `referenceHue`,
`hueOffsets`, `minimumDistance`, and `minimumSurfaceDistance`. If Main is nearly gray, measured
harmony or MFCC contrasts provide a reference hue for its accents; the learned Main itself remains gray.

For each relationship, the composer searches lightness/chroma candidates for Accent and
Counterpoint while retaining their intended hue offsets. It checks the minimum of all three
pairwise Oklab distances **after sRGB gamut mapping and 8-bit display conversion**. The swatch
target minimum is 0.14 for analogous palettes and 0.17 for split complements or triads.

A second check approximates contrast loss on the default resin surface. It applies the default
base opacity 0.82 at minimum thickness 0.78, perceptual lightness lift 0.06, color intensity 1.35,
and maximum white reflection 0.035, then composites over the pale `#d9dfe8` backing in linear RGB.
Perceptual lightness/chroma changes happen before sRGB gamut conversion. The corresponding minimum
Oklab distance targets are 0.060 for analogous palettes and 0.075 for split complements or triads.
This is a conservative composition approximation, not a prediction of GPU pixels: edge masking,
the backing's own transparency, lighting, and the actual material field can change appearance.
Changing Opacity, Brightness, or Color intensity does not recompute the audio palette and can reduce visible separation;
these thresholds are not guaranteed for custom material settings.

Candidates must satisfy both checks. If a candidate cannot achieve both targets, the best
available separation is reported rather than claimed to pass. Diagnostics include actual
`minimumDistance`, `targetDistance`, `surfaceMinimumDistance`, `surfaceTargetDistance`,
`meetsTarget`, and `gamutLimited`. A gamut-limited palette can still meet the distance targets.

These distances are aesthetic separation heuristics, not WCAG contrast ratios or a validated
human discrimination threshold. Silence has neutral Accent and Counterpoint colors and no
chromatic separation target; the core predictor's Main color is retained.
Palette quality still requires human evaluation; this update does not make the three pigments
independent predictions learned from music.

## Three time layers and color space

The Color Identity is stored in `identity`, the selected model's whole-track three-color palette
in `identityPalette`, and each time point's three colors in `trajectory[].palette`. Playing,
pausing, and rotating do not recalculate the Color Identity.

Acoustic segmentation compares chroma, MFCCs, spectral centroid, and RMS on either side of a
boundary. It uses local novelty peaks with a median/MAD threshold, limits boundary spacing and
the total number of sections, and labels them "Section 01…". It does not claim to recognize
verses, choruses, or intros. Each section selects up to five representative colors from the
actual trajectory; an approximately constant section may have just one.

Color targets are calculated every 0.25 seconds. Onsets and rhythm determine smoothing speed,
with a limit on the Oklab distance between neighboring Main-color targets. Main's changes from
the fixed Color Identity are attenuated by 0.3 for hue and 0.45 for lightness/chroma, then limited
to ±8° hue, ±0.045 lightness, and ±0.018 chroma. The three pigments then receive the same Oklab
translation, preserving their pre-gamut pairwise differences. The hue offsets in the composition
table are initial design targets, rather than exact angular constraints throughout playback.
Shared color translation is attenuated when needed to retain swatch and approximate default-surface
separation. The selected relationship does not switch with each beat. Playback interpolates this
color translation between precomputed points using current audio time, making colors reproducible
at the same time and preventing drift while paused.
Oklab colors are mapped into linear sRGB gamut by reducing chroma. The interface, exports, and
Three.js use the same conversion.
[Oklab's original explanation](https://bottosson.github.io/posts/oklab/).

## Keeping the rendered record close to the palette

The UI swatches and liquid uniforms share the same Oklab-to-linear-sRGB conversion.
The liquid material has `toneMapped={false}` and still applies the sRGB output conversion,
so the scene's exposure and ACES tone mapping do not remap these display-referred colors.

The spatial field gives Main, Accent, and Counterpoint separate broad pools with soft
boundaries. Each pool can use its full input pigment before appearance adjustments; the former
65% Accent and 28% Highlight blend caps are removed. The composition now starts with equal
one-third area targets, replacing the fixed 55% Main / 30% Accent / 15% Counterpoint allocation.
Live audio changes move each target within 22–48%; Main is a palette role, not a guarantee of
the largest pool. Target shares describe approximate surface areas, not physical pigment volumes
or exact final pixel ratios. Soft boundaries, transparency, camera projection, and reflections
affect visible coverage. The live allocation and its spatial calibration are described below.
Reflections mix toward white by at most 3.5%. The separate rim retains a clear resin edge, and
the former additive blue sheen has been removed. A pale, unlit resin backing (`#d9dfe8`, 72%
opacity) supports the pigment above the dark deck. It does not illuminate or recolor the saved
palette; it contributes to the final appearance through alpha compositing.

The pigment layer's default base opacity is 82%, increased from 68% to reduce dilution by the pale backing. Its final alpha
is the edge mask multiplied by base opacity and local thickness. Thickness is clamped to
0.78–1.0 and varies with the spatial field and live bass/treble proportions. Thin areas therefore
transmit more backing. A separate Brightness control raises Oklab lightness by up to 0.14 in the displayed
pigment before bounded reflections, with a default of +0.06. Color intensity independently
requests 1.35 times the chroma at its default. This replaces the earlier white-mixing lift,
which reduced saturation. Gamut mapping bounds displayable colors; Core Identity and exported
palettes remain unchanged by these appearance settings. Counterpoint remains a pigment.

## Liquid appearance controls

The interface's "Liquid controls" panel adjusts `src/state/liquidSettings.ts` values:

| Control | Default | Range | Effect |
| --- | --- | --- | --- |
| Opacity | 82% | 25–100% | Base pigment opacity before local thickness and edge masking |
| Flow | 1.25× | 0.25–2.5× | Multiplies the live audio-driven displacement integrals |
| Relief | 1.00× | 0–2× | Scales the surface height and resulting normal variation |
| Brightness | +0.06 L | +0–0.14 L | Perceptual lightness lift before gamut mapping, separate from palette prediction |
| Color intensity | 1.35× | 0.5–2× | Scales requested pigment chroma while preserving hue before gamut mapping |

"Reset liquid" restores the defaults. An unversioned saved opacity equal to the old 68%
default migrates to 82%; other saved values are preserved. Current preferences include
`appearanceVersion: 2`, so an intentional 68% value stays unchanged on later reloads.
Settings are bounded and retained in browser localStorage
when available. They affect the live surface without changing A/B/C, the palette relationship,
saved annotations, or exported colors. Transparency, backing, soft pigment boundaries, and
reflections mean final rendered pixels can differ from an individual flat swatch.

Current headless Chrome checks upload six synthetic WAVs through the real local analysis service,
switch between A/B/C, and compare the three sampled colors with the shader uniforms. Default
surface screenshots for piano-like notes, a sustained chord, and percussion were inspected:
the three pigment regions remain visibly distinct. A subsequent real-audio playback check confirms
changing live allocations, field quantiles, and flow; all three settle and freeze after pause.
Current A-v7/C-v3 browser checks also upload the four actual local MP3s in full,
verify identities against independent calculations, confirm appearance settings reach
the shader, and check that stale and explicit recalculation need no new upload.
The English panel fits at 320 and 390 pixels; no runtime or shader errors were observed.
This does not establish live-flow quality across devices, measured frame rates, or perceptual validity.

## From radial ripples to viscous two-dimensional color flow

The old version repeated signed PCM by radius and delayed RMS history radially. Every angle
therefore had the same height, naturally producing concentric ripples. During playback or
rotation, this looked more like propagating waves than slowly mixing liquid.

`src/audio/AudioFeatures.ts` samples the existing Web Audio analyser every render frame, separately
from Python's precomputed color features. It measures bass (20–250 Hz), mid (250–2000 Hz), and
treble (2000–8000 Hz) bands, waveform RMS, positive spectral flux, and RMS attack. Byte FFT bins
are converted from logarithmic dB values to magnitudes before measuring the centroid, flatness,
and flux. The 256 possible byte-to-magnitude, power, and log-power conversions are cached,
along with frequency-band boundaries, and refreshed when the analyser configuration changes.
A logarithmically normalized spectral centroid is used as a timbre-brightness proxy.
The onset signal combines positive flux and RMS attack, so a new spectral event can affect the
motion even when overall RMS stays steady. These measurements do not classify an instrument,
recover a melody, or estimate emotion.

`ViscousMotion.ts` compresses the RMS response for audible input above its silence threshold,
making quiet passages visible without supplying motion to silence. Relative band proportions,
the onset envelope, and the timbre proxy receive damped attack/release responses. The integrated
envelopes drive independent `flowX`, `flowY`, `swirl`, and `stretch` channels: bass contributes to
broad transport, mids to ribbons and strain, and treble/onsets to smaller folds. These are explicit
visual mappings from acoustic proxies, rather than recognized instruments physically moving resin.
Sustained audio continues to transport the field; motion decays after silence. The user's Flow
setting scales these integrals. Acoustic section boundaries, stored `motionSpeed`, and the
precomputed tempo do not drive or gate this live motion.

`PigmentBalance.ts` separately changes the three pool-area targets from live audio. It takes
square-root-compressed bass/mid/treble proportions relative to a six-second adaptive baseline.
Low-, mid-, and high-band changes favor Main, Accent, and Counterpoint respectively; changes
in the spectral-centroid proxy transfer share between Main and Counterpoint, while onset changes
favor Accent. These assignments are visual conventions, not recognized instruments. RMS gates
audible activity instead of favoring a color. A persistent bass-heavy spectrum therefore adapts
back toward balanced allocation rather than giving Main a permanent majority.

The allocation response follows at 3.8 per second, with analytic integration of the baseline and
response over each captured input. Projection onto a bounded simplex keeps every target between
22% and 48% and their sum at one. Controlled passages produce the same allocation at 30/60/120 Hz.
Pause and silence freeze both allocation and its baseline; they do not start a timer-driven color
cycle. Seeking, an emptied or ended audio element, and a new source reset the live state to thirds.
The stored Color Identity, three pigment colors, and precomputed color trajectory are unchanged.

`PigmentField.ts` estimates the current two-dimensional field distribution from 384 points placed
uniformly by area over the visible annulus. At most ten times per second during active or residual
motion, it evaluates the same quantized noise lattice and domain formulas as the shader and finds
seven interior quantiles. Two `vec4` uniforms carry these quantiles; the render loop follows them
with a 12-per-second exponential response while the field is moving. This replaces the historical
fixed field CDF, whose fit could drift as the field moved and let Main occupy much more than its
nominal share. The estimate uses no new texture fetches or GPU readbacks. Independent dense CPU
coverage tests place the checked allocations within 3.5 percentage points of their targets across
the tested flow states. A separate headless Chrome GPU check renders five flow states and four
allocations with identifiable test pigments: all 20 measurements stay within six percentage
points of each requested area. These controlled checks do not prove exact coverage throughout
a continuous performance or under every appearance setting.

`liquidSurface.glsl` combines these channels with irregular two-dimensional spatial fields,
differential rotation, strain, and domain warping. Neighboring regions read lightly averaged
actual RMS history at different ages, while small surface details retain measured PCM. The
delay follows the two-dimensional field; the waveform is not copied radially or emitted as
outward-moving wavefronts. Fragment normals recover slopes with screen-space derivatives from
one height evaluation, replacing five repeated height evaluations. Relief and pigment
calculations share one advected domain. The tiny signed-PCM detail is filtered at vertices
and interpolated across the surface, avoiding five PCM texture reads per fragment.

The texture structure is procedural, and the motion uses live audio with damping rather than
an independent elapsed-time animation clock. Color targets remain precomputed and are sampled
using playback time. Seeking resets live motion history, so the procedural shape is not a saved
or guaranteed identical image at each timestamp. Rotation does not affect color prediction,
and geometric flow does not alter the stored analysis. This is an audio-responsive visual with
explicit design choices, **not a fluid PDE solver** or a real liquid shape recovered from audio.

## Rendering budget and performance evidence

`src/scene/RenderPerformance.tsx` and `renderBudget.ts` adjust rendering resolution from
sustained frame timing. The initial device-pixel-ratio cap is 1.5, previously 2. After a
1.5-second warm-up, two-second windows averaging more than 25 ms per frame lower the ratio
by 0.25, down to 0.75. At least ten seconds of windows averaging below approximately 17.2 ms
allow a 0.25 recovery toward the device's cap. Changes have a three-second cooldown. Hidden
tabs, ongoing audio analysis, and deltas above 0.5 seconds do not contribute to the decision.
This reduces pixel work under sustained pressure; it does not promise a particular frame rate.

The four scene spotlights retain shadows with smaller maps: 512 × 512 for the wall and amp
lights, and 1024 × 1024 for the deck, replacing 1024/2048 sizes. Static maps are cached after
the first second of setup. The deck shadow refreshes at most 12 times per second during
playback and for three seconds after playback-status changes to capture tonearm settling.
Liquid motion, live audio sampling, and color lookup still run every render frame.

The liquid mesh now has 128 angular × 24 radial subdivisions, or 6,144 triangles, instead
of 192 × 48 subdivisions and 18,432 triangles. `noiseTexture.ts` bakes a deterministic
128 × 128 spatial field once. Bilinear texture lookup with cubic coordinate interpolation
replaces four sine hashes per noise evaluation. This texture describes spatial shape;
it neither chooses pigment colors nor supplies an animation clock. Shared domain evaluation,
screen-space slope recovery, and vertex-only PCM filtering further reduce repeated shader work.

In one controlled Node CPU benchmark, cached live-feature calculations took approximately
14.60 µs per sample versus 79.68 µs before the change. This comparison measures feature
processing with the same supplied analyser data, not Web Audio's internal FFT, GPU rendering,
or end-to-end browser frame time. Separate local measurements of color sampling and applying
three colors took approximately 4.5–14 µs per call across seven synthetic calibration payloads.
The current-field calibration took a median of approximately 0.259 ms per calibration in a local
Node CPU benchmark and runs at most ten times per second. This is CPU algorithm cost, not browser
frame time or a measured FPS improvement.
The rendering changes address known duplicated work. Current screenshots check default static
pigment appearance, but live-flow quality, shadow motion, adaptive resolution behavior on real
devices, and actual GPU/browser frame rates still require review.

## Regression checks and what they establish

- `npm test`: three models and time layers, determinism, time-based replay, gamut, A's frozen
  synthetic reference and continuous strength response without noise-driven hue attraction,
  C's envelope and harmonic evidence, B's browser prediction/import, pigment relationships,
  swatch and approximate default-surface separation, live audio features, settings bounds,
  audio-driven inertia, balanced and bounded live pigment allocation, pause/silence stability,
  refresh-rate consistency, adaptive field coverage, render-budget adaptation, and deterministic
  spatial-noise data.
- `npm run test:analysis`: synthetic WAV files decoded and measured through librosa; personal-model
  label validation, deduplication, grouped holdout, standardization within training folds, and
  matching Python/browser features.
- Current browser checks cover six synthetic WAV uploads through librosa, A/B/C selection,
  raw and approximate default-resin separation through sampled seek positions, synchronization
  of UI colors with shader uniforms, default surface screenshots, English text, and mobile
  layout at 320/390 pixels, with no runtime or shader errors. B uses a synthetic test artifact,
  not personal labels. Earlier checks also exercised training and import/export. These checks
  do not measure real-device frame rates or establish live-flow quality across devices.
- A real synthetic-percussion playback check records changing live weights, flow, and current-field
  quantiles, then confirms pause stability after settling. Separate GPU area measurements cover
  five flow states and balanced or contrasting allocations. Test-only primary pigments make those
  areas measurable; production colors still come from the selected model.
- A-v6/C-v2 browser checks upload all four reported user MP3s through the real local service and
  compare their identities with independent Node results. They verify that perceptual brightness
  and color intensity reach the shader, default and unlifted screenshots differ, stale/forced
  recalculation needs no new analysis request, English controls fit 320/390-pixel layouts, and
  no runtime or shader errors occur. This is a functional/rendering check, not perceptual validation.

The independent 48-profile synthetic holdout in `tests/fixtures/timbre-holdout.json` was excluded
from fitting the 96-profile reference. On one same-pitch 440 Hz harmonic-rolloff control, mapped
Oklab distance changes from 0.0183 to 0.0701; the piano/pad control changes from 0.0372 to 0.2121.
These demonstrate reduced compression in specific controls. Some other pairs become closer:
the same-root major/minor control changes from 0.1054 to 0.0562. New collisions remain possible;
the projection does not produce unique color fingerprints for every recording.

v2's spectral-centroid formula concentrated common spectral profiles around yellow. v3's 190°
noise anchor then concentrated high-flatness input around teal. v4 removed that anchor but its
uncentered six-coefficient projection and strong harmony contribution still compressed some
different synthetic inputs. v5 replaces that projection with the frozen twelve-coefficient
reference and preserves evidence strength without a saturation floor. Regression checks focus
on whether the rules artificially erase timbre differences, without forcing a uniform color
distribution. These are diagnoses using controlled synthetic inputs, not statistical conclusions
about a real pop-music collection.

Regenerate the independent synthetic reference and its engineering fixture with:

```sh
.venv/bin/python analysis/timbre_reference.py --profiles-output tests/fixtures/timbre-reference-profiles.json
```

The default output is `src/audio/timbreReference.json`. The generator checks finite projections
and gain invariance using eight gain-only controls. It reports the existing six color profiles
only after fitting, as held-out engineering examples. Those profiles never enter reference
means, scales, or PCA components. In the checked reference, the largest projected change under
a gain factor of 0.25 was approximately `1.06e-7`; this tests shape-coordinate gain invariance,
not full color invariance, because RMS intentionally also changes lightness.

Regenerate the synthetic calibration WAVs and measure them with:

```sh
.venv/bin/python analysis/color_calibration.py --wav-dir /private/tmp/vinyl-color-wavs
```

The default JSON output is `/private/tmp/vinyl-color-calibration.json`. Bass, decaying harmonic
notes, bells, bright chords, noisy percussion, harmonic pads, and the gain control are all
explicitly labeled as synthetic signals. Frozen measurement summaries are in
`tests/fixtures/color-profiles.json`. These are not human color labels for real songs, and do not
prove that real pop music has the desired color distribution. Program tests cannot replace a
human perception study; there is currently no mapping accuracy to report.
