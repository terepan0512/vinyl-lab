# Personalized Model B and a Music–Color Study

Model B supports actual training, browser prediction, and model import/export. It learns from
your saved color labels and is not a pretrained synesthesia model; without personal data, it
remains untrained. Model A is the rule-based baseline, and Model C is an independent, untrained
timbre/harmony/rhythm fusion baseline. All three can be compared on the same audio.

## Training B in the interface

1. Import music, complete the analysis, and expand "Teach Model B Your Colors."
2. Enable "Hide visuals and predicted colors while labeling to reduce bias" if possible,
   listen to the audio, and then choose a color.
3. Enter the same "Work ID (optional)" for different encodings, remasters, and edits of the same
   work. Without it, the audio-byte hash defines the group; the system cannot automatically
   identify two different files as the same work. Entering a Work ID updates this track's
   existing labels.
4. "Label Identity" records the whole-track active-frame summary and your chosen color.
   "Label Current Time" records the current 0.25-second measurement window and your color.
   These two label scopes are trained separately and do not count toward each other's threshold.
5. With at least six distinct work groups in a scope, click "Train / Update Model B."
   If only one scope qualifies, training produces a partial model.
6. Select B to view personal predictions. Labels and models each have JSON import/export;
   export them for backup or to move to a different browser.

Six works is only the program's current training threshold, not evidence of sufficient training
data. Many adjacent excerpts cannot replace more independent works. Collect labels across
timbres, styles, and sections, and keep repeated listening judgments to measure personal consistency.

Labels and models are saved in the current browser's localStorage. The interface warns if storage
is unavailable; promptly export the data held in memory. Training sends only features and color
labels to the local `POST /api/train-color` endpoint, without uploading the audio again. The
service does not save labels or models, and returns exportable parameter JSON. Training requests
are limited to 4 MB and 2,000 labels. Frontend JSON import accepts up to 8 MB, but this does not
allow data above the training limit to be submitted in one request.

Import validates fields, numbers, features, and model versions. B currently supports
`acoustic-v1` from librosa 0.11.0; other measurement versions require new analysis and labels.
For labels with the same `sourceId + scope + time`, only the latest revision is retained.
Explicit timestamps determine recency; when timestamps match or are missing, the version later
in the array takes precedence. All labels for one sourceId must belong to the same work group.
A conflict is rejected during training to avoid misleading holdout scores.

## Training method and what it learns

The implementation is `analysis/personal_model.py`. NumPy solves weighted Ridge regression with
fixed regularization `alpha=10`, without a scikit-learn dependency.

There are 28 input dimensions:

- `log10(RMS)`, `log10(spectral centroid)`, `log10(flatness)`, and `log1p(onset strength)`;
- MFCC1–12 divided by 100;
- 12 pitch-class chroma values normalized by their sum.

Timestamps, MFCC0, filenames, and sourceId are excluded. The target is the human-selected sRGB
color converted to Oklab `L,a,b`, avoiding the 0°/360° discontinuity of direct hue regression.
The browser predicts using the same feature transformation and exported coefficients, then
limits numerical ranges and displays the result through the existing gamut mapping.

It learns only the **Main color**. The separate `palette-relations-v4` design layer derives
Accent and Counterpoint with an analogous, split-complementary, or triadic relationship selected
from the recording's measured activity and harmonic change. The scheme remains fixed per track,
and all three pigments move together gently. Those two pigments are designed outputs, not
additional personalized predictions. A three-color palette does not mean three independent
color models were trained. Reflected highlights belong to the material, not the learned palette.

Color Identity and time-specific colors each have a regression model:

| Available label models | Color Identity behavior | Trajectory behavior |
| --- | --- | --- |
| Both identity and time | Predict from the whole-track summary | Predict from local audio, then precompute smoothed three-color palettes |
| Identity only | Predict from the whole-track summary | Fixed Main color and derived colors, without pretending to predict time-specific colors |
| Time only | Duration-weighted average of predictions over active sound frames | Predict from local audio |
| Neither | Do not generate B | B remains unavailable |

