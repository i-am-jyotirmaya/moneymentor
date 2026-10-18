"""One model per process, and one lab inference process per OS user."""
from contextlib import contextmanager
from datetime import datetime, timezone
import getpass
import gc
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import tempfile
import threading
import time
import uuid

from .providers import create_provider
from .diagnostics import read_reports
from .experiments import DESCRIPTIONS, PROFILES, load_catalog
from .scoring import aggregate_entities, fingerprint, load_suite, score_case, summarize

ROOT = Path(__file__).resolve().parent.parent


def lock_path():
    user_key = hashlib.sha256(getpass.getuser().encode()).hexdigest()[:16]
    return Path(tempfile.gettempdir()) / f"spndrr-entity-lab-{user_key}.lock"


@contextmanager
def model_lock(path=None):
    # OS releases this lock on normal exit, Ctrl-C, crashes, and forced termination.
    # The file is deliberately never unlinked: unlinking permits concurrent inodes.
    with open(path or lock_path(), "a+b") as handle:
        handle.seek(0, os.SEEK_END)
        if handle.tell() == 0:
            handle.write(b"0")
            handle.flush()
        handle.seek(0)
        try:
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            raise RuntimeError("Another entity-lab process is using a model. Wait for it or stop it first.") from exc
        try:
            yield
        finally:
            handle.seek(0)
            if os.name == "nt":
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


class MemorySampler:
    """Sample worker RSS at 50 ms; not VRAM and not an exact allocation peak."""
    def __enter__(self):
        import psutil
        self.error = None
        self.peak = None
        self.done = threading.Event()
        self.thread = None
        try:
            self.process = psutil.Process()
            self.peak = self.process.memory_info().rss
            self.thread = threading.Thread(target=self.sample, daemon=True)
            self.thread.start()
        except (psutil.Error, OSError) as exc:
            self.error = str(exc)
        return self

    def sample(self):
        import psutil
        while not self.done.wait(.05):
            try:
                self.peak = max(self.peak, self.process.memory_info().rss)
            except (psutil.Error, OSError) as exc:
                self.error = str(exc)
                return

    def __exit__(self, *_):
        self.done.set()
        if self.thread:
            self.thread.join()


def code_hash():
    files = [ROOT / "lab.py", *sorted((ROOT / "entity_lab").glob("*.py"))]
    return fingerprint({p.name: p.read_text(encoding="utf-8") for p in files})


def atomic_json(path, value):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False), encoding="utf-8")
    temporary.replace(path)


