"""
บริการอ่านตัวหนังสือจากรูปโพย (OCR) — ฟรี รันในเครื่อง ไม่ส่งรูปออกไปไหน

  POST /ocr     body = ไฟล์รูป (jpeg/png/webp)  →  JSON ผลของ 2 เครื่องมือ
  GET  /health  → {"ok": true}

  paddle     PaddleOCR (PP-OCRv6 ผ่าน RapidOCR + onnxruntime) — อ่านลายมือได้ดีกว่า
             คืนเป็นกล่องข้อความพร้อมพิกัด เพื่อให้ฝั่ง TypeScript จัดแถว/คอลัมน์เอง
  tesseract  Tesseract (eng+tha+lao) — อ่านรูปแคปหน้าจอแชตได้ดี และอ่านคำลาว/ไทย (ລ່າງ, ລວມ) ได้
             คืนเป็นบรรทัดตามที่ Tesseract จัดให้

บริการนี้แค่อ่านตัวหนังสือ ไม่ตีความโพย — การแปลงเป็นข้อความโพยอยู่ที่ src/lottery/image-text.ts
"""

import json
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from rapidocr import RapidOCR

# รูปจาก WhatsApp ไม่เกินราว 2 MB — กันรูปผิดปกติกินหน่วยความจำ
MAX_BYTES = 15 * 1024 * 1024
TESSERACT_LANGS = "eng+tha+lao"
TESSERACT_TIMEOUT_S = 60

# ค่าเริ่มต้นของ rapidocr 3.9 = PP-OCRv6 รุ่นเล็ก (~5 วินาที/รูปบน CPU) — โมเดลรุ่น server ช้ากว่า 20-30 เท่า (90-170 วินาที/รูป)
paddle = RapidOCR()
# โมเดลใช้ CPU เต็มที่อยู่แล้ว อ่านทีละรูปพอ (และ engine ไม่รับประกันว่าใช้ข้าม thread ได้)
lock = threading.Lock()


def run_paddle(image: bytes):
    result = paddle(image)
    if result.txts is None:
        return []
    return [
        {"box": [[round(float(x)), round(float(y))] for x, y in box], "text": text, "score": round(float(score), 3)}
        for box, text, score in zip(result.boxes, result.txts, result.scores)
    ]


def run_tesseract(image: bytes):
    """บรรทัดตามลำดับที่ Tesseract อ่าน พร้อมความมั่นใจเฉลี่ยของคำในบรรทัด (0-100)"""
    done = subprocess.run(
        ["tesseract", "stdin", "stdout", "-l", TESSERACT_LANGS, "--psm", "6", "tsv"],
        input=image,
        capture_output=True,
        timeout=TESSERACT_TIMEOUT_S,
    )
    if done.returncode != 0:
        raise RuntimeError(done.stderr.decode("utf-8", "replace")[:300])

    lines: dict[tuple[int, int, int], list[tuple[str, float]]] = {}
    rows = done.stdout.decode("utf-8", "replace").splitlines()
    for row in rows[1:]:
        cols = row.split("\t")
        if len(cols) < 12 or cols[0] != "5" or not cols[11].strip():
            continue
        key = (int(cols[2]), int(cols[3]), int(cols[4]))  # block, paragraph, line
        lines.setdefault(key, []).append((cols[11], float(cols[10])))

    return [
        {"text": " ".join(word for word, _ in words), "conf": round(sum(c for _, c in words) / len(words), 1)}
        for _, words in sorted(lines.items())
    ]


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body: dict):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/health":
            return self._send(200, {"ok": True})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/ocr":
            return self._send(404, {"error": "not found"})
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BYTES:
            return self._send(413, {"error": "image size"})
        image = self.rfile.read(length)

        body: dict = {"paddle": [], "tesseract": [], "errors": []}
        with lock:
            try:
                body["paddle"] = run_paddle(image)
            except Exception as error:  # รูปเสีย/อ่านไม่ได้ — ยังลองอีกเครื่องมือ
                body["errors"].append(f"paddle: {error}")
            try:
                body["tesseract"] = run_tesseract(image)
            except Exception as error:
                body["errors"].append(f"tesseract: {error}")
        self._send(200, body)

    def log_message(self, format, *args):  # noqa: A002 — ชื่อตาม BaseHTTPRequestHandler
        pass


if __name__ == "__main__":
    print("OCR พร้อมที่พอร์ต 8000", flush=True)
    ThreadingHTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
