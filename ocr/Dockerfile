# บริการ OCR ของบอท (ดู server.py) — Python + PaddleOCR (onnxruntime, CPU) + Tesseract
FROM python:3.11-slim

# libgl1/libglib2.0-0 = opencv · tesseract-ocr-* = ชุดภาษาที่ Tesseract ใช้
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     libgl1 libglib2.0-0 tesseract-ocr tesseract-ocr-eng tesseract-ocr-tha tesseract-ocr-lao \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /ocr
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .
# โหลดโมเดลตอน build — container ไม่ต้องต่ออินเทอร์เน็ตตอนรัน
RUN python -c "import server"

ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["python", "server.py"]
