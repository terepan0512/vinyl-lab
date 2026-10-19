"""Generate synthetic calibration signals and measure them with the real extractor.

These deliberately simple signals cover timbre and rhythm extremes; they are not
recordings of songs or evidence that a music-to-color mapping matches perception.
Run: .venv/bin/python analysis/color_calibration.py --output /private/tmp/vinyl-color-calibration.json
"""
from __future__ import annotations

import argparse
import io
import json
import re
from pathlib import Path

import numpy as np
import soundfile as sf

if __package__:
    from .features import SAMPLE_RATE, extract_features
else:
    from features import SAMPLE_RATE, extract_features


def synthetic_profiles(duration: float = 6.0) -> dict[str, np.ndarray]:
    """Return repeatable, bounded mono waveforms, including a gain-only control."""
    size = round(duration * SAMPLE_RATE)
    time = np.arange(size) / SAMPLE_RATE
    rng = np.random.default_rng(7612)

    def tone(frequency: float, harmonics: int = 1, rolloff: float = 1.0) -> np.ndarray:
        wave = np.zeros(size)
        for partial in range(1, harmonics + 1):
            if frequency * partial < SAMPLE_RATE / 2:
                wave += np.sin(2 * np.pi * frequency * partial * time) / partial**rolloff
        return wave

    def normalize(wave: np.ndarray, peak: float) -> np.ndarray:
        return wave / max(float(np.max(np.abs(wave))), 1e-12) * peak

    def add_hit(target: np.ndarray, start: float, hit: np.ndarray) -> None:
        offset = round(start * SAMPLE_RATE)
        length = min(len(hit), size - offset)
        if length > 0:
            target[offset:offset + length] += hit[:length]

    # Fade edges to avoid analysis being dominated by discontinuities at EOF.
    edge = np.minimum(1, np.minimum(time, duration - time) / 0.04)
    bass = (tone(55, 3, 2.2) + 0.22 * tone(82.4069)) * (0.8 + 0.2 * np.sin(2 * np.pi * 0.35 * time))
    bass = normalize(bass * edge, 0.18)

    piano = np.zeros(size)
    for index, frequency in enumerate([261.626, 329.628, 391.995, 523.251, 391.995, 329.628]):
        local = time - index
        envelope = np.where(local >= 0, (1 - np.exp(-np.maximum(local, 0) * 140)) * np.exp(-np.maximum(local, 0) * 3), 0)
        piano += tone(frequency, 7, 1.7) * envelope

    bell = np.zeros(size)
    for start, frequency in [(0, 659.255), (2, 783.991), (4, 987.767)]:
        local = np.maximum(time - start, 0)
        attack = (time >= start) * (1 - np.exp(-local * 240))
        for index, ratio in enumerate([1, 2.756, 5.404, 8.933]):
            bell += np.sin(2 * np.pi * frequency * ratio * local) * attack * np.exp(-local * (0.8 + index * 0.35)) / (index + 1)

    bright = sum(tone(frequency, 10, 1.0) for frequency in [523.251, 659.255, 783.991])
    bright *= np.minimum(time / 0.12, 1) * np.minimum((duration - time) / 0.3, 1)

    percussion = np.zeros(size)
    hit_time = np.arange(round(SAMPLE_RATE * 0.25)) / SAMPLE_RATE
    for index, start in enumerate(np.arange(0.1, duration, 0.25)):
        noise = rng.normal(0, 1, len(hit_time))
        hat = np.concatenate(([0], np.diff(noise))) * np.exp(-hit_time * 70) * 0.15
        add_hit(percussion, float(start), hat)
        if index % 2 == 0:
            kick = np.sin(2 * np.pi * (45 * hit_time + 7 * (1 - np.exp(-hit_time * 30)))) * np.exp(-hit_time * 20)
            add_hit(percussion, float(start), kick)
        if index % 4 == 2:
            add_hit(percussion, float(start), noise * np.exp(-hit_time * 23) * 0.6)

    pad = sum(tone(frequency, 9, 1.9) for frequency in [130.813, 164.814, 195.998])
    pad *= np.minimum(time / 1.2, 1) * np.minimum((duration - time) / 1.2, 1)
    pad *= 0.92 + 0.08 * np.sin(2 * np.pi * 0.6 * time)

    return {
        "synthetic calibration: soft bass": bass,
        "synthetic calibration: decaying piano-like notes": normalize(piano * edge, 0.55),
        "synthetic calibration: inharmonic bell": normalize(bell * edge, 0.55),
        "synthetic calibration: bright sustained chord": normalize(bright, 0.42),
        "synthetic calibration: noisy percussion rhythm": normalize(percussion * edge, 0.65),
        "synthetic calibration: soft string-like pad": normalize(pad, 0.23),
        "synthetic calibration: identical bass louder (gain control)": bass * 3,
    }


def measure_profiles(duration: float = 6.0, wav_dir: Path | None = None) -> list[dict]:
    """Use PCM WAV bytes, exactly as an uploaded recording enters analysis."""
    measurements = []
    if wav_dir is not None:
        wav_dir.mkdir(parents=True, exist_ok=True)
    for name, audio in synthetic_profiles(duration).items():
        buffer = io.BytesIO()
        sf.write(buffer, audio, SAMPLE_RATE, format="WAV", subtype="PCM_16")
        wav_bytes = buffer.getvalue()
        if wav_dir is not None:
            slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
            (wav_dir / f"{slug}.wav").write_bytes(wav_bytes)
        measurements.append({"name": name, "payload": extract_features(wav_bytes)})
    return measurements


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("/private/tmp/vinyl-color-calibration.json"))
    parser.add_argument("--duration", type=float, default=6.0)
    parser.add_argument("--wav-dir", type=Path, help="Also write each synthetic calibration signal as a PCM_16 WAV")
    args = parser.parse_args()
    if not np.isfinite(args.duration) or args.duration < 1:
        parser.error("--duration must be a finite value of at least one second")
    measurements = measure_profiles(args.duration, args.wav_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(measurements, indent=2, allow_nan=False) + "\n")
    print(f"Wrote {len(measurements)} synthetic calibration profiles to {args.output}")
    for measurement in measurements:
        payload = measurement["payload"]
        frames = payload["frames"]
        print(f"{measurement['name']}: centroid={np.mean([frame['centroidHz'] for frame in frames]):.0f} Hz, "
              f"RMS={np.mean([frame['rms'] for frame in frames]):.3f}, tempo={payload['tempoBpm']}")


if __name__ == "__main__":
    main()
