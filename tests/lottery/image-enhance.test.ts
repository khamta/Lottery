import { afterEach, describe, expect, test } from "bun:test";
import sharp from "sharp";

import { autoAdjustSlipImage, enhanceSlipImage } from "@/lottery/image-enhance";
import { boldInkPixels, inkKnee, inkTable } from "@/lottery/ink";

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


/** ความสว่างของพื้นกระดาษ (มุมซ้ายบน) และหมึก (กลางแถบ) */
async function samples(data: Uint8Array) {
  const { data: px, info } = await sharp(data).greyscale().raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => px[y * info.width + x]!;
  return { paper: at(5, 5), ink: at(Math.round(info.width / 2), Math.round(info.height / 2) + 10) };
}

describe("ink.ts — หมึกเข้มและหนาขึ้น ไม่ปรับแสง", () => {
  test("จุดตัดหมึก = 80% ของกระดาษ · รูปมืดทั้งรูป/ว่างไม่ปรับ", () => {
    const histogram = new Uint32Array(256);
    histogram[200] = 90;
    histogram[40] = 10;
    expect(inkKnee(histogram)).toBe(160);
    expect(inkKnee(new Uint32Array(256))).toBeNull();
    const dark = new Uint32Array(256);
    dark[30] = 100;
    expect(inkKnee(dark)).toBeNull();
  });

  test("ตาราง: ต่ำกว่าจุดตัดมืดลง · ตั้งแต่จุดตัดขึ้นไปคงเดิม", () => {
    const table = inkTable(160);
    expect(table[80]).toBe(40);
    expect(table[0]).toBe(0);
    expect(table[160]).toBe(160);
    expect(table[230]).toBe(230);
  });

  test("เส้นหมึกกว้าง 1px → 3px และเข้มขึ้น กระดาษคงเดิม", () => {
    const width = 7;
    const height = 3;
    const pixels = new Uint8Array(width * height * 3).fill(220);
    for (let y = 0; y < height; y++) pixels.fill(100, (y * width + 3) * 3, (y * width + 4) * 3);
    expect(boldInkPixels(pixels, width, height, 3)).toBe(true);
    const row = [...pixels.slice(width * 3, width * 6)].filter((_, i) => i % 3 === 0);
    expect(row).toEqual([220, 220, 57, 57, 57, 220, 220]);
  });
});

describe("enhanceSlipImage", () => {
  const original = process.env.OCR_ENHANCE;
  afterEach(() => {
    if (original === undefined) delete process.env.OCR_ENHANCE;
    else process.env.OCR_ENHANCE = original;
  });

  test("รูปมืด → แสงไม่เปลี่ยน (กระดาษเท่าเดิม) หมึกเข้มขึ้น", async () => {
    const dark = await slipPhoto(120, 70);
    const before = await samples(dark);
    const out = await enhanceSlipImage(dark, "image/jpeg");
    const after = await samples(out.data);

    expect(out.mimeType).toBe("image/jpeg");
    expect(Math.abs(after.paper - before.paper)).toBeLessThanOrEqual(3);
    expect(after.ink).toBeLessThan(before.ink - 15);
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

  test("แสงไม่เปลี่ยน หมึกเข้มขึ้น ขนาดเท่าเดิม เป็น JPEG", async () => {
    const photo = await slipPhoto(200, 140);
    const before = await samples(photo);
    const out = await autoAdjustSlipImage(photo, "image/jpeg");
    const after = await samples(out.data);

    expect(out.mimeType).toBe("image/jpeg");
    expect(Math.abs(after.paper - before.paper)).toBeLessThanOrEqual(3);
    expect(after.ink).toBeLessThan(before.ink - 15);
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
