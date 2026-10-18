"""Strict, transparent scoring. No fuzzy matching or financial inference."""
from collections import Counter
from decimal import Decimal
import hashlib
import json
import re


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def normalize(value, field):
    text = " ".join(value.casefold().split())
    if field != "amount":
        return text
    # Preserve currency: USD 20 must never equal INR 20. Do not assume a default.
    currency = ""
    for pattern, code in [(r"(?:inr|rs\.?|₹)", "INR"), (r"(?:usd|\$)", "USD"),
                          (r"(?:eur|€)", "EUR"), (r"(?:gbp|£)", "GBP")]:
        match = re.fullmatch(rf"(?:{pattern})\s*(.+)", text)
        suffix = re.fullmatch(rf"(.+?)\s*(?:{pattern})", text)
        if match or suffix:
            currency, text = code, (match or suffix).group(1).strip()
            break
    match = re.fullmatch(r"([+-]?(?:\d+(?:\.\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d{1,2}(?:,\d{2})*,\d{3}(?:\.\d+)?))\s*(k|lakh|lakhs|crore|crores)?", text)
    if not match:
        return value.casefold().strip()
    scale = {None: 1, "k": 1000, "lakh": 100000, "lakhs": 100000,
             "crore": 10000000, "crores": 10000000}[match.group(2)]
    amount = Decimal(match.group(1).replace(",", "")) * scale
    return f"{currency}:{amount.normalize():f}"


def validate_prediction(value, schema):
    if not isinstance(value, dict) or set(value) != {"entities", "classifications"}:
        raise ValueError("Prediction must contain exactly entities and classifications")
    entities, classes = value["entities"], value["classifications"]
    if not isinstance(entities, dict) or set(entities) != set(schema["entities"]):
        raise ValueError("Entity keys do not match schema")
    for name, values in entities.items():
        if not isinstance(values, list) or any(not isinstance(v, str) or not v.strip() for v in values):
            raise ValueError(f"{name} must be a list of nonempty strings")
    if not isinstance(classes, dict) or set(classes) != set(schema["classifications"]):
        raise ValueError("Classification keys do not match schema")
    for name, label in classes.items():
        if not isinstance(label, str) or label not in schema["classifications"][name]:
            raise ValueError(f"Unknown {name} label: {label!r}")
    return value


def load_cases(path, schema):
    cases, ids = [], set()
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        case = json.loads(line)
        if not isinstance(case, dict):
            raise ValueError(f"Line {number}: case must be an object")
        if not isinstance(case.get("id"), str) or not case["id"] or case["id"] in ids:
            raise ValueError(f"Line {number}: missing or duplicate id")
        if not isinstance(case.get("text"), str) or not 1 <= len(case["text"]) <= 1000:
            raise ValueError(f"Line {number}: text must be 1–1000 characters")
        if not isinstance(case.get("slice"), str) or not case["slice"]:
            raise ValueError(f"Line {number}: slice is required")
        validate_prediction(case.get("expected"), schema)
        # Labels must be extractive; decimal normalization happens only in scoring.
        for values in case["expected"]["entities"].values():
            for value, occurrences in Counter(values).items():
                if value not in case["text"]:
                    raise ValueError(f"Line {number}: gold mention {value!r} is not in source text")
                if occurrences > case["text"].count(value):
                    raise ValueError(f"Line {number}: gold mention {value!r} occurs too many times")
        ids.add(case["id"])
        cases.append(case)
    if not cases:
        raise ValueError("Dataset is empty")
    return cases


def load_suite(root, schema, suite="seed", dataset=None, slices=None):
    if dataset:
        from pathlib import Path
        cases = load_cases(Path(dataset), schema)
    else:
        if suite not in ("seed", "challenge", "all"):
            raise ValueError(f"Unknown suite: {suite}")
        names = ("seed", "challenge") if suite == "all" else (suite,)
        cases = [case for name in names for case in load_cases(root / f"data/english.{name}.jsonl", schema)]
    if len({c["id"] for c in cases}) != len(cases):
        raise ValueError("Duplicate case IDs across suites")
    if slices:
        unknown = set(slices) - {c["slice"] for c in cases}
        if unknown:
            raise ValueError(f"Unknown slices: {sorted(unknown)}")
        cases = [c for c in cases if c["slice"] in slices]
    return cases


