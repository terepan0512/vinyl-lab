import copy
import unittest
from unittest.mock import patch

import numpy as np

import personal_model as model


def feature(index=0):
    return {"time": 0.25 * index, "rms": 0.02 + index * 0.02,
            "centroidHz": 300 + 400 * index, "flatness": 0.005 + index * 0.02,
            "onset": index * 0.4, "mfcc": [-100 + index * (j + 1) for j in range(13)],
            "chroma": [1.0 if j == index % 12 else 0.05 for j in range(12)]}


def annotation(index, scope="identity", source=None, time=None):
    return {"sourceId": source or f"work-{index}", "scope": scope,
            "time": (float(index) if time is None else time) if scope == "time" else None,
            "labelHex": ["#1a284c", "#24427a", "#4c659b", "#7f8eba", "#b0bddb", "#e2e7f0"][index % 6],
            "features": feature(index), "createdAt": "2026-10-18T12:00:00Z"}


class PersonalModelTests(unittest.TestCase):
    def test_insufficient_work_groups_never_fabricates_a_model(self):
        request = {"annotations": [annotation(0, "time", source="one-song", time=i / 4) for i in range(100)]}
        result = model.train_personal_model(request)
        self.assertEqual(result["status"], "untrained")
        self.assertEqual(result["scopes"], {})
        self.assertEqual(result["unavailableScopes"]["time"]["nGroups"], 1)
        self.assertEqual(result["unavailableScopes"]["time"]["nLabels"], 100)

    def test_scopes_train_independently_and_learn_actual_labels(self):
        labels = [annotation(i) for i in range(6)]
        result = model.train_personal_model({"annotations": labels + [annotation(0, "time")]})
        self.assertEqual(result["status"], "partial")
        self.assertNotIn("time", result["scopes"])
        fitted = result["scopes"]["identity"]
        x = np.asarray([model.feature_vector(row["features"]) for row in labels])
        y = np.asarray([model.hex_to_oklab(row["labelHex"]) for row in labels])
        parameters = tuple(np.asarray(fitted[key]) for key in ("featureMean", "featureScale", "coefficients", "intercept"))
        predicted = model._predict(x, parameters)
        self.assertLess(float(np.mean(np.linalg.norm(predicted - y, axis=1))), 0.5 * float(np.mean(np.linalg.norm(y - y.mean(axis=0), axis=1))))
        self.assertEqual(fitted["metrics"]["nGroups"], 6)
        self.assertEqual(fitted["metrics"]["nFolds"], 5)
        self.assertLess(fitted["metrics"]["meanOklabDistance"], fitted["metrics"]["baselineOklabDistance"])

    def test_validation_holds_out_works_and_scaling_uses_training_fold_only(self):
        labels = [annotation(i, "time") for i in range(6)]
        labels += [annotation(i, "time", time=40) for i in range(6)]
        real_fit = model._fit
        calls = []

        def audit_fit(x, y, groups):
            fitted = real_fit(x, y, groups)
            calls.append((set(groups), fitted[0].copy()))
            expected = np.average(x, axis=0, weights=model._weights(groups))
            np.testing.assert_allclose(fitted[0], expected)
            return fitted

        with patch.object(model, "_fit", audit_fit):
            model.train_personal_model({"annotations": labels})
        self.assertEqual(len(calls), 6)
        self.assertEqual(len(calls[-1][0]), 6)
        self.assertTrue(all(len(groups) < 6 for groups, _ in calls[:-1]))
        self.assertEqual(sum(6 - len(groups) for groups, _ in calls[:-1]), 6)
        self.assertTrue(any(not np.allclose(mean, calls[-1][1]) for _, mean in calls[:-1]))

    def test_many_time_labels_from_one_work_have_equal_weight(self):
        original = [annotation(i, "time") for i in range(6)]
        repeated = copy.deepcopy(original)
        repeated += [annotation(0, "time", time=100 + i) for i in range(50)]
        first = model.train_personal_model({"annotations": original})["scopes"]["time"]
        second = model.train_personal_model({"annotations": repeated})["scopes"]["time"]
        for key in ("featureMean", "featureScale", "coefficients", "intercept"):
            np.testing.assert_allclose(first[key], second[key], atol=1e-12)

    def test_manual_groups_keep_versions_of_one_work_together(self):
        labels = [annotation(i) for i in range(6)]
        for row in labels:
            row["groupId"] = "same-composition"
        result = model.train_personal_model({"annotations": labels})
        self.assertEqual(result["status"], "untrained")
        self.assertEqual(result["unavailableScopes"]["identity"]["nGroups"], 1)

    def test_deduplication_keeps_latest_human_label(self):
        old = annotation(0)
        latest = copy.deepcopy(old)
        latest["createdAt"] = "2026-10-18T13:00:00Z"
        latest["labelHex"] = "#ff0000"
        rows, submitted = model.prepare_annotations({"annotations": [latest, old]})
        self.assertEqual(submitted, 2)
        self.assertEqual(len(rows), 1)
        np.testing.assert_allclose(rows[0]["color"], model.hex_to_oklab("#ff0000"))

    def test_invalid_and_incompatible_requests_are_rejected(self):
        requests = [None, {"annotations": "bad"}, {"annotations": [None]},
                    {"annotations": [annotation(0)] * 2001},
                    {"annotations": [], "extractorVersion": "0.9.0"}]
        for path, value in [("labelHex", "#oops"), ("scope", "all"), ("createdAt", "tomorrow"), ("sourceId", "")]:
            row = annotation(0)
            row[path] = value
            requests.append({"annotations": [row]})
        for path, value in [("rms", float("nan")), ("onset", float("inf")), ("mfcc", [0] * 12),
                            ("chroma", [-1] * 12), ("flatness", True)]:
            row = annotation(0)
            row["features"][path] = value
            requests.append({"annotations": [row]})
        for request in requests:
            with self.subTest(request=request), self.assertRaises(model.TrainingError):
                model.train_personal_model(request)

    def test_feature_transform_excludes_mfcc_level_and_timestamp(self):
        frame = feature()
        changed = copy.deepcopy(frame)
        changed["time"] = 999
        changed["mfcc"][0] = 999
        np.testing.assert_array_equal(model.feature_vector(frame), model.feature_vector(changed))
        frame["chroma"] = [0] * 12
        self.assertTrue(np.all(np.isfinite(model.feature_vector(frame))))


if __name__ == "__main__":
    unittest.main()