def execute(config, provider_factory=create_provider, sampler_factory=MemorySampler):
    config = dict(config)
    config.setdefault("profile", "labels")
    if config["profile"] not in PROFILES:
        raise ValueError("Unknown experiment profile")
    if config["model"] == "bedrock" and config["profile"] != "labels":
        raise ValueError("Description/split profiles are local GLiNER experiments")
    schema = json.loads(Path(config["schema"]).read_text(encoding="utf-8"))
    if config["profile"] != "labels" and any(set(labels) != set(DESCRIPTIONS.get(task, {}))
                                            for task, labels in schema["classifications"].items()):
        raise ValueError("Description experiments require the bundled classification labels")
    catalog = load_catalog(Path(config["account_catalog"])) if config.get("account_catalog") else None
    if config["command"] == "benchmark":
        cases = load_suite(ROOT, schema, config.get("suite", "seed"), config.get("dataset"), config.get("slices"))
    else:
        text = config["text"]
        if not text or len(text) > 1000:
            raise ValueError("Text must be 1–1000 characters")
        cases = [{"id": "playground", "slice": "manual", "text": text}]
    # Validate everything before downloading/importing a model.
    if config["repeats"] < 1 or config["warmup"] < 0 or config["threads"] < 1:
        raise ValueError("repeats/threads must be positive; warmup must be nonnegative")
    if not 0 <= config["threshold"] <= 1:
        raise ValueError("threshold must be in [0, 1]")
    result_dir = Path(config["output"])
    result_dir.mkdir(parents=True, exist_ok=True)
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
    report = {"format_version": 2, "run_id": run_id, "created_at": datetime.now(timezone.utc).isoformat(),
              "mode": config["command"], "config": config, "schema_hash": fingerprint(schema),
              "dataset_hash": fingerprint(cases), "code_hash": code_hash(),
              "experiment": {"profile": config["profile"],
                             "account_catalog_hash": fingerprint(catalog) if catalog else None},
              "environment": {"python": platform.python_version(), "platform": platform.platform(),
                              "processor": platform.processor(), "logical_cpus": os.cpu_count(),
                              "packages": {d.metadata["Name"]: d.version for d in importlib.metadata.distributions()}},
              "rows": [], "status": "running"}
    start = time.perf_counter()
    with model_lock(), sampler_factory() as memory:
        provider = None
        try:
            print(f"Loading {config['model']} (CPU for local models)…", flush=True)
            load_start = time.perf_counter()
            provider = provider_factory(config, schema)
            report["load_seconds"] = time.perf_counter() - load_start
            report["provider"] = provider.metadata
            # First request is always measured separately and excluded from quality.
            first_start = time.perf_counter()
            report["warmup_errors"] = []
            try:
                provider.extract(cases[0]["text"])
            except Exception as exc:
                report["warmup_errors"].append(f"{type(exc).__name__}: {exc}")
            report["first_request_ms"] = (time.perf_counter() - first_start) * 1000
            for _ in range(config["warmup"]):
                try:
                    provider.extract(cases[0]["text"])
                except Exception as exc:
                    report["warmup_errors"].append(f"{type(exc).__name__}: {exc}")
            for repeat in range(config["repeats"]):
                for index, case in enumerate(cases):
                    request_start = time.perf_counter()
                    prediction, raw, usage, error = None, None, {}, None
                    try:
                        prediction, raw, usage = provider.extract(case["text"])
                    except Exception as exc:
                        error = f"{type(exc).__name__}: {exc}"
                        raw, usage = getattr(exc, "raw", None), getattr(exc, "usage", {})
                    row = {**case, "repeat": repeat, "prediction": prediction, "raw": raw,
                           "usage": usage, "error": error,
                           "latency_ms": (time.perf_counter() - request_start) * 1000}
                    if "expected" in case:
                        row["score"] = score_case(case["expected"], prediction, schema)
                    report["rows"].append(row)
                    print(f"{repeat + 1}/{config['repeats']} case {index + 1}/{len(cases)}: {case['id']}" +
                          (f" ERROR {error}" if error else ""), flush=True)
            if config["command"] == "benchmark":
                report["summary"] = summarize(report["rows"], schema)
            report["status"] = "completed"
        except BaseException as exc:
            report["status"] = "interrupted" if isinstance(exc, KeyboardInterrupt) else "failed"
            report["fatal_error"] = f"{type(exc).__name__}: {exc}"
            raise
        finally:
            report["wall_seconds"] = time.perf_counter() - start
            report["sampled_peak_rss_mb"] = memory.peak / (1024 * 1024) if memory.peak is not None else None
            report["memory_sampling_error"] = getattr(memory, "error", None)
            output = result_dir / f"{run_id}.json"
            atomic_json(output, report)
            print(f"Saved {output}", flush=True)
            # Drop model references before releasing the OS lock. The CLI/worker
            # then exits, releasing PyTorch's remaining allocator/runtime memory.
            provider = None
            gc.collect()
    return report


def compare(paths):
    reports = read_reports(paths)
    columns = ["run_id", "model", "profile", "catalog_hash", "cases", "all_exact", "entity_f1", "category_accuracy", "intent_accuracy", "errors",
               "p50_ms", "p95_ms", "load_seconds", "peak_rss_mb"]
    values = []
    for r in reports:
        s = r["summary"]
        values.append([r["run_id"], r["config"]["model"], r["config"].get("profile", "labels"),
                       r.get("experiment", {}).get("account_catalog_hash"), s["cases"],
                       s["all_exact_accuracy"], aggregate_entities(s["entities"])["f1"],
                       s["classifications"]["category"], s["classifications"]["intent"], s["errors"],
                       s["latency_ms"]["p50"], s["latency_ms"]["p95"], r["load_seconds"], r["sampled_peak_rss_mb"]])
    return columns, values
