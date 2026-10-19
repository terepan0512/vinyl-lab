"""Freeze a synthetic engineering reference, not learned music-to-color labels.

Run from the project root: .venv/bin/python analysis/timbre_reference.py
The existing six color fixtures are held out; they never enter the fit.
"""
from __future__ import annotations

import argparse
import io
import json
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

if __package__:
    from .features import HOP, N_FFT, SAMPLE_RATE, extract_features
else:
    from features import HOP, N_FFT, SAMPLE_RATE, extract_features

FREQUENCIES = [65.406, 110, 185, 311.127, 523.251, 880, 1480, 2489.016]
FAMILIES = ["pure", "harmonic", "filtered-noise", "percussive"]
ENVELOPES = ["steady", "swell", "pulsed"]
DURATION = 1.5


def reference_signals() -> list[tuple[str, np.ndarray]]:
    """Equal family/frequency/envelope weights; no uploaded recording is used."""
    size = round(DURATION * SAMPLE_RATE)
    time = np.arange(size) / SAMPLE_RATE
    frequencies = np.fft.rfftfreq(size, 1 / SAMPLE_RATE)
    edge = np.clip(np.minimum(time, DURATION - time) / 0.035, 0, 1)
    envelopes = [np.ones(size), np.sin(np.pi * time / DURATION) ** 2,
                 (0.12 + 0.88 * np.maximum(0, np.sin(2 * np.pi * 3 * time)) ** 2)]
    result = []
    for family_index, family in enumerate(FAMILIES):
        for frequency_index, frequency in enumerate(FREQUENCIES):
            rng = np.random.default_rng(8419 + family_index * 100 + frequency_index)
            if family == "pure":
                wave = np.sin(2 * np.pi * frequency * time)
            elif family == "harmonic":
                wave = sum(np.sin(2 * np.pi * frequency * harmonic * time) / harmonic**1.15
                           for harmonic in range(1, 25) if frequency * harmonic < SAMPLE_RATE / 2)
            else:
                # A log-frequency filter covers low/mid/high noise bands equally.
                width = 0.6 if family == "filtered-noise" else 1.25
                band = np.exp(-0.5 * (np.log2(np.maximum(1, frequencies) / frequency) / width) ** 2)
                band[0] = 0
                noise = np.fft.irfft(np.fft.rfft(rng.normal(size=size)) * band, n=size)
                noise /= max(float(np.max(np.abs(noise))), 1e-12)
                if family == "percussive":
                    local = time % 0.375
                    chirp = np.sin(2 * np.pi * frequency * (local + 0.008 * (1 - np.exp(-local * 50))))
                    wave = (0.6 * noise + 0.4 * chirp) * np.exp(-local * 22)
                else:
                    wave = noise
            for envelope, shape in zip(ENVELOPES, envelopes):
                signal = wave * edge * shape
                signal *= 0.5 / max(float(np.max(np.abs(signal))), 1e-12)
                result.append((f"{family}/{frequency:g}Hz/{envelope}", signal))
    return result


def measure(signal: np.ndarray) -> np.ndarray:
    """Use the upload extractor, including 40 Slaney Mel bands and MFCC1..12.

    Each 250 ms frame is already energy weighted by the extractor. The global
    identity then gives each audible frame equal duration weight, as in the app.
    FLOAT WAV avoids adding a gain-dependent PCM quantization noise floor.
    """
    buffer = io.BytesIO()
    sf.write(buffer, signal, SAMPLE_RATE, format="WAV", subtype="FLOAT")
    frames = extract_features(buffer.getvalue())["frames"]
    floor = max(1e-5, max(frame["rms"] for frame in frames) * 0.025)
    audible = [frame["mfcc"][1:13] for frame in frames if frame["rms"] >= floor]
    return np.mean(audible, axis=0)


