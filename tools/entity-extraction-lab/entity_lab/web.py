"""Loopback-only lab UI. The server never imports model libraries."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import secrets
import re
import subprocess
import sys
import threading
from urllib.parse import urlparse

from .providers import MODELS
from .diagnostics import mistakes, paired_reports
from .experiments import PROFILES, SUITES
from .runtime import ROOT
from .scoring import aggregate_entities


def display_report(report):
    # Derive this metric for older JSON reports without rewriting their files.
    if report.get("summary") is not None:
        report["summary"]["entity_micro"] = aggregate_entities(report["summary"]["entities"])
    report["classification_setup"] = report.get("provider", {}).get(
        "classification_setup", "shared_guidance_v0" if report.get("config", {}).get("model") in MODELS else "managed")
    return report


def find_report(run_id):
    if not isinstance(run_id, str) or not re.fullmatch(r"\d{8}T\d{6}Z-[0-9a-f]{8}", run_id):
        raise ValueError("Invalid run ID")
    paths = list((ROOT / "results").rglob(f"{run_id}.json"))
    if len(paths) != 1:
        raise ValueError("Run not found or duplicated; keep one copy under results")
    return display_report(json.loads(paths[0].read_text(encoding="utf-8")))


class Jobs:
    def __init__(self):
        self.lock = threading.Lock()
        self.process = None
        self.log_handle = None
        self.log_path = ROOT / "results" / "web-worker.log"

    def start(self, payload):
        with self.lock:
            if self.process and self.process.poll() is None:
                raise RuntimeError("A run is already active. Wait for completion or stop it.")
            if self.log_handle:
                self.log_handle.close()
            model, mode = payload.get("model"), payload.get("mode")
            if model not in MODELS or mode not in ("extract", "benchmark"):
                raise ValueError("Choose a local model and valid mode")
            profile, suite = payload.get("profile", "labels"), payload.get("suite", "seed")
            repeats = payload.get("repeats", 3)
            if profile not in PROFILES or suite not in SUITES or type(repeats) is not int or repeats not in (1, 3):
                raise ValueError("Choose a valid profile, suite, and repeat count")
            command = [sys.executable, "-u", str(ROOT / "lab.py"), mode, "--model", model]
            command += ["--profile", profile]
            if payload.get("catalog") is True:
                command += ["--account-catalog", str(ROOT / "data/accounts.demo.json")]
            if mode == "extract":
                text = payload.get("text")
                if not isinstance(text, str) or not text.strip() or len(text) > 1000:
                    raise ValueError("Enter 1–1000 characters")
                command += ["--text", text]
            else:
                command += ["--suite", suite, "--repeats", str(repeats)]
            if payload.get("offline") is True:
                command.append("--offline")
            self.log_path.parent.mkdir(exist_ok=True)
            self.log_handle = self.log_path.open("w", encoding="utf-8")
            self.process = subprocess.Popen(command, cwd=ROOT, stdout=self.log_handle,
                                            stderr=subprocess.STDOUT)

    def status(self):
        with self.lock:
            code = self.process.poll() if self.process else None
            log = ""
            if self.log_path.exists():
                with self.log_path.open("rb") as handle:
                    handle.seek(max(0, self.log_path.stat().st_size - 16000))
                    log = handle.read().decode("utf-8", errors="replace")
            return {"running": self.process is not None and code is None,
                    "exit_code": code, "log": log}

    def stop(self):
        with self.lock:
            if self.process and self.process.poll() is None:
                self.process.terminate()
                try:
                    self.process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.process.kill()
                    self.process.wait()
            if self.log_handle:
                self.log_handle.close()
                self.log_handle = None


def serve(port):
    jobs = Jobs()
    token = secrets.token_urlsafe(32)
    html = (ROOT / "entity_lab" / "index.html").read_text(encoding="utf-8").replace("__TOKEN__", token)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def reply(self, status, data, mime="application/json"):
            encoded = (json.dumps(data, ensure_ascii=False) if mime == "application/json" else data).encode()
            self.send_response(status)
            self.send_header("Content-Type", mime + "; charset=utf-8")
            self.send_header("Content-Length", str(len(encoded)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(encoded)

        def valid_host(self):
            return self.headers.get("Host") in (f"127.0.0.1:{port}", f"localhost:{port}")

        def do_GET(self):
            if not self.valid_host():
                return self.reply(403, {"error": "Loopback host required"})
            path = urlparse(self.path).path
            if path == "/":
                return self.reply(200, html, "text/html")
            if path == "/api/status":
                return self.reply(200, jobs.status())
            if path == "/api/results":
                reports = []
                files = sorted((ROOT / "results").rglob("*.json"), key=lambda p: p.name, reverse=True)
                for file in files:
                    try:
                        report = json.loads(file.read_text(encoding="utf-8"))
                        if not isinstance(report, dict) or "run_id" not in report or "config" not in report:
                            continue
                        reports.append({k: v for k, v in display_report(report).items() if k != "rows"})
                        if len(reports) == 50:
                            break
                    except (ValueError, OSError, KeyError, TypeError):
                        continue
                return self.reply(200, reports)
            if path.startswith("/api/report/"):
                try:
                    report = find_report(path.rsplit("/", 1)[-1])
                    review = mistakes(report) if report.get("mode") == "benchmark" and report.get("status") == "completed" else []
                    return self.reply(200, {"report": report, "mistakes": review})
                except (ValueError, OSError, KeyError) as exc:
                    return self.reply(400, {"error": str(exc)})
            self.reply(404, {"error": "Not found"})

        def do_POST(self):
            if not self.valid_host() or self.headers.get("X-Lab-Token") != token:
                return self.reply(403, {"error": "Local lab token required"})
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 16000:
                    raise ValueError("Invalid request length")
                payload = json.loads(self.rfile.read(length))
                if not isinstance(payload, dict):
                    raise ValueError("JSON object required")
                if self.path == "/api/start":
                    jobs.start(payload)
                elif self.path == "/api/stop":
                    jobs.stop()
                elif self.path == "/api/compare":
                    return self.reply(200, paired_reports(find_report(payload.get("baseline")),
                                                         find_report(payload.get("candidate"))))
                else:
                    return self.reply(404, {"error": "Not found"})
                self.reply(200, jobs.status())
            except RuntimeError as exc:
                self.reply(409, {"error": str(exc)})
            except (ValueError, OSError) as exc:
                self.reply(400, {"error": str(exc)})

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Open http://127.0.0.1:{port} — Ctrl-C stops the server and active model.", flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()
        jobs.stop()
