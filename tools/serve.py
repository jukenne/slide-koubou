"""スライド工房のローカルサーバー。

役割は2つだけ:
  1. index.html をブラウザに配る
  2. 「保存」「開く」のために slides フォルダの HTML を読み書きする

このPCの中（127.0.0.1）からしかつながらない。Python 標準機能だけで動く。
使い方:  python tools/serve.py [--open]
"""
import json
import os
import re
import sys
import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SLIDES = ROOT / "slides"
PORT = 8765
MAX_BYTES = 300 * 1024 * 1024
ALLOWED_HOSTS = {f"localhost:{PORT}", f"127.0.0.1:{PORT}"}
ALLOWED_ORIGINS = {f"http://{h}" for h in ALLOWED_HOSTS}


def safe_name(raw):
    """ファイル名だけを取り出す（フォルダの外に書けないようにする）。"""
    name = os.path.basename((raw or "").replace("\\", "/")).strip()
    name = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", name)
    if not name.lower().endswith(".html"):
        name += ".html"
    if name.startswith(".") or len(name) > 150:
        return None
    return name


class Handler(BaseHTTPRequestHandler):
    server_version = "SlideKoubou/1"

    def log_message(self, fmt, *args):  # 画面をログで埋めない
        pass

    def send(self, code, body, ctype="application/json; charset=utf-8"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False)
        data = body if isinstance(body, bytes) else str(body).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def guard(self, api):
        """よそのサイトからこっそり呼ばれないようにする確認。"""
        if self.headers.get("Host", "") not in ALLOWED_HOSTS:
            self.send(403, "forbidden", "text/plain; charset=utf-8")
            return False
        if api:
            origin = self.headers.get("Origin")
            if self.headers.get("X-Slide-Koubou") != "1" or (origin and origin not in ALLOWED_ORIGINS):
                self.send(403, "forbidden", "text/plain; charset=utf-8")
                return False
        return True

    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        q = urllib.parse.parse_qs(url.query)
        api = url.path.startswith("/api/")
        if not self.guard(api):
            return
        if url.path in ("/", "/index.html"):
            self.send(200, (ROOT / "index.html").read_bytes(), "text/html; charset=utf-8")
        elif url.path == "/api/ping":
            self.send(200, {"app": "slide-koubou"})
        elif url.path == "/api/list":
            items = []
            if SLIDES.is_dir():
                for p in SLIDES.glob("*.html"):
                    st = p.stat()
                    items.append({"name": p.name, "mtime": st.st_mtime, "size": st.st_size})
            items.sort(key=lambda x: -x["mtime"])
            self.send(200, items)
        elif url.path == "/api/load":
            name = safe_name(q.get("name", [""])[0])
            path = SLIDES / name if name else None
            if not path or not path.is_file():
                self.send(404, "ファイルが見つからない", "text/plain; charset=utf-8")
            else:
                self.send(200, path.read_bytes(), "text/html; charset=utf-8")
        else:
            self.send(404, "not found", "text/plain; charset=utf-8")

    def do_POST(self):
        url = urllib.parse.urlsplit(self.path)
        q = urllib.parse.parse_qs(url.query)
        if not self.guard(True):
            return
        if url.path != "/api/save":
            self.send(404, "not found", "text/plain; charset=utf-8")
            return
        name = safe_name(q.get("name", [""])[0])
        size = int(self.headers.get("Content-Length") or 0)
        if not name or size <= 0 or size > MAX_BYTES:
            self.send(400, "ファイル名か中身がおかしい", "text/plain; charset=utf-8")
            return
        body = self.rfile.read(size)
        path = SLIDES / name
        if path.exists() and q.get("overwrite", ["0"])[0] != "1":
            self.send(409, "exists", "text/plain; charset=utf-8")
            return
        try:
            SLIDES.mkdir(exist_ok=True)
            tmp = path.with_name(path.name + ".tmp")
            tmp.write_bytes(body)      # 書きかけで壊れないよう、別名で書いてから入れ替える
            os.replace(tmp, path)
        except OSError as e:
            self.send(500, f"書き込めなかった: {e.strerror}", "text/plain; charset=utf-8")
            return
        self.send(200, {"name": name, "size": len(body)})


def main():
    url = f"http://localhost:{PORT}/"
    try:
        httpd = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError:
        print(f"もう起動しているみたい（ポート {PORT} が使用中）。ブラウザだけ開くね。")
        if "--open" in sys.argv:
            webbrowser.open(url)
        return
    print("スライド工房を起動した。")
    print(f"  ブラウザで開く: {url}")
    print("  保存先: slides フォルダ")
    print("  終わるときは、この画面を閉じる（Ctrl+C でもOK）")
    if "--open" in sys.argv:
        webbrowser.open(url)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
