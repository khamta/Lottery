import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { locales } from "@/i18n/config";
import { coreDictionaries, dictionaries, mergeMessages } from "@/i18n/dictionaries";
import { moduleMessages } from "@/i18n/modules";

/** ข้อความของ module (src/i18n/modules) ต้องลงทะเบียนครบ และไม่ชนกันเอง — ไฟล์นี้เป็นของ template */
const MODULES_DIR = join(import.meta.dir, "..", "..", "src", "i18n", "modules");

function flatten(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "object" && value !== null
      ? flatten(value as Record<string, unknown>, path)
      : [path];
  });
}

describe("ข้อความของ module", () => {
  test("ทุกไฟล์ใน src/i18n/modules ถูกลงทะเบียนใน index.ts", () => {
    const index = readFileSync(join(MODULES_DIR, "index.ts"), "utf8");
    const unregistered = readdirSync(MODULES_DIR)
      .filter((f) => f.endsWith(".ts") && !["index.ts", "define.ts"].includes(f))
      .map((f) => f.replace(/\.ts$/, ""))
      .filter((name) => !index.includes(`from "./${name}"`));
    expect(unregistered).toEqual([]);
  });

  test("สอง module ไม่ประกาศคีย์เดียวกัน (กันข้อความทับกันโดยไม่ตั้งใจ)", () => {
    const seen = new Map<string, number>();
    const duplicates: string[] = [];
    moduleMessages.forEach((messages, i) => {
      for (const key of flatten(messages.th)) {
        if (seen.has(key) && seen.get(key) !== i) duplicates.push(key);
        seen.set(key, i);
      }
    });
    expect(duplicates).toEqual([]);
  });

  test("ทุกภาษามีคีย์ครบทั้งข้อความกลางและของ module", () => {
    const thKeys = flatten(dictionaries.th).sort();
    for (const locale of locales) expect(flatten(dictionaries[locale]).sort()).toEqual(thKeys);
    expect(thKeys.length).toBeGreaterThan(flatten(coreDictionaries.th).length);
  });
});

describe("mergeMessages", () => {
  test("รวมแบบลึก ไม่แก้ object ต้นฉบับ", () => {
    const base = { nav: { a: "A" }, x: "X" };
    const merged = mergeMessages(base, { nav: { b: "B" } });
    expect(merged).toEqual({ nav: { a: "A", b: "B" }, x: "X" });
    expect(base).toEqual({ nav: { a: "A" }, x: "X" });
  });

  test("module ทับถ้อยคำกลางได้ (เปลี่ยนข้อความของ template โดยไม่แก้ไฟล์กลาง)", () => {
    expect(mergeMessages({ auth: { t: "เดิม" } }, { auth: { t: "ใหม่" } })).toEqual({ auth: { t: "ใหม่" } });
  });
});
