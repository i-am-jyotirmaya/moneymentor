"""Loopback-only lab UI. The server never imports model libraries."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import secrets
import subprocess
import sys
import threading
from urllib.parse import urlparse

from .providers import MODELS
from .runtime import ROOT
from .scoring import aggregate_entities


def display_report(report):
    # Derive this metric for older JSON reports without rewriting their files.
    if report.get("summary") is not None:
        report["summary"]["entity_micro"] = aggregate_entities(report["summary"]["entities"])
    report["classification_setup"] = report.get("provider", {}).get(
        "classification_setup", "shared_guidance_v0" if report.get("config", {}).get("model") in MODELS else "managed")
    return report


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
            command = [sys.executable, "-u", str(ROOT / "lab.py"), mode, "--model", model]
            if mode == "extract":
                text = payload.get("text")
                if not isinstance(text, str) or not text.strip() or len(text) > 1000:
                    raise ValueError("Enter 1–1000 characters")
                command += ["--text", text]
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
                for file in sorted((ROOT / "results").rglob("*.json"), reverse=True)[:50]:
                    try:
                        report = json.loads(file.read_text(encoding="utf-8"))
                        reports.append(display_report(report))
                    except (ValueError, OSError):
                        continue
                return self.reply(200, reports)
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
