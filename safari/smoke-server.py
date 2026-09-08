"""Loopback-only fixtures for the WebKit extension integration test."""

import json
import pathlib
import re
import socketserver
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body = (
            '<!doctype html><html lang="en"><meta charset="utf-8">'
            '<title>Read Frog Safari test</title><body><h1>Language learning</h1>'
            '<p>Reading every day helps you learn a language.</p>'
            '<p>Practice makes progress.</p></body></html>'
        ).encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        data = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        text = data["text"]
        translation = "这是 Safari 的测试翻译。"
        # Preserve the batch markup when upstream requests HTML translation.
        translated = (
            re.sub(r"(?<=>)([^<]+)(?=<)", translation, text) if "<" in text else translation
        )
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps({"data": translated}).encode())


class FixtureServer(ThreadingHTTPServer):
    def server_bind(self):
        # HTTPServer normally performs reverse DNS here; CI only needs loopback.
        socketserver.TCPServer.server_bind(self)
        self.server_name = "localhost"
        self.server_port = self.server_address[1]


server = FixtureServer(("127.0.0.1", 0), Handler)
pathlib.Path(sys.argv[1]).write_text(str(server.server_port))
print(f"Fixture ready on 127.0.0.1:{server.server_port}", flush=True)
server.serve_forever()
