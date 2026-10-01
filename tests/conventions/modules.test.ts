import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { Glob } from "bun";

/**
 * เทสต์ "สัญญา" ของ template — ตรวจโค้ดทุก module (ทั้งของ template และที่ project เพิ่มเอง)
 * ว่ายังเป็นรูปแบบเดียวกันตาม AGENTS.md ไฟล์นี้เป็นของ template ห้ามแก้ใน project
 * ถ้าต้องยกเว้นจริง ๆ ให้ใส่ป้ายในไฟล์นั้นพร้อมเหตุผล (เช่น @audit-exempt) แทนการแก้เทสต์
 */
const ROOT = join(import.meta.dir, "..", "..");
const DASHBOARD = join(ROOT, "src", "app", "(dashboard)");

const read = (path: string) => readFileSync(path, "utf8").replaceAll("\r\n", "\n");
const rel = (path: string) => relative(ROOT, path).replaceAll("\\", "/");
const files = (pattern: string) =>
  [...new Glob(pattern).scanSync({ cwd: ROOT, absolute: true })].sort();

/** ตัดคอมเมนต์ออก (กันคำอธิบายภาษาไทยในคอมเมนต์ถูกนับเป็นข้อความบน UI) */
function stripComments(source: string) {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

/** module ที่เป็นหน้ารายการ = โฟลเดอร์ใน (dashboard) ที่ page.tsx เรียก paginate() */
const listModules = readdirSync(DASHBOARD, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(DASHBOARD, entry.name))
  .filter((dir) => existsSync(join(dir, "page.tsx")) && /\bpaginate\b/.test(read(join(dir, "page.tsx"))));

describe("หน้ารายการ (list module)", () => {
  test("มี module ให้ตรวจ", () => {
    expect(listModules.length).toBeGreaterThan(0);
  });

  for (const dir of listModules) {
    const name = rel(dir);

    test(`${name}: มี page.tsx / loading.tsx / types.ts ครบ`, () => {
      const missing = ["page.tsx", "loading.tsx", "types.ts"].filter((f) => !existsSync(join(dir, f)));
      expect(missing).toEqual([]);
    });

    test(`${name}: page.tsx อ่านค่าตารางจาก URL ด้วย parseListParams`, () => {
      expect(read(join(dir, "page.tsx"))).toContain("parseListParams(");
    });

    test(`${name}: types.ts ประกาศ *_SORTABLE (whitelist คอลัมน์ที่เรียงได้)`, () => {
      expect(read(join(dir, "types.ts"))).toMatch(/export const \w+_SORTABLE\b/);
    });

    if (existsSync(join(dir, "actions.ts"))) {
      test(`${name}: view ที่เรียก action ใช้ useOptimisticList`, () => {
        const views = files(`${rel(dir)}/_components/*.tsx`).filter((f) => read(f).includes("../actions"));
        expect(views.length).toBeGreaterThan(0);
        for (const view of views) expect([rel(view), read(view).includes("useOptimisticList(")]).toEqual([rel(view), true]);
      });
    }
  }
});

describe("server actions", () => {
  const actionFiles = files("src/app/**/actions.ts");
  const WRITE = /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/;

  for (const file of actionFiles) {
    const name = rel(file);
    const source = read(file);
    const code = stripComments(source);

    test(`${name}: ขึ้นต้นด้วย "use server"`, () => {
      expect(code.trimStart().startsWith('"use server"')).toBe(true);
    });

    test(`${name}: ทุก export สร้างด้วย createAction()`, () => {
      const exported = [...code.matchAll(/export (?:async function|const|function) (\w+)\s*=?\s*(\w+)?/g)];
      const notWrapped = exported.filter((m) => m[2] !== "createAction").map((m) => m[1]);
      expect(notWrapped).toEqual([]);
    });

    // ตรวจทีละ action (ตั้งแต่ export หนึ่งถึง export ถัดไป) ไม่ใช่ทั้งไฟล์
    const actions = code
      .split(/(?=^export )/m)
      .filter((block) => block.startsWith("export "))
      .map((block) => ({ name: block.match(/export \S+ (?:function )?(\w+)/)?.[1] ?? "?", block }));

    if (name.startsWith("src/app/(dashboard)/")) {
      test(`${name}: ทุก action เช็คสิทธิ์ด้วย requireUser() / requireRole()`, () => {
        const unchecked = actions.filter((a) => !/require(User|Role)\(/.test(a.block)).map((a) => a.name);
        expect(unchecked).toEqual([]);
      });
    }

    if (!source.includes("@audit-exempt")) {
      test(`${name}: ทุก action ที่เขียนข้อมูลอยู่ใน $transaction() พร้อม logAudit(tx)`, () => {
        const unaudited = actions
          .filter((a) => WRITE.test(a.block))
          .filter((a) => !a.block.includes("$transaction(") || !/logAudit(Many)?\(\s*tx\b/.test(a.block))
          .map((a) => a.name);
        expect(unaudited).toEqual([]);
      });
    }
  }
});

describe("ของกลางที่ห้ามทำซ้ำ", () => {
  const source = files("src/**/*.{ts,tsx}");

  test('ไม่ import "sonner" ตรง ๆ (ใช้ notify / handleResult)', () => {
    const allowed = ["src/lib/notify.ts", "src/components/ui/sonner.tsx"];
    const offenders = source
      .filter((f) => !allowed.includes(rel(f)))
      .filter((f) => /from ["']sonner["']/.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  test("ไม่ใช้สีตายตัวของ Tailwind (ใช้ token เช่น bg-primary)", () => {
    const palette =
      /\b(?:bg|text|border|ring|fill|stroke|from|to|via)-(?:red|blue|green|yellow|gray|slate|zinc|neutral|stone|orange|amber|lime|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;
    const offenders = source
      .filter((f) => f.endsWith(".tsx") && !rel(f).startsWith("src/components/ui/"))
      .filter((f) => palette.test(stripComments(read(f))))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  test("ไม่เขียนข้อความภาษาไทย / ลาว / จีนลง UI ตรง ๆ (ใช้คีย์ i18n)", () => {
    const script = /[฀-໿一-鿿]/;
    const offenders = files("src/{app,components,hooks,config}/**/*.{ts,tsx}").flatMap((f) =>
      stripComments(read(f))
        .split("\n")
        .map((line, i) => ({ line, at: `${rel(f)}:${i + 1}` }))
        // ข้อความ error สำหรับนักพัฒนา (throw new Error) ไม่ได้แสดงให้ผู้ใช้เห็น
        .filter(({ line }) => script.test(line) && !line.includes("throw new Error("))
        .map(({ at }) => at),
    );
    expect(offenders).toEqual([]);
  });
});
