"""Saved-report analysis; never loads a model or changes an original report."""
import json
from pathlib import Path

from .scoring import fingerprint


def checked_reports(reports):
    if not reports:
        raise ValueError("No reports found")
    if any(r.get("mode") != "benchmark" or r.get("status") != "completed" for r in reports):
        raise ValueError("Compare only completed benchmark JSON files (not extracts or failed runs)")
    keys = {(r["dataset_hash"], r["schema_hash"], r["code_hash"]) for r in reports}
    if len(keys) != 1:
        raise ValueError("Dataset, schema, or lab code differs; rerun on the same versions for a fair comparison")
    return reports


def read_reports(paths):
    return checked_reports([json.loads(Path(path).read_text(encoding="utf-8")) for path in paths])


def first_rows(report):
    rows = [r for r in report["rows"] if r["repeat"] == 0]
    if len({r["id"] for r in rows}) != len(rows):
        raise ValueError("Duplicate case IDs in first pass")
    if len(rows) != report["summary"]["cases"]:
        raise ValueError("Report case count does not match first pass")
    if not rows:
        raise ValueError("Report has no first-pass cases")
    return {r["id"]: r for r in rows}


def failed_fields(row):
    score = row["score"]
    return [name for group in ("entity_exact", "classifications")
            for name, ok in score[group].items() if not ok]


def mistakes(report):
    return [{"id": row["id"], "slice": row["slice"], "text": row["text"],
             "failed_fields": failed_fields(row), "expected": row["expected"],
             "prediction": row["prediction"], "error": row["error"]}
            for row in first_rows(report).values() if not row["score"]["all_exact"]]


def paired_reports(baseline, candidate):
    checked_reports([baseline, candidate])
    left, right = first_rows(baseline), first_rows(candidate)
    if left.keys() != right.keys():
        raise ValueError("Paired reports must have the same case IDs")
    for key in left:
        if fingerprint([left[key]["text"], left[key]["expected"]]) != fingerprint(
                [right[key]["text"], right[key]["expected"]]):
            raise ValueError(f"Case text or gold differs: {key}")
    sample = next(iter(left.values()))["score"]
    metrics = {"all_exact": lambda r: r["score"]["all_exact"]}
    for group in ("entity_exact", "classifications"):
        for field in sample[group]:
            metrics[field] = lambda r, g=group, f=field: r["score"][g][f]
    changes = {}
    for name, correct in metrics.items():
        wins = [key for key in left if not correct(left[key]) and correct(right[key])]
        losses = [key for key in left if correct(left[key]) and not correct(right[key])]
        both_correct = sum(correct(left[key]) and correct(right[key]) for key in left)
        changes[name] = {"improved": wins, "regressed": losses, "both_correct": both_correct,
                         "both_wrong": len(left) - both_correct - len(wins) - len(losses),
                         "accuracy_delta": (len(wins) - len(losses)) / len(left)}
    warning = []
    # Quality ablations are allowed; disclose resource/environment differences.
    for key in ("threads", "threshold", "repeats", "warmup", "profile", "account_catalog"):
        if baseline["config"].get(key) != candidate["config"].get(key):
            warning.append(f"Different {key}; inspect configs before attributing changes")
    if baseline.get("environment") != candidate.get("environment"):
        warning.append("Environment differs; latency/memory may not be comparable")
    left_provider, right_provider = baseline.get("provider", {}), candidate.get("provider", {})
    if (left_provider.get("model_id") == right_provider.get("model_id") and
            left_provider.get("resolved_revision") != right_provider.get("resolved_revision")):
        warning.append("Same model ID but different checkpoint revisions; not an isolated configuration change")
    if (baseline.get("experiment", {}).get("account_catalog_hash") !=
            candidate.get("experiment", {}).get("account_catalog_hash")):
        warning.append("Account catalog contents/assistance differ; this is a catalog ablation")
    return {"baseline": baseline["run_id"], "candidate": candidate["run_id"],
            "cases": len(left), "changes": changes, "notes": warning,
            "regressions": [m for m in mistakes(candidate) if m["id"] in changes["all_exact"]["regressed"]]}
