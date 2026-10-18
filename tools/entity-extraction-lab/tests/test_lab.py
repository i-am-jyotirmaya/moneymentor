"""No model weights or third-party packages needed for these tests."""
from contextlib import redirect_stdout
from copy import deepcopy
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from entity_lab.providers import BedrockProvider, PredictionError, gliner_prediction
from entity_lab.runtime import ROOT, compare, execute, model_lock
from entity_lab.scoring import aggregate_entities, load_cases, normalize, score_case, summarize, validate_prediction
from entity_lab.web import Jobs, display_report

SCHEMA = json.loads((ROOT / "schema.json").read_text(encoding="utf-8"))


def empty_prediction():
    return {"entities": {k: [] for k in SCHEMA["entities"]},
            "classifications": {"intent": "not_transaction", "category": "not_applicable"}}


class ScoringTests(unittest.TestCase):
    def test_money_is_decimal_and_currency_sensitive(self):
        self.assertEqual(normalize("Rs. 1,20,000.10", "amount"), "INR:120000.1")
        self.assertEqual(normalize("₹2.5k", "amount"), "INR:2500")
        self.assertEqual(normalize("1.2 lakh", "amount"), ":120000")
        self.assertNotEqual(normalize("$20", "amount"), normalize("₹20", "amount"))
        self.assertNotEqual(normalize("20", "amount"), normalize("₹20", "amount"))
        self.assertEqual(normalize("0.10", "amount"), ":0.1")
        self.assertEqual(normalize("1,2,3", "amount"), "1,2,3")

    def test_duplicate_and_hallucinated_entities_are_penalized(self):
        gold, pred = empty_prediction(), empty_prediction()
        gold["entities"]["amount"] = ["40"]
        pred["entities"]["amount"] = ["40", "40"]
        pred["entities"]["account"] = ["HDFC"]
        score = score_case(gold, pred, SCHEMA)
        self.assertEqual(score["entities"]["amount"], {"tp": 1, "fp": 1, "fn": 0})
        self.assertFalse(score["entity_exact"]["account"])
        self.assertFalse(score["all_exact"])

    def test_failed_empty_case_is_never_correct(self):
        score = score_case(empty_prediction(), None, SCHEMA)
        self.assertFalse(score["all_exact"])
        self.assertFalse(any(score["entity_exact"].values()))
        self.assertFalse(any(score["classifications"].values()))

    def test_case_and_order_normalization(self):
        gold, pred = empty_prediction(), empty_prediction()
        gold["entities"]["item"] = ["Coffee", "bread"]
        pred["entities"]["item"] = ["bread", " coffee "]
        self.assertTrue(score_case(gold, pred, SCHEMA)["all_exact"])

    def test_closed_output_schema(self):
        pred = empty_prediction()
        pred["classifications"]["category"] = "invented"
        with self.assertRaises(ValueError):
            validate_prediction(pred, SCHEMA)
        pred = empty_prediction()
        pred["entities"]["amount"] = [40.0]
        with self.assertRaises(ValueError):
            validate_prediction(pred, SCHEMA)

    def test_seed_labels_are_valid_and_cover_hard_cases(self):
        cases = load_cases(ROOT / "data/english.seed.jsonl", SCHEMA)
        self.assertEqual(len(cases), 48)
        self.assertTrue({"account_alias", "number_distractor", "non_transaction", "multiple", "refund"}
                        <= {c["slice"] for c in cases})

    def test_duplicate_ids_and_nonextractive_gold_rejected(self):
        case = {"id": "x", "slice": "s", "text": "hello", "expected": empty_prediction()}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "cases.jsonl"
            path.write_text(json.dumps(case) + "\n" + json.dumps(case), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "duplicate"):
                load_cases(path, SCHEMA)
            case["expected"]["entities"]["item"] = ["invented"]
            path.write_text(json.dumps(case), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "not in source"):
                load_cases(path, SCHEMA)

    def test_repeats_do_not_inflate_quality_and_failures_not_in_latency(self):
        gold = empty_prediction()
        rows = [{"id": "x", "slice": "s", "repeat": n, "prediction": gold if n == 0 else None,
                 "error": None if n == 0 else "timeout", "latency_ms": 10 if n == 0 else 999,
                 "score": score_case(gold, gold if n == 0 else None, SCHEMA)} for n in range(2)]
        result = summarize(rows, SCHEMA)
        self.assertEqual(result["cases"], 1)
        self.assertEqual(result["all_exact_accuracy"], 1)
        self.assertEqual(result["errors"], 1)
        self.assertEqual(result["unstable_cases"], 1)
        self.assertEqual(result["latency_ms"]["p95"], 10)
        self.assertIsNone(result["entities"]["amount"]["f1"])

    def test_entity_micro_pools_counts_and_keeps_classification_separate(self):
        entities = {"amount": {"tp": 9, "fp": 0, "fn": 1},
                    "account": {"tp": 0, "fp": 1, "fn": 1}}
        result = aggregate_entities(entities)
        self.assertAlmostEqual(result["f1"], 18 / 21)
        self.assertEqual(result["tp"], 9)
        self.assertIsNone(aggregate_entities({})["f1"])
        gold, prediction = empty_prediction(), empty_prediction()
        gold["entities"]["amount"] = prediction["entities"]["amount"] = ["250"]
        prediction["classifications"]["intent"] = "mixed"
        rows = [{"id": "x", "slice": "s", "repeat": 0, "prediction": prediction,
                 "error": None, "latency_ms": 1, "score": score_case(gold, prediction, SCHEMA)}]
        summary = summarize(rows, SCHEMA)
        self.assertEqual(summary["entity_micro"]["f1"], 1)
        self.assertEqual(summary["entities_exact_accuracy"], 1)
        self.assertEqual(summary["all_exact_accuracy"], 0)