def score_case(expected, predicted, schema):
    """An error is always inexact, including when gold entities are all empty."""
    counts, exact, classes = {}, {}, {}
    for field in schema["entities"]:
        gold = Counter(normalize(v, field) for v in expected["entities"][field])
        actual = Counter(normalize(v, field) for v in predicted["entities"][field]) if predicted else Counter()
        tp = sum((gold & actual).values())
        counts[field] = {"tp": tp, "fp": sum(actual.values()) - tp, "fn": sum(gold.values()) - tp}
        exact[field] = predicted is not None and gold == actual
    for field in schema["classifications"]:
        classes[field] = predicted is not None and expected["classifications"][field] == predicted["classifications"][field]
    return {"entities": counts, "entity_exact": exact, "classifications": classes,
            "all_exact": all(exact.values()) and all(classes.values())}


def percentile(values, fraction):
    if not values:
        return None
    values = sorted(values)
    position = (len(values) - 1) * fraction
    low = int(position)
    high = min(low + 1, len(values) - 1)
    return values[low] + (values[high] - values[low]) * (position - low)


def aggregate_entities(entities):
    """Pool mention counts across fields; never average individual F1 scores."""
    tp, fp, fn = (sum(field[key] for field in entities.values()) for key in ("tp", "fp", "fn"))
    return {"tp": tp, "fp": fp, "fn": fn,
            "precision": tp / (tp + fp) if tp + fp else None,
            "recall": tp / (tp + fn) if tp + fn else None,
            "f1": 2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else None}


def summarize(rows, schema):
    # Quality counts each case once. Repeats only measure latency/stability.
    first = [row for row in rows if row["repeat"] == 0]
    scores = [row["score"] for row in first]
    count = len(first)
    if not count:
        raise ValueError("No scored cases")
    entities = {}
    for field in schema["entities"]:
        totals = {key: sum(s["entities"][field][key] for s in scores) for key in ("tp", "fp", "fn")}
        tp, fp, fn = (totals[k] for k in ("tp", "fp", "fn"))
        entities[field] = {**totals, "precision": tp / (tp + fp) if tp + fp else None,
                           "recall": tp / (tp + fn) if tp + fn else None,
                           "f1": 2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else None,
                           "exact_accuracy": sum(s["entity_exact"][field] for s in scores) / count}
    latencies = [r["latency_ms"] for r in rows if r["error"] is None]
    slices = {}
    for name in sorted({r["slice"] for r in first}):
        group = [r for r in first if r["slice"] == name]
        counts = {field: {key: sum(r["score"]["entities"][field][key] for r in group)
                          for key in ("tp", "fp", "fn")} for field in schema["entities"]}
        slices[name] = {"cases": len(group), "all_exact": sum(r["score"]["all_exact"] for r in group) / len(group),
                        "entity_micro": aggregate_entities(counts),
                        "classifications": {k: sum(r["score"]["classifications"][k] for r in group) / len(group)
                                            for k in schema["classifications"]}}
    unstable = 0
    for row in first:
        variants = {fingerprint(r["prediction"]) for r in rows if r["id"] == row["id"]}
        unstable += len(variants) > 1
    confusion = {}
    for task in schema["classifications"]:
        cells = Counter((r["expected"]["classifications"][task],
                         r["prediction"]["classifications"][task] if r["prediction"] else "<error>")
                        for r in first if "expected" in r)
        confusion[task] = [{"expected": gold, "predicted": pred, "count": n}
                           for (gold, pred), n in sorted(cells.items())]
    noncreation = [r for r in first if r.get("expected", {}).get("classifications", {}).get("intent")
                   in ("query", "correction", "not_transaction")]
    false_creation = sum(r["prediction"] is not None and r["prediction"]["classifications"]["intent"]
                         in ("expense", "income", "refund", "transfer", "card_payment", "mixed") for r in noncreation)
    return {"cases": count, "requests": len(rows), "errors": sum(r["error"] is not None for r in rows),
            "all_exact_accuracy": sum(s["all_exact"] for s in scores) / count,
            "entities_exact_accuracy": sum(all(s["entity_exact"].values()) for s in scores) / count,
            "entity_micro": aggregate_entities(entities),
            "entities": entities,
            "classifications": {k: sum(s["classifications"][k] for s in scores) / count for k in schema["classifications"]},
            "latency_ms": {"p50": percentile(latencies, .5), "p95": percentile(latencies, .95),
                           "max": max(latencies) if latencies else None},
            "unstable_cases": unstable, "slices": slices, "confusion": confusion,
            "false_creation_intent": {"cases": len(noncreation), "count": false_creation,
                                      "rate": false_creation / len(noncreation) if noncreation else None}}
