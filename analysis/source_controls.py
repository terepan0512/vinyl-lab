"""Reproduce same-production/different-composition controls through real WAV analysis.

These are synthetic musical phrases, not songs or examples of a natural color
correspondence. They are held-out diagnostics: no model or calibration is fitted
to them. Sequence pairs deliberately preserve their pitch/duration multiset.

Run: .venv/bin/python analysis/source_controls.py --wav-dir /private/tmp/vinyl-source-controls
"""
from __future__ import annotations

import argparse
import io
import json
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

if __package__:
    from .features import SAMPLE_RATE, extract_features
else:
    from features import SAMPLE_RATE, extract_features


DURATION = 12.0
PATTERNS = (
    {
        "id": "ascending",
        "description": "Repeated ascending six-note phrase over a fixed C-major bed; straight pulse.",
        "melodyMidi": [60, 62, 64, 65, 67, 69] * 4,
        "noteSeconds": [0.5] * 24,
        "chordSequenceMidi": [[48, 52, 55]] * 4,
        "drumOffsetsSeconds": [0.0, 0.5, 1.0, 1.5, 2.0, 2.5],
    },
    {
        "id": "leaping",
        "description": "Alternating wide leaps: exactly the ascending phrase's note/duration multiset, bed, and drums.",
        "melodyMidi": [60, 69, 62, 67, 64, 65] * 4,
        "noteSeconds": [0.5] * 24,
        "chordSequenceMidi": [[48, 52, 55]] * 4,
        "drumOffsetsSeconds": [0.0, 0.5, 1.0, 1.5, 2.0, 2.5],
    },
    {
        "id": "descending-minor",
        "description": "Descending minor phrase and changing Am/F/Dm/E harmony, using the same instruments and straight pulse.",
        "melodyMidi": [69, 67, 65, 64, 62, 60, 59, 57] * 3,
        "noteSeconds": [0.5] * 24,
        "chordSequenceMidi": [[45, 48, 52], [41, 45, 48], [38, 41, 45], [40, 44, 47]],
        "drumOffsetsSeconds": [0.0, 0.5, 1.0, 1.5, 2.0, 2.5],
    },
    {
        "id": "syncopated-minor",
        "description": "Minor-seventh broken phrase with unequal note durations, syncopated drums, and Cm/Ab/Fm/G harmony.",
        "melodyMidi": [60, 63, 67, 70, 67, 63] * 4,
        "noteSeconds": [0.25, 0.25, 0.75, 0.25, 0.5, 1.0] * 4,
        "chordSequenceMidi": [[48, 51, 55], [44, 48, 51], [41, 44, 48], [43, 47, 50]],
        "drumOffsetsSeconds": [0.0, 0.375, 1.0, 1.75, 2.25, 2.75],
    },
)

VARIANTS = (
    {"id": "original", "description": "PCM_16 WAV, peak-normalized to 0.62 before encoding."},
    {"id": "gain-minus-12db", "description": "Identical composition and render, multiplied by 10^(-12/20) before PCM_16 encoding."},
    {"id": "static-lowpass", "description": "Identical composition and render, second-order 2500 Hz Butterworth low-pass; peak-normalized to the original's peak."},
)


