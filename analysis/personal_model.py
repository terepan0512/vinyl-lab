"""Personal music-to-Oklab ridge regression, fitted only to supplied human labels.

No model or annotations are persisted. Validation folds hold out entire works and
fit both feature scaling and regression on the remaining works only.
"""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
import math

import numpy as np

SCHEMA = "personal-color-ridge-v1"
FEATURE_VERSION = "acoustic-v1"
EXTRACTOR_VERSION = "0.11.0"
FEATURE_COUNT = 28
MIN_GROUPS = 6
MAX_LABELS = 2000
ALPHA = 10.0


class TrainingError(ValueError):
    """A readable, invalid training request (HTTP 400)."""


def _number(value, name, low, high):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise TrainingError(f"{name} must be a finite number between {low} and {high}.")
    return float(value)


def _text(value, name):
    if not isinstance(value, str) or not value.strip() or len(value) > 256:
        raise TrainingError(f"{name} must be a nonempty string of at most 256 characters.")
    return value.strip()


def feature_vector(frame):
    """acoustic-v1: 4 log features, MFCC1..12/100, sum-normalized chroma12.

    MFCC0 and the timestamp are deliberately excluded. This exact transform is
    also implemented in src/audio/personalColorModel.ts.
    """
    if not isinstance(frame, dict):
        raise TrainingError("features must be an acoustic feature object.")
    rms = _number(frame.get("rms"), "features.rms", 0, 10)
    centroid = _number(frame.get("centroidHz"), "features.centroidHz", 0, 100000)
    flatness = _number(frame.get("flatness"), "features.flatness", 0, 1)
    onset = _number(frame.get("onset"), "features.onset", 0, 1000000)
    _number(frame.get("time"), "features.time", 0, 1000000000)
    mfcc = frame.get("mfcc")
    chroma = frame.get("chroma")
    if not isinstance(mfcc, list) or len(mfcc) != 13 or not isinstance(chroma, list) or len(chroma) != 12:
        raise TrainingError("features must contain 13 MFCC values and 12 chroma values.")
    mfcc = [_number(value, "features.mfcc", -100000, 100000) for value in mfcc]
    chroma = [_number(value, "features.chroma", 0, 1000000) for value in chroma]
    total = sum(chroma)
    return np.asarray([math.log10(max(1e-6, rms)), math.log10(max(1, centroid)),
                       math.log10(max(1e-7, flatness)), math.log1p(onset)]
                      + [value / 100 for value in mfcc[1:13]]
                      + [value / total if total > 0 else 0 for value in chroma], dtype=float)


def hex_to_oklab(value):
    if not isinstance(value, str) or len(value) != 7 or value[0] != "#" or any(character not in "0123456789abcdefABCDEF" for character in value[1:]):
        raise TrainingError("labelHex must be a six-digit hexadecimal sRGB color, such as #4e72a1.")
    rgb = np.asarray([int(value[index:index + 2], 16) / 255 for index in (1, 3, 5)])
    rgb = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    lms = np.cbrt(np.asarray([[0.4122214708, 0.5363325363, 0.0514459929],
                             [0.2119034982, 0.6806995451, 0.1073969566],
                             [0.0883024619, 0.2817188376, 0.6299787005]]) @ rgb)
    return np.asarray([[0.2104542553, 0.793617785, -0.0040720468],
                       [1.9779984951, -2.428592205, 0.4505937099],
                       [0.0259040371, 0.7827717662, -0.808675766]]) @ lms


def _timestamp(value):
    if value is None:
        return None
    if not isinstance(value, str):
        raise TrainingError("createdAt must be an ISO timestamp when provided.")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            raise ValueError("Timestamp needs a timezone")
        return parsed.timestamp()
    except (ValueError, OverflowError):
        raise TrainingError("createdAt must be an ISO timestamp with a timezone.") from None


def prepare_annotations(request):
    if not isinstance(request, dict):
        raise TrainingError("Training request must be a JSON object.")
    if request.get("featureBackend", "librosa") != "librosa" or request.get("extractorVersion", EXTRACTOR_VERSION) != EXTRACTOR_VERSION:
        raise TrainingError("Model B currently requires librosa 0.11.0 features. Reanalyze incompatible audio first.")
    annotations = request.get("annotations")
    if not isinstance(annotations, list) or len(annotations) > MAX_LABELS:
        raise TrainingError(f"annotations must be an array with at most {MAX_LABELS} labels.")
    latest = {}
    for annotation in annotations:
        if not isinstance(annotation, dict):
            raise TrainingError("Each annotation must be an object.")
        source = _text(annotation.get("sourceId"), "sourceId")
        group = _text(annotation.get("groupId", source), "groupId")
        scope = annotation.get("scope")
        if scope not in ("identity", "time"):
            raise TrainingError("scope must be identity or time.")
        time = annotation.get("time")
        if scope == "identity":
            if time is not None:
                raise TrainingError("An identity label must have time: null.")
        else:
            time = _number(time, "time", 0, 1000000000)
        if annotation.get("extractorVersion", EXTRACTOR_VERSION) != EXTRACTOR_VERSION:
            raise TrainingError("Annotations use an incompatible librosa version. Reanalyze and relabel them first.")
        vector = feature_vector(annotation.get("features"))
        color = hex_to_oklab(annotation.get("labelHex"))
        timestamp = _timestamp(annotation.get("createdAt"))
        key = (source, scope, time)
        prior = latest.get(key)
        # Array order settles ties or undated labels. Explicit timestamps settle
        # revisions imported out of order.
        if prior is None or timestamp is None or prior["timestamp"] is None or timestamp >= prior["timestamp"]:
            latest[key] = {"source": source, "group": group, "scope": scope, "time": time,
                           "vector": vector, "color": color, "timestamp": timestamp}
    # Multiple edits/remasters of a work can share a manual groupId. Conflicting
    # group assignments for one source would make a held-out score misleading.
    source_groups = {}
    for row in latest.values():
        prior = source_groups.setdefault(row["source"], row["group"])
        if row["group"] != prior:
            raise TrainingError("Each sourceId must belong to one groupId across all labels.")
    return list(latest.values()), len(annotations)


