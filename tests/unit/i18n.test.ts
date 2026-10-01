import { describe, expect, test } from "bun:test";

import { locales, localeNames, isLocale, intlLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { translateWith } from "@/i18n/translate";

/** เก็บทุกคีย์แบบ dot path เพื่อเทียบว่าแต่ละภาษามีครบเท่ากัน */
function flatten(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "object" && value !== null
      ? flatten(value as Record<string, unknown>, path)
      : [path];
  });
}

describe("dictionaries", () => {
  const thKeys = flatten(dictionaries.th).sort();

  test("รองรับ 4 ภาษา: ไทย ลาว อังกฤษ จีน", () => {
    expect(locales).toEqual(["th", "lo", "en", "zh"]);
    expect(Object.keys(localeNames)).toHaveLength(4);
    expect(Object.keys(intlLocale)).toHaveLength(4);
  });

  for (const locale of locales) {
    test(`[${locale}] มีคีย์ครบเท่ากับภาษาไทย`, () => {
      expect(flatten(dictionaries[locale]).sort()).toEqual(thKeys);
    });

    test(`[${locale}] ไม่มีค่าว่าง`, () => {
      const empty = flatten(dictionaries[locale]).filter(
        (key) => translateWith(dictionaries[locale], key).trim() === "",
      );
      expect(empty).toEqual([]);
    });

    test(`[${locale}] ข้อความที่มีตัวแปร {name}/{total} ต้องมีครบเหมือนต้นฉบับ`, () => {
      const withParams = ["products.deleteDesc", "table.showing", "table.pageOf"];

      for (const key of withParams) {
        const source = translateWith(dictionaries.th, key).match(/\{(\w+)\}/g) ?? [];
        const target = translateWith(dictionaries[locale], key).match(/\{(\w+)\}/g) ?? [];
        expect(target.sort()).toEqual(source.sort());
      }
    });
  }
});

describe("translateWith", () => {
  test("แปลคีย์ dot path", () => {
    expect(translateWith(dictionaries.en, "common.save")).toBe("Save");
    expect(translateWith(dictionaries.zh, "common.save")).toBe("保存");
    expect(translateWith(dictionaries.lo, "nav.products")).toBe("ສິນຄ້າ");
  });

  test("แทนค่าตัวแปรในข้อความ", () => {
    expect(translateWith(dictionaries.en, "table.showing", { from: 1, to: 10, total: 95 })).toBe(
      "Showing 1–10 of 95",
    );
    expect(translateWith(dictionaries.th, "products.deleteDesc", { name: "เก้าอี้" })).toContain(
      "เก้าอี้",
    );
  });

  test("คีย์ที่ไม่มี → คืนค่าคีย์เดิม (เห็นชัดว่าลืมแปล)", () => {
    expect(translateWith(dictionaries.th, "ไม่มีคีย์นี้")).toBe("ไม่มีคีย์นี้");
    expect(translateWith(dictionaries.th, "products.notExist")).toBe("products.notExist");
  });

  test("ข้อความธรรมดาที่ไม่ใช่คีย์ ส่งผ่านได้ไม่พัง", () => {
    expect(translateWith(dictionaries.th, "ข้อความตรง ๆ")).toBe("ข้อความตรง ๆ");
  });
});

describe("isLocale", () => {
  test("รับเฉพาะภาษาที่รองรับ", () => {
    expect(isLocale("th")).toBe(true);
    expect(isLocale("zh")).toBe(true);
    expect(isLocale("jp")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});
