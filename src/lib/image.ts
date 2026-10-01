const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
};

/**
 * ดาวน์โหลดรูปลงเครื่อง — รองรับทั้ง data URL และ URL ในระบบ (เช่น /api/avatar/<id>)
 * นามสกุลไฟล์ตั้งตามชนิดจริงของรูป
 * ถ้าดึงไม่ได้ (เช่น รูปจาก OAuth ข้ามโดเมนที่ติด CORS) จะเปิดรูปในแท็บใหม่แทน
 */
export async function downloadImage(src: string, baseName: string) {
  try {
    const response = await fetch(src);
    if (!response.ok) throw new Error(String(response.status));
    const blob = await response.blob();
    const extension = IMAGE_EXTENSIONS[blob.type] ?? "img";
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `${baseName}.${extension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    window.open(src, "_blank", "noopener,noreferrer");
  }
}

/**
 * ย่อรูปฝั่ง client ก่อนอัปโหลด — ตัดเป็นสี่เหลี่ยมจัตุรัสตรงกลาง แล้วย่อเหลือ size×size
 * ได้ data URL แบบ webp (เบราว์เซอร์ที่ไม่รองรับจะได้ jpeg แทน) ขนาดปกติไม่เกิน 80 KB
 * ใช้ได้เฉพาะในเบราว์เซอร์ (ต้องมี canvas)
 */
export async function resizeImageToDataUrl(file: File, size: number, quality = 0.85): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("validation.imageInvalid");

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("validation.imageInvalid"));
      image.src = url;
    });

    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) throw new Error("validation.imageInvalid");

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("validation.imageInvalid");

    // พื้นขาวกันส่วนโปร่งใสกลายเป็นสีดำเมื่อต้อง fallback เป็น jpeg
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      img,
      (img.naturalWidth - side) / 2,
      (img.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size,
    );

    const webp = canvas.toDataURL("image/webp", quality);
    return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}