def render_pattern(pattern: dict) -> np.ndarray:
    """The instrument, effects, drum samples and mix are fixed across patterns."""
    size = round(DURATION * SAMPLE_RATE)
    audio = np.zeros(size)

    def add(start: float, wave: np.ndarray) -> None:
        offset = round(start * SAMPLE_RATE)
        length = min(len(wave), size - offset)
        if length > 0:
            audio[offset:offset + length] += wave[:length]

    def note(midi: int, seconds: float, amplitude: float, sustained: bool = False) -> np.ndarray:
        time = np.arange(round(seconds * SAMPLE_RATE)) / SAMPLE_RATE
        frequency = 440 * 2 ** ((midi - 69) / 12)
        wave = sum(np.sin(2 * np.pi * frequency * harmonic * time) / harmonic ** 1.8
                   for harmonic in range(1, 8))
        attack = np.minimum(time / 0.012, 1)
        release = np.minimum((seconds - time) / 0.035, 1)
        envelope = attack * release * (np.ones_like(time) if sustained else np.exp(-time * 2.4))
        return wave * envelope * amplitude

    start = 0.0
    for midi, seconds in zip(pattern["melodyMidi"], pattern["noteSeconds"]):
        add(start, note(midi, seconds, 0.32))
        start += seconds
    if not np.isclose(start, DURATION):
        raise ValueError("Control note durations must fill the complete phrase.")
    for chord_index, chord in enumerate(pattern["chordSequenceMidi"]):
        for midi in chord:
            add(chord_index * 3.0, note(midi, 3.0, 0.055, sustained=True))

    hit_time = np.arange(round(0.18 * SAMPLE_RATE)) / SAMPLE_RATE
    kick = np.sin(2 * np.pi * (52 * hit_time + 1.2 * (1 - np.exp(-hit_time * 30)))) * np.exp(-hit_time * 35) * 0.12
    # A fixed, seeded sample is reused in every composition; no random features
    # or randomness from a filename/download source enter the controls.
    noise = np.random.default_rng(88031).normal(size=len(hit_time))
    hat = np.concatenate(([0.0], np.diff(noise))) * np.exp(-hit_time * 85) * 0.012
    for bar in range(4):
        for index, offset in enumerate(pattern["drumOffsetsSeconds"]):
            add(bar * 3.0 + offset, kick if index % 2 == 0 else hat)
    audio *= 0.62 / max(float(np.max(np.abs(audio))), 1e-12)
    return audio


def measured_controls(wav_dir: Path | None = None) -> dict:
    if wav_dir is not None:
        wav_dir.mkdir(parents=True, exist_ok=True)
    controls = []
    lowpass = butter(2, 2500, fs=SAMPLE_RATE, output="sos")
    for pattern in PATTERNS:
        original = render_pattern(pattern)
        filtered = sosfilt(lowpass, original)
        filtered *= np.max(np.abs(original)) / np.max(np.abs(filtered))
        waves = {"original": original, "gain-minus-12db": original * 10 ** (-12 / 20), "static-lowpass": filtered}
        for variant in VARIANTS:
            control_id = f"{pattern['id']}--{variant['id']}"
            buffer = io.BytesIO()
            sf.write(buffer, waves[variant["id"]], SAMPLE_RATE, format="WAV", subtype="PCM_16")
            wav_bytes = buffer.getvalue()
            if wav_dir is not None:
                (wav_dir / f"{control_id}.wav").write_bytes(wav_bytes)
            controls.append({"id": control_id, "patternId": pattern["id"], "variantId": variant["id"],
                             "features": extract_features(wav_bytes)})
    return {
        "fixtureVersion": 1,
        "provenance": {
            "generator": "analysis/source_controls.py",
            "command": ".venv/bin/python analysis/source_controls.py --wav-dir /private/tmp/vinyl-source-controls",
            "sampleRate": SAMPLE_RATE, "seconds": DURATION, "encoding": "PCM_16 WAV mono",
            "synthetic": True, "purpose": "Held-out same-production composition and mastering controls; not a calibration set or perceptual validation.",
            "synthDescription": "Fixed seven-partial additive lead and chord bed, fixed kick and seeded hat samples, no reverb; musical events vary as listed.",
            "patterns": list(PATTERNS), "variants": list(VARIANTS),
        },
        "controls": controls,
        "pairs": {
            "sequence": [{"first": f"ascending--{variant['id']}", "second": f"leaping--{variant['id']}",
                          "reason": "Exact same note/duration multiset, C-major bed, instruments, mix and drum timings; stepwise ascent versus alternating wide leaps."}
                         for variant in VARIANTS],
            "differentComposition": [{"first": f"ascending--{variant['id']}", "second": f"{pattern_id}--{variant['id']}",
                                      "reason": "Same synthetic production, different musical sequence, harmony and/or rhythm."}
                                     for variant in VARIANTS for pattern_id in ("descending-minor", "syncopated-minor")],
            "sameComposition": [{"first": f"{pattern['id']}--original", "second": f"{pattern['id']}--{variant['id']}",
                                 "reason": "Same composition and original render; only the documented mastering operation changes."}
                                for pattern in PATTERNS for variant in VARIANTS[1:]],
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "tests/fixtures/source-controls.json")
    parser.add_argument("--wav-dir", type=Path)
    args = parser.parse_args()
    fixture = measured_controls(args.wav_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(fixture, indent=2, allow_nan=False) + "\n")
    print(f"Wrote {len(fixture['controls'])} measured synthetic WAV controls to {args.output}")


if __name__ == "__main__":
    main()