def _weights(groups):
    counts = Counter(groups)
    # Each work has total weight one regardless of its number of time labels.
    return np.asarray([1 / counts[group] for group in groups], dtype=float)


def _fit(x, y, groups):
    weights = _weights(groups)
    mean = np.average(x, axis=0, weights=weights)
    scale = np.sqrt(np.average((x - mean) ** 2, axis=0, weights=weights))
    scale = np.where(scale > 1e-8, scale, 1.0)
    intercept = np.average(y, axis=0, weights=weights)
    standardized = (x - mean) / scale
    coefficients = np.linalg.solve(standardized.T @ (standardized * weights[:, None]) + ALPHA * np.eye(FEATURE_COUNT),
                                   standardized.T @ ((y - intercept) * weights[:, None]))
    return mean, scale, coefficients, intercept


def _predict(x, fitted):
    mean, scale, coefficients, intercept = fitted
    # Identical bounds are used by the browser predictor. Gamut mapping happens
    # only when the existing colorSpace module converts this Oklab color to RGB.
    return np.clip(((x - mean) / scale) @ coefficients + intercept, [0, -0.5, -0.5], [1, 0.5, 0.5])


def _fit_scope(rows):
    x = np.asarray([row["vector"] for row in rows])
    y = np.asarray([row["color"] for row in rows])
    groups = np.asarray([row["group"] for row in rows])
    unique = sorted(set(groups))
    n_folds = min(5, len(unique))
    folds = {group: index % n_folds for index, group in enumerate(unique)}
    errors = np.zeros(len(rows))
    baseline_errors = np.zeros(len(rows))
    for fold in range(n_folds):
        held_out = np.asarray([folds[group] == fold for group in groups])
        fitted = _fit(x[~held_out], y[~held_out], groups[~held_out])
        predictions = _predict(x[held_out], fitted)
        errors[held_out] = np.linalg.norm(predictions - y[held_out], axis=1)
        baseline_errors[held_out] = np.linalg.norm(fitted[3] - y[held_out], axis=1)
    fitted = _fit(x, y, groups)
    mean, scale, coefficients, intercept = fitted
    weights = _weights(groups)
    return {
        "featureMean": mean.tolist(), "featureScale": scale.tolist(),
        "coefficients": coefficients.tolist(), "intercept": intercept.tolist(),
        "metrics": {"nLabels": len(rows), "nGroups": len(unique), "nFolds": n_folds,
                    "meanOklabDistance": float(np.average(errors, weights=weights)),
                    "baselineOklabDistance": float(np.average(baseline_errors, weights=weights)),
                    "validation": "group-held-out-5-fold", "weighting": "equal-per-work",
                    "scalerFit": "training-fold-only"},
    }


def train_personal_model(request):
    rows, submitted = prepare_annotations(request)
    scopes, unavailable = {}, {}
    for scope in ("identity", "time"):
        selected = [row for row in rows if row["scope"] == scope]
        n_groups = len({row["group"] for row in selected})
        if n_groups >= MIN_GROUPS:
            scopes[scope] = _fit_scope(selected)
        else:
            unavailable[scope] = {"nLabels": len(selected), "nGroups": n_groups,
                                  "requiredGroups": MIN_GROUPS,
                                  "reason": f"This label type requires at least {MIN_GROUPS} distinct works; currently {n_groups}."}
    return {
        "schema": SCHEMA, "featureBackend": "librosa", "extractorVersion": EXTRACTOR_VERSION,
        "featureVersion": FEATURE_VERSION, "featureCount": FEATURE_COUNT, "alpha": ALPHA,
        "status": "trained" if len(scopes) == 2 else "partial" if scopes else "untrained",
        "scopes": scopes, "unavailableScopes": unavailable,
        "submittedLabels": submitted, "deduplicatedLabels": len(rows),
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "note": "Trained on your color labels with validation grouped by work. Lower Oklab distance means a closer match to your labels, not an accuracy percentage. Results from a small number of works do not establish generalization.",
    }
