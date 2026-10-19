"""Local, deterministic librosa measurements. Color rules live in TypeScript."""
from __future__ import annotations

import hashlib
import io
from collections.abc import Callable

import librosa
import numpy as np

SAMPLE_RATE = 22050
N_FFT = 2048
HOP = 512


def extract_features(data: bytes, progress: Callable[[float], None] = lambda _: None) -> dict:
    progress(0.04)
    audio, sample_rate = librosa.load(io.BytesIO(data), sr=SAMPLE_RATE, mono=False)
    if audio.ndim > 1:
        mono = np.mean(audio, axis=0)
        energies = np.mean(audio**2, axis=1)
        # Preserve signals that would disappear in an anti-phase stereo mix.
        audio = audio[int(np.argmax(energies))] if np.mean(mono**2) < np.max(energies) * 0.05 else mono
    if not audio.size or not np.all(np.isfinite(audio)):
        raise ValueError("The recording is empty or contains invalid samples.")
    duration = audio.size / sample_rate
    progress(0.2)
    spectrum = np.abs(librosa.stft(audio, n_fft=N_FFT, hop_length=HOP, center=True))
    power = spectrum**2
    rms = librosa.feature.rms(y=audio, frame_length=N_FFT, hop_length=HOP, center=True)[0]
    centroid = librosa.feature.spectral_centroid(S=spectrum, sr=sample_rate)[0]
    flatness = librosa.feature.spectral_flatness(S=spectrum)[0]
    progress(0.35)
    mel = librosa.feature.melspectrogram(S=power, sr=sample_rate, n_mels=40, htk=False, norm="slaney")
    log_mel = librosa.power_to_db(mel, ref=1.0, top_db=80)
    mfcc = librosa.feature.mfcc(S=log_mel, n_mfcc=13, dct_type=2, norm="ortho")
    progress(0.55)
    chroma = librosa.feature.chroma_stft(S=power, sr=sample_rate, n_fft=N_FFT, hop_length=HOP, tuning=0, norm=1)
    progress(0.75)
    onset = librosa.onset.onset_strength(S=log_mel, sr=sample_rate, hop_length=HOP, n_fft=N_FFT, center=True)
    # Require several substantial attacks before reporting a global tempo.
    peaks = librosa.onset.onset_detect(onset_envelope=onset, sr=sample_rate, hop_length=HOP, backtrack=False)
    tempo_bpm = None
    if len(peaks) >= 3 and float(np.max(onset)) > 0.1:
        tempo, beats = librosa.beat.beat_track(onset_envelope=onset, sr=sample_rate, hop_length=HOP)
        if len(beats) >= 3:
            value = float(np.asarray(tempo).reshape(-1)[0])
            if np.isfinite(value) and value > 0:
                tempo_bpm = value
    progress(0.86)

    times = librosa.frames_to_time(np.arange(spectrum.shape[1]), sr=sample_rate, hop_length=HOP)
    frames = []
    for index in range(max(1, int(np.ceil(duration * 4)))):
        indices = np.flatnonzero((times >= index / 4) & (times < min(duration, (index + 1) / 4)))
        if not indices.size:
            indices = np.array([min(int(round(index / 4 * sample_rate / HOP)), len(rms) - 1)])
        weights = rms[indices] ** 2
        energy = float(np.sum(weights))
        rms_value = float(np.sqrt(np.mean(weights)))
        if energy > 1e-12:
            weighted = lambda values: np.sum(values[..., indices] * weights, axis=-1) / energy
            chroma_values = weighted(chroma)
            total = float(np.sum(chroma_values))
            if total > 0:
                chroma_values /= total
            centroid_value = float(weighted(centroid))
            flatness_value = float(weighted(flatness))
            mfcc_values = weighted(mfcc)
        else:
            chroma_values = np.zeros(12)
            mfcc_values = np.zeros(13)
            centroid_value = flatness_value = 0.0
        frames.append({
            "time": index / 4,
            "rms": rms_value,
            "centroidHz": centroid_value,
            "flatness": flatness_value,
            "onset": float(np.max(onset[indices])),
            "mfcc": mfcc_values.tolist(),
            "chroma": chroma_values.tolist(),
        })
    progress(0.98)
    return {
        "featureBackend": "librosa",
        "extractorVersion": librosa.__version__,
        "parameters": {"sampleRate": sample_rate, "nFft": N_FFT, "hopLength": HOP,
                       "nMels": 40, "nMfcc": 13, "melScale": "slaney", "chromaTuning": 0},
        "sourceId": hashlib.sha256(data).hexdigest(),
        "sampleRate": sample_rate,
        "duration": duration,
        "tempoBpm": tempo_bpm,
        "frames": frames,
    }
