import io
import json
import unittest

import numpy as np
import soundfile as sf

from features import SAMPLE_RATE, extract_features


def encode(audio):
    buffer = io.BytesIO()
    sf.write(buffer, audio, SAMPLE_RATE, format="WAV", subtype="PCM_16")
    return buffer.getvalue()


def tone(frequency, seconds=4, amplitude=0.25):
    time = np.arange(int(seconds * SAMPLE_RATE)) / SAMPLE_RATE
    return amplitude * np.sin(2 * np.pi * frequency * time)


class FeatureTests(unittest.TestCase):
    def test_silence_has_no_pitch_energy_or_tempo(self):
        result = extract_features(encode(np.zeros(SAMPLE_RATE * 4)))
        self.assertIsNone(result["tempoBpm"])
        self.assertTrue(all(frame["rms"] == 0 and sum(frame["chroma"]) == 0 for frame in result["frames"]))
        json.dumps(result, allow_nan=False)

    def test_audio_features_measure_volume_pitch_and_timbre(self):
        low = extract_features(encode(tone(220, amplitude=0.1)))
        loud = extract_features(encode(tone(220, amplitude=0.4)))
        high = extract_features(encode(tone(1760, amplitude=0.1)))
        mid = 4
        self.assertGreater(loud["frames"][mid]["rms"], low["frames"][mid]["rms"] * 3.9)
        self.assertGreater(high["frames"][mid]["centroidHz"], low["frames"][mid]["centroidHz"] * 6)
        self.assertEqual(int(np.argmax(low["frames"][mid]["chroma"])), 9)  # A3
        self.assertFalse(np.allclose(high["frames"][mid]["mfcc"][1:], low["frames"][mid]["mfcc"][1:]))

    def test_same_pitch_different_harmonics_changes_timbre_features(self):
        pure = tone(220)
        bright = pure + tone(660, amplitude=0.15) + tone(1100, amplitude=0.1)
        a = extract_features(encode(pure))["frames"][4]
        b = extract_features(encode(bright))["frames"][4]
        self.assertGreater(b["centroidHz"], a["centroidHz"] * 1.5)
        self.assertGreater(float(np.linalg.norm(np.array(a["mfcc"][1:]) - b["mfcc"][1:])), 5)

    def test_tempo_comes_from_actual_attacks(self):
        audio = np.zeros(SAMPLE_RATE * 12)
        time = np.arange(1500) / SAMPLE_RATE
        click = np.sin(2 * np.pi * 900 * time) * np.exp(-time * 80) * 0.7
        for start in range(SAMPLE_RATE // 2, len(audio) - len(click), SAMPLE_RATE // 2):
            audio[start:start + len(click)] += click
        result = extract_features(encode(audio))
        self.assertIsNotNone(result["tempoBpm"])
        self.assertAlmostEqual(result["tempoBpm"], 120, delta=6)
        self.assertGreater(max(frame["onset"] for frame in result["frames"]), 0.5)

    def test_repeatability_full_track_coverage_and_progress(self):
        data = encode(np.concatenate([tone(220, 2), tone(880, 2)]))
        progress = []
        first = extract_features(data, progress.append)
        self.assertEqual(first, extract_features(data))
        self.assertEqual(first["duration"], 4)
        self.assertEqual(first["frames"][-1]["time"], 3.75)
        self.assertGreater(first["frames"][-2]["centroidHz"], first["frames"][2]["centroidHz"] * 3)
        self.assertEqual(progress, sorted(progress))
        self.assertEqual(len(first["sourceId"]), 64)
        self.assertEqual(first["extractorVersion"], "0.11.0")

    def test_antiphase_stereo_and_malformed_files(self):
        audio = tone(440, 2)
        result = extract_features(encode(np.stack([audio, -audio], axis=1)))
        self.assertGreater(result["frames"][3]["rms"], 0.1)
        with self.assertRaises(Exception):
            extract_features(b"not audio")


if __name__ == "__main__":
    unittest.main()