## How grouped validation prevents information leakage

All labels in one work group go into the same fold. The five folds are determined by sorted
work groups, rather than randomly splitting adjacent frames. For each training fold:

1. Each training work's labels have a total weight of one, preventing works with many labeled
   moments from dominating the model.
2. Feature means and scales are calculated only from the training works. Constant features
   receive a scale of one.
3. The intercept and Ridge coefficients use those same training weights.
4. Colors are predicted for the held-out works and compared with **that training fold's weighted
   mean-color** baseline.

Each label receives exactly one held-out prediction. The final error is also aggregated with
equal weight per work. After cross-validation, all labels are used to fit the final usable
parameters. Held-out colors were not used to tune `alpha`. Future parameter tuning or selection
of a more complex model should use independent test works or nested validation; repeatedly
selecting by the same holdout score cannot still be described as an independent test.

Conceptual references: [Ridge regularized least squares](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.Ridge.html),
[grouped cross-validation](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.GroupKFold.html),
[training-data feature means and scales](https://scikit-learn.org/stable/modules/generated/sklearn.preprocessing.StandardScaler.html).
This project implements its own weighted version rather than directly calling these classes.

## Interpreting the interface metrics

"Mean Oklab distance from same-version predictions" describes the difference between the
current work's saved labels and their predictions at the time. It only compares records with
the same model version and revision. Revisions combine the A/C rule version or B training time
with the shared palette-design version, so results from different predictors or display-design
revisions are not combined. B's training schema is unchanged: older compatible trained Main-color
models can still be applied through the new palette layer. Old labels retain their
original model provenance, and exports still include every label. This number is not a
cross-validation result. Viewing predictions while labeling can also introduce anchoring bias.

B's "Grouped holdout mean Oklab distance for unsmoothed regression" comes from the
five-fold holdout described above. A lower value means regression predictions are closer to
the given personal labels. "Training mean-color baseline" provides a simple reference under
the same work-holdout conditions. It does not yet evaluate final smoothing, Color Identity
blending, Accent, Counterpoint, pigment separation, or other display processing, so it is not
an error measure for the entire visual system. These distances are neither classification
accuracy nor CIEDE2000. Improvement
on a few works does not establish generalization to new styles or works.

Without real user labels, there is no personal-model performance to report. Training tests
using synthetic labels only check the code; they do not mean the system has learned a person's
music colors.

## Proposed perception study

1. Fix the measurement version, core-model version, palette-design version, and playback-volume
   conditions. Select works and excerpts with diverse timbres, rhythms, and styles.
2. Collect freely chosen colors first: hide visuals/predictions, randomize work order, and
   label independently. The interface's hiding option can reduce cues, but a rigorous study
   must still control for existing color memories and experimental order.
3. Repeat some excerpts on different days to measure within-person consistency. Experimental
   order may be random; random music colors must not be presented as measurements.
4. Split training, validation, and final testing by work. Manually group versions of the same
   track to avoid incorrect separation caused by different hashes.
5. Compare A/B/C on the same set of held-out test labels. Randomize prediction presentation
   during blind tests, without displaying "AI" or model names.
6. Report Oklab color distance, matching/preference ratings, repeated-label consistency,
   trajectory continuity, and section alignment. Show distributions and failures by work,
   rather than reporting only an average over many adjacent frames.

Evaluate the three-pigment composition separately from Main-color prediction. Compare analogous,
split-complementary, and triadic designs under controlled presentation, and collect palette
preference and role-distinction judgments. Minimum displayed Oklab-distance checks establish
what the program enforces; their thresholds are design heuristics, not established accessibility
contrast requirements or evidence that people prefer the resulting combinations.

These experiments have not been completed. Passing program tests must not be described as
scientific validation of a synesthetic mapping.
