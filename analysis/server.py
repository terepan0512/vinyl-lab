"""Loopback-only audio analysis service, used through Vite's /api/analyze proxy."""
from __future__ import annotations

import argparse
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

os.environ.setdefault("NUMBA_CACHE_DIR", str(Path(__file__).resolve().parents[1] / ".venv" / "numba-cache"))
from features import extract_features  # noqa: E402
from personal_model import TrainingError, train_personal_model  # noqa: E402


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/api/analyze/health":
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"status":"ready","backend":"librosa"}')

    def do_POST(self):
        if self.path == "/api/train-color":
            self.train_color()
            return
        if self.path != "/api/analyze":
            self.send_error(404)
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_error(400)
            return
        if size <= 0 or size > 128 * 1024 * 1024:
            self.send_error(413, "Choose an audio file smaller than 128 MB.")
            return
        self.connection.settimeout(300)
        data = self.rfile.read(size)
        if len(data) != size:
            self.send_error(400)
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

        def emit(message):
            self.wfile.write((json.dumps(message, allow_nan=False, separators=(",", ":")) + "\n").encode())
            self.wfile.flush()

        try:
            result = extract_features(data, lambda progress: emit({"type": "progress", "progress": progress}))
            emit({"type": "result", "features": result})
        except (BrokenPipeError, ConnectionResetError):
            # A new upload/AbortController cancelled this request.
            return
        except Exception:
            try:
                emit({"type": "error", "error": "Could not decode or analyze this audio file."})
            except (BrokenPipeError, ConnectionResetError):
                pass

    def json_response(self, status, body):
        encoded = json.dumps(body, allow_nan=False, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(encoded)

    def train_color(self):
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size <= 0:
                raise TrainingError("Training request must contain a JSON body.")
            if size > 4 * 1024 * 1024:
                self.json_response(413, {"error": "Training annotations must be smaller than 4 MB (at most 2000 labels)."})
                return
            self.connection.settimeout(60)
            data = self.rfile.read(size)
            if len(data) != size:
                raise TrainingError("Training request body was incomplete.")
            request = json.loads(data)
            self.json_response(200, train_personal_model(request))
        except (ValueError, UnicodeDecodeError) as error:
            self.json_response(400, {"error": str(error) if isinstance(error, TrainingError) else "Training request must contain valid JSON."})
        except (BrokenPipeError, ConnectionResetError):
            return
        except Exception:
            self.json_response(500, {"error": "Model B could not be fitted. Check the annotations and try again."})


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8787)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"librosa analysis ready at http://127.0.0.1:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
