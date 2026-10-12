#!/usr/bin/env python3
"""CLI entry point. Each inference command owns exactly one model, then exits."""
import argparse
import csv
import glob
import json
from pathlib import Path
import sys

from entity_lab.providers import MODELS
from entity_lab.runtime import ROOT, compare, execute
from entity_lab.scoring import load_cases


def parser():
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)
    for command in ("extract", "benchmark"):
        run = commands.add_parser(command)
        run.add_argument("--model", choices=[*MODELS, "bedrock"], default="gliner-small")
        run.add_argument("--schema", default=str(ROOT / "schema.json"))
        run.add_argument("--output", default=str(ROOT / "results"))
        run.add_argument("--threads", type=int, default=4)
        run.add_argument("--threshold", type=float, default=.5)
        run.add_argument("--revision", default="main", help="HF revision; resolved commit is saved")
        run.add_argument("--offline", action="store_true", help="Use cached local checkpoint only")
        run.add_argument("--warmup", type=int, default=1, help="Extra warmups after the separate first request")
        run.add_argument("--repeats", type=int, default=1 if command == "extract" else 3)
        run.add_argument("--allow-cloud", action="store_true")
        run.add_argument("--bedrock-model-id")
        run.add_argument("--region")
        if command == "extract":
            run.add_argument("--text", required=True)
        else:
            run.add_argument("--dataset", default=str(ROOT / "data" / "english.seed.jsonl"))
    validate = commands.add_parser("validate", help="Validate labels without importing/downloading models")
    validate.add_argument("--dataset", default=str(ROOT / "data" / "english.seed.jsonl"))
    validate.add_argument("--schema", default=str(ROOT / "schema.json"))
    comparison = commands.add_parser("compare", help="Compare saved benchmarks; loads no models")
    comparison.add_argument("reports", nargs="+", help="Paths or quoted glob patterns")
    comparison.add_argument("--csv", help="Also write summary CSV to this path")
    serve = commands.add_parser("serve", help="Local browser playground at 127.0.0.1")
    serve.add_argument("--port", type=int, default=8765)
    return root


def main(argv=None):
    args = parser().parse_args(argv)
    try:
        if args.command == "serve":
            from entity_lab.web import serve
            serve(args.port)
        elif args.command == "validate":
            schema = json.loads(Path(args.schema).read_text(encoding="utf-8"))
            cases = load_cases(Path(args.dataset), schema)
            print(f"Valid: {len(cases)} English seed/custom cases; no model loaded.")
        elif args.command == "compare":
            paths = []
            for pattern in args.reports:
                matches = sorted(glob.glob(pattern))
                if not matches:
                    raise ValueError(f"No report matches {pattern}")
                paths.extend(matches)
            paths = list(dict.fromkeys(paths))
            columns, values = compare(paths)
            writer = csv.writer(sys.stdout)
            writer.writerow(columns)
            writer.writerows(values)
            if args.csv:
                with Path(args.csv).open("w", newline="", encoding="utf-8") as handle:
                    writer = csv.writer(handle)
                    writer.writerow(columns)
                    writer.writerows(values)
            print("Compare latency on the same machine/thread settings; inspect config in each JSON.", file=sys.stderr)
        else:
            report = execute(vars(args))
            if args.command == "extract":
                print(json.dumps(report["rows"][0]["prediction"], indent=2, ensure_ascii=False))
            else:
                print(json.dumps(report["summary"], indent=2))
            return 2 if any(r["error"] for r in report["rows"]) else 0
    except KeyboardInterrupt:
        print("Stopped; process exit releases model memory.", file=sys.stderr)
        return 130
    except Exception as exc:
        print(f"{type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    # Keep rupee symbols/source spans readable in redirected Windows worker logs.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    raise SystemExit(main())