class AdapterTests(unittest.TestCase):
    def test_gliner_spans_and_classes(self):
        raw = {"entities": {"item": [{"text": "coffee", "start": 0, "end": 6, "confidence": .9}]},
               "intent": {"label": "expense", "confidence": .9}, "category": {"label": "Cafes / Coffee"}}
        prediction = gliner_prediction(raw, SCHEMA)
        self.assertEqual(prediction["entities"]["item"], ["coffee"])
        self.assertEqual(prediction["entities"]["account"], [])
        self.assertEqual(raw["entities"]["item"][0]["start"], 0)

    def test_missing_classification_is_error(self):
        with self.assertRaises(ValueError):
            gliner_prediction({"entities": {}}, SCHEMA)

    def test_bedrock_requires_explicit_cloud_choice_before_imports(self):
        with self.assertRaisesRegex(ValueError, "allow-cloud"):
            BedrockProvider({"allow_cloud": False}, SCHEMA)

    def test_bedrock_validates_json_and_preserves_invalid_response(self):
        class Client:
            response = {"stopReason": "end_turn", "output": {"message": {"content": [{"text": "not json"}]}},
                        "usage": {"inputTokens": 10}}

            def converse(self, **kwargs):
                self.request = kwargs
                return self.response

        provider = BedrockProvider.__new__(BedrockProvider)
        provider.client, provider.model_id, provider.schema = Client(), "test-model", SCHEMA
        with self.assertRaises(PredictionError) as caught:
            provider.extract("hello")
        self.assertEqual(caught.exception.raw, "not json")
        self.assertEqual(caught.exception.usage["inputTokens"], 10)
        provider.client.response["output"]["message"]["content"][0]["text"] = json.dumps(empty_prediction())
        self.assertEqual(provider.extract("hello")[0], empty_prediction())
        self.assertEqual(provider.client.request["inferenceConfig"]["temperature"], 0)