def fit(vectors: np.ndarray) -> dict:
    mean = np.mean(vectors, axis=0)
    deviations = np.std(vectors, axis=0, ddof=1)
    # Do not turn tiny high-order coefficient variation into a large direction.
    scale_floor = max(8.0, float(np.median(deviations)) * 0.25)
    scale = np.maximum(deviations, scale_floor)
    standardized = (vectors - mean) / scale
    _, singular, components = np.linalg.svd(standardized, full_matrices=False)
    components = components[:2]
    for component in components:
        anchor = int(np.argmax(np.abs(component)))
        if component[anchor] < 0:
            component *= -1
    eigen_scale = np.maximum(singular[:2] / np.sqrt(len(vectors) - 1), 0.5)
    projection = standardized @ components.T / eigen_scale
    if not np.all(np.isfinite(projection)):
        raise ValueError("The synthetic reference contains non-finite values.")
    return {
        "version": "synthetic-timbre-pca-v1",
        "provenance": "Engineering reference fitted only to 96 generated spectra. No uploaded tracks, real music, existing color fixtures, or human color labels enter fitting. PCA axes describe synthetic variation, not validated perception.",
        "extractor": {"library": "librosa", "libraryVersion": librosa.__version__,
                      "sampleRate": SAMPLE_RATE, "nFft": N_FFT, "hopLength": HOP,
                      "nMels": 40, "nMfcc": 13, "melScale": "slaney", "dctType": 2,
                      "dctNorm": "ortho", "topDb": 80, "excludedCoefficient": 0,
                      "aggregation": "duration mean of audible 250 ms extractor frames"},
        "reference": {"count": len(vectors), "families": FAMILIES,
                      "frequenciesHz": FREQUENCIES, "envelopes": ENVELOPES,
                      "durationSeconds": DURATION, "scaleFloor": scale_floor,
                      "eigenScaleFloor": 0.5, "seed": 8419,
                      "signConvention": "largest absolute coefficient positive",
                      "explainedVarianceRatio": ((singular[:2] ** 2) / np.sum(singular**2)).tolist(),
                      "projectionMinimum": projection.min(axis=0).tolist(),
                      "projectionMaximum": projection.max(axis=0).tolist()},
        "mean": mean.tolist(), "scale": scale.tolist(),
        "components": components.tolist(), "eigenScale": eigen_scale.tolist(),
    }


def project(vectors: np.ndarray, reference: dict) -> np.ndarray:
    return ((vectors - reference["mean"]) / reference["scale"]) @ np.array(reference["components"]).T / reference["eigenScale"]


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=root / "src/audio/timbreReference.json")
    parser.add_argument("--profiles-output", type=Path, help="Optionally export generated MFCC vectors for engineering tests")
    args = parser.parse_args()
    signals = reference_signals()
    vectors = np.array([measure(signal) for _, signal in signals])
    reference = fit(vectors)
    # Validate each family's low/high endpoints with a gain-only control.
    controls = list(range(0, len(signals), 24)) + list(range(23, len(signals), 24))
    gain_vectors = np.array([measure(signals[index][1] * 0.25) for index in controls])
    difference = float(np.max(np.abs(project(gain_vectors, reference) - project(vectors[controls], reference))))
    if difference > 1e-4:
        raise ValueError(f"Gain invariance failed: maximum projected difference {difference:g}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(reference, indent=2, allow_nan=False) + "\n")
    if args.profiles_output:
        args.profiles_output.parent.mkdir(parents=True, exist_ok=True)
        args.profiles_output.write_text(json.dumps({"provenance": reference["provenance"],
            "referenceVersion": reference["version"], "profiles": [
                {"name": name, "mfcc": vector.tolist()} for (name, _), vector in zip(signals, vectors)]},
            indent=2, allow_nan=False) + "\n")
    print(f"Wrote {len(signals)} synthetic reference profiles: {args.output}")
    print(f"Projection range: {reference['reference']['projectionMinimum']} to {reference['reference']['projectionMaximum']}")
    print(f"Maximum gain-only projected difference (8 held gain controls): {difference:.3g}")
    fixture = root / "tests/fixtures/color-profiles.json"
    if fixture.exists():
        profiles = json.loads(fixture.read_text())["profiles"][:6]
        print("Existing six profiles (held out of fitting):")
        for profile in profiles:
            point = project(np.array(profile["feature"]["mfcc"][1:13]), reference)
            print(f"  {profile['name']}: ({point[0]:.4f}, {point[1]:.4f}), angle={np.degrees(np.arctan2(point[1], point[0])) % 360:.1f}")


if __name__ == "__main__":
    main()
