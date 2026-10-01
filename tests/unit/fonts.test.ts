import { describe, expect, test } from "bun:test";

/**
 * fonts.ts import next/font ซึ่งรันนอก Next ไม่ได้ จึงตรวจที่ตัวไฟล์แทน
 * สิ่งที่ต้องคงไว้: ชุดฟอนต์ "ชุดเดียว" เรียงตามลำดับที่ทำให้เบราว์เซอร์
 * เลือกฟอนต์ได้ถูกต้องรายตัวอักษร (ไม่ผูกกับภาษาที่เลือกใน UI)
 */
const fonts = await Bun.file("src/app/fonts.ts").text();
const css = await Bun.file("src/app/globals.css").text();
const layout = await Bun.file("src/app/layout.tsx").text();

const stack = fonts.slice(fonts.indexOf("export const appFontStack"));
const indexOf = (needle: string) => stack.indexOf(needle);

describe("ชุดฟอนต์ (เลือกตามตัวอักษร ไม่ใช่ตามภาษา)", () => {
  test("มีฟอนต์ของครบทุกภาษาในชุดเดียว", () => {
    expect(stack).toContain('"Times New Roman"');
    expect(stack).toContain("--font-sarabun");
    expect(stack).toContain('"Phetsarath OT"');
    expect(stack).toContain("--font-noto-sc");
  });

  test("ลำดับถูกต้อง: อังกฤษ → ไทย → ลาว → จีน", () => {
    expect(indexOf('"Times New Roman"')).toBeLessThan(indexOf("--font-sarabun"));
    expect(indexOf("--font-sarabun")).toBeLessThan(indexOf('"Phetsarath OT"'));
    expect(indexOf('"Phetsarath OT"')).toBeLessThan(indexOf("--font-noto-sc"));
  });

  test("มีฟอนต์สำรองของระบบต่อท้าย", () => {
    expect(indexOf("system-ui")).toBeGreaterThan(indexOf("--font-noto-sc"));
    expect(stack).toContain("sans-serif");
  });

  test("ไม่ผูกฟอนต์กับภาษาที่เลือก (ต้องไม่มีกฎ html[lang=...] ของฟอนต์)", () => {
    expect(css).not.toContain('html[lang="th"]');
    expect(css).not.toContain('html[lang="lo"]');
    expect(css).not.toContain('html[lang="en"]');
    expect(css).not.toContain('html[lang="zh"]');
  });

  test("globals.css มีชุดสำรองที่เรียงลำดับเหมือนกัน", () => {
    const root = css.slice(css.indexOf("--font-app-sans"));
    expect(root.indexOf('"Times New Roman"')).toBeLessThan(root.indexOf("--font-sarabun"));
    expect(root.indexOf("--font-sarabun")).toBeLessThan(root.indexOf('"Phetsarath OT"'));
  });

  test("ตัวแปรฟอนต์ถูกผูกที่ <html> ไม่ใช่ <body>", () => {
    const code = layout.replace(/^\s*\/\/.*$/gm, "");
    const htmlTag = code.slice(code.indexOf("<html"), code.indexOf("<body"));
    const bodyTag = code.slice(code.indexOf("<body"), code.indexOf(">", code.indexOf("<body")));

    expect(htmlTag).toContain("fontVariables");
    expect(htmlTag).toContain("--font-app-sans");
    expect(bodyTag).not.toContain("--font-app-sans");
  });

  test("body ใช้ตัวแปร --font-app-sans โดยตรง", () => {
    expect(css).toContain("font-family: var(--font-app-sans)");
  });
});