class RuntimeTests(unittest.TestCase):
    def test_old_reports_display_entity_f1_and_original_setup(self):
        report = {"config": {"model": "gliner-base"}, "provider": {},
                  "summary": {"entities": {"amount": {"tp": 9, "fp": 0, "fn": 1}},
                              "all_exact_accuracy": .1}}
        shown = display_report(deepcopy(report))
        self.assertEqual(shown["classification_setup"], "shared_guidance_v0")
        self.assertAlmostEqual(shown["summary"]["entity_micro"]["f1"], 18 / 19)
        self.assertEqual(shown["summary"]["all_exact_accuracy"], .1)
        report["provider"]["classification_setup"] = "task_labels_only_v1"
        self.assertEqual(display_report(report)["classification_setup"], "task_labels_only_v1")

    def test_cross_process_lock_and_crash_release(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "model.lock"
            source = ("from pathlib import Path\nfrom entity_lab.runtime import model_lock\n"
                      f"with model_lock(Path({str(path)!r})):\n print('locked', flush=True)\n input()\n")
            proc = subprocess.Popen([sys.executable, "-u", "-c", source], cwd=ROOT,
                                    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            try:
                self.assertEqual(proc.stdout.readline().strip(), "locked")
                with self.assertRaisesRegex(RuntimeError, "Another entity-lab"):
                    with model_lock(path):
                        self.fail("Loaded a second model")
                proc.kill()
                proc.wait(timeout=5)
                with model_lock(path):
                    pass
            finally:
                if proc.poll() is None:
                    proc.kill()
                proc.communicate(timeout=5)

    def test_worker_runs_one_provider_and_saves_errors_for_comparison(self):
        class Memory:
            peak = 1024 * 1024

            def __enter__(self):
                return self

            def __exit__(self, *_):
                pass

        created = []

        class Fake:
            metadata = {"model_id": "test-only", "resolved_revision": "test"}

            def __init__(self, *_):
                created.append(self)

            def extract(self, text):
                if text == "fail":
                    raise PredictionError("invalid", "original invalid response")
                value = empty_prediction()
                return value, deepcopy(value), {}

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "data.jsonl"
            path.write_text("\n".join(json.dumps({"id": text, "slice": "test", "text": text,
                                                   "expected": empty_prediction()}) for text in ["hello", "fail"]), encoding="utf-8")
            config = {"command": "benchmark", "schema": str(ROOT / "schema.json"), "dataset": str(path),
                      "model": "gliner-small", "output": directory, "warmup": 1, "repeats": 2,
                      "threads": 1, "threshold": .5}
            with redirect_stdout(io.StringIO()), patch("entity_lab.runtime.lock_path", return_value=Path(directory) / "test.lock"):
                report = execute(config, Fake, Memory)
            self.assertEqual(len(created), 1)
            self.assertEqual(report["summary"]["cases"], 2)
            self.assertEqual(report["summary"]["errors"], 2)
            self.assertEqual(report["summary"]["all_exact_accuracy"], .5)
            self.assertEqual(report["rows"][1]["raw"], "original invalid response")
            saved = Path(directory) / f"{report['run_id']}.json"
            self.assertEqual(json.loads(saved.read_text())["status"], "completed")
            columns, values = compare([saved])
            self.assertEqual(values[0][columns.index("all_exact")], .5)
            modified = deepcopy(report)
            modified["dataset_hash"] = "different"
            other = Path(directory) / "other.json"
            other.write_text(json.dumps(modified), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "differs"):
                compare([saved, other])
            modified["status"] = "failed"
            other.write_text(json.dumps(modified), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "completed"):
                compare([other])

    def test_web_worker_blocks_switch_and_waits_for_exit(self):
        jobs = Jobs()
        proc = subprocess.Popen([sys.executable, "-c", "import sys; sys.stdin.read()"], stdin=subprocess.PIPE)
        jobs.process = proc
        try:
            with self.assertRaisesRegex(RuntimeError, "already active"):
                jobs.start({"model": "gliner-base", "mode": "benchmark"})
            jobs.stop()
            self.assertIsNotNone(proc.poll())
        finally:
            jobs.stop()
            proc.communicate()


if __name__ == "__main__":
    unittest.main()
