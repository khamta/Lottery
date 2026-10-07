import { afterEach, describe, expect, test } from "bun:test";
import sharp from "sharp";

import { autoAdjustSlipImage, brightnessFactor, claheSlope, enhanceSlipImage } from "@/lottery/image-enhance";

/** รูปโพยจำลอง: พื้นสีเดียว + แถบหมึก — background/ink = ความสว่าง 0-255 */
async function slipPhoto(background: number, ink: number, width = 400, height = 300) {
  const stroke = await sharp({ create: { width: width / 2, height: 20, channels: 3, background: { r: ink, g: ink, b: ink } } })
    .png()
    .toBuffer();
  const jpeg = await sharp({ create: { width, height, channels: 3, background: { r: background, g: background, b: background } } })
    .composite([{ input: stroke, top: height / 2, left: width / 4 }])
    .jpeg()
    .toBuffer();
  return new Uint8Array(jpeg);
}

const statsOf = async (data: Uint8Array) => (await sharp(data).greyscale().stats()).channels[0]!;

describe("ค่าปรับตามสภาพรูป", () => {
  test("รูปมืดเพิ่มแสง · รูปจ้าไม่ลดแสง (พื้นขาวไม่กลายเป็นเทา) · ใกล้เป้าแล้วไม่ปรับ", () => {
    expect(brightnessFactor(60)).toBe(1.4);
    expect(brightnessFactor(120)).toBeCloseTo(1.25);
    expect(brightnessFactor(0)).toBe(1.4);
    expect(brightnessFactor(240)).toBe(1);
    expect(brightnessFactor(150)).toBe(1);
  });

  test("รูปซีดดึงคอนทราสต์แรงกว่า", () => {
    expect(claheSlope(20)).toBeGreaterThan(claheSlope(80));
  });
});

describe("enhanceSlipImage", () => {
  const original = process.env.OCR_ENHANCE;
  afterEach(() => {
    if (original === undefined) delete process.env.OCR_ENHANCE;
    else process.env.OCR_ENHANCE = original;
  });

  test("รูปมืด → สว่างขึ้นและหมึกต่างจากพื้นชัดขึ้น", async () => {
    const dark = await slipPhoto(70, 40);
    const before = await statsOf(dark);

    const out = await enhanceSlipImage(dark, "image/jpeg");
    const after = await statsOf(out.data);

    expect(out.mimeType).toBe("image/jpeg");
    expect(after.mean).toBeGreaterThan(before.mean);
    expect(after.stdev).toBeGreaterThan(before.stdev);
  });

  test("รูปซีด → คอนทราสต์สูงขึ้น", async () => {
    const faded = await slipPhoto(200, 170);
    const out = await enhanceSlipImage(faded, "image/jpeg");
    expect((await statsOf(out.data)).stdev).toBeGreaterThan((await statsOf(faded)).stdev);
  });

  // รูปแถบยาวเตี้ย ๆ พอให้ย่อ แต่ประมวลผลเร็ว — runner ของ CI ช้า (รูป 4000×3000 เคยเกิน 5 วินาที)
  test("รูปใหญ่ → ย่อด้านยาวเหลือ 2000px · รูปเล็กไม่ขยาย", async () => {
    const big = await enhanceSlipImage(await slipPhoto(200, 30, 2400, 200), "image/jpeg");
    expect(await sharp(big.data).metadata()).toMatchObject({ width: 2000, height: 167 });
    const small = await enhanceSlipImage(await slipPhoto(200, 30), "image/jpeg");
    expect(await sharp(small.data).metadata()).toMatchObject({ width: 400, height: 300 });
  }, 30_000);

  test("รูปเสีย / gif / ปิดด้วย OCR_ENHANCE=0 → ส่งรูปเดิม", async () => {
    const broken = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    expect(await enhanceSlipImage(broken, "image/jpeg")).toEqual({ data: broken, mimeType: "image/jpeg" });

    const photo = await slipPhoto(70, 40);
    expect((await enhanceSlipImage(photo, "image/gif")).data).toBe(photo);
    process.env.OCR_ENHANCE = "0";
    expect((await enhanceSlipImage(photo, "image/jpeg")).data).toBe(photo);
  });
});

describe("autoAdjustSlipImage (ปรับรูปต้นฉบับก่อนให้คนตรวจ)", () => {
  const original = process.env.IMAGE_AUTO_ADJUST;
  afterEach(() => {
    if (original === undefined) delete process.env.IMAGE_AUTO_ADJUST;
    else process.env.IMAGE_AUTO_ADJUST = original;
  });

  test("รูปมืด/ซีด → สว่างขึ้น คอนทราสต์สูงขึ้น ขนาดเท่าเดิม เป็น JPEG", async () => {
    const dark = await slipPhoto(70, 40);
    const before = await statsOf(dark);
    const out = await autoAdjustSlipImage(dark, "image/jpeg");
    const after = await statsOf(out.data);

    expect(out.mimeType).toBe("image/jpeg");
    expect(after.mean).toBeGreaterThan(before.mean);
    expect(after.stdev).toBeGreaterThan(before.stdev);
    expect(await sharp(out.data).metadata()).toMatchObject({ width: 400, height: 300 });
  });

  test("รูปเสีย / gif / ปิดด้วย IMAGE_AUTO_ADJUST=0 → รูปเดิม", async () => {
    const broken = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    expect(await autoAdjustSlipImage(broken, "image/jpeg")).toEqual({ data: broken, mimeType: "image/jpeg" });

    const photo = await slipPhoto(70, 40);
    expect((await autoAdjustSlipImage(photo, "image/gif")).data).toBe(photo);
    process.env.IMAGE_AUTO_ADJUST = "0";
    expect((await autoAdjustSlipImage(photo, "image/jpeg")).data).toBe(photo);
  });
});
