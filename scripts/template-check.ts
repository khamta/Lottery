/**
 * ตรวจว่า project แก้ไฟล์ core ของ template ไปหรือไม่ (เทียบกับ remote "template")
 *
 *   bun run template:check              # เทียบกับ template/main
 *   bun run template:check template/v1.2.0
 *
 * ไฟล์ core ที่ถูกแก้ = จะชนตอน merge อัปเดตของ template
 * ถ้าแก้เพราะ template มีบั๊กหรือขาดความสามารถ ให้ส่งการแก้กลับไปที่ repo template แทน
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";

import { ROOT } from "./scaffold";

const manifest = JSON.parse(readFileSync(join(ROOT, "template.json"), "utf8")) as {
  version: string;
  core: string[];
};
const ref = process.argv[2] ?? "template/main";

function git(...args: string[]) {
  const result = Bun.spawnSync(["git", ...args], { cwd: ROOT });
  return { ok: result.exitCode === 0, out: result.stdout.toString().trim() };
}

if (!git("rev-parse", "--verify", "--quiet", ref).ok) {
  console.error(`✗ ไม่พบ ${ref} — ตั้งค่า remote ก่อน (ดู docs/EXTENDING.md หัวข้อ 4):
  git remote add template <url ของ repo template>
  git fetch template`);
  process.exit(1);
}

const upstream = JSON.parse(git("show", `${ref}:template.json`).out || "{}") as { version?: string };
console.log(`template ของ project: v${manifest.version} · ${ref}: v${upstream.version ?? "?"}`);

// เทียบจากจุดที่ merge template ครั้งล่าสุด → เห็นเฉพาะที่ project แก้เอง (รวมไฟล์ที่ยังไม่ commit)
// ไม่รวมไฟล์ที่ template เปลี่ยนแต่ project ยังไม่ได้ merge
const base = git("merge-base", "HEAD", ref);
if (!base.ok) {
  console.error(`✗ project นี้ไม่มีประวัติร่วมกับ ${ref} — ดูวิธีเชื่อม project เดิมใน docs/EXTENDING.md หัวข้อ 4`);
  process.exit(1);
}
const changed = git("diff", "--name-only", base.out, "--", ".").out.split("\n").filter(Boolean);
const globs = manifest.core.map((pattern) => new Glob(pattern));
const touched = changed.filter((file) => globs.some((glob) => glob.match(file)));

if (touched.length === 0) {
  console.log("✓ ไม่ได้แก้ไฟล์ core — merge อัปเดตของ template ได้สะอาด");
} else {
  console.log(`! ไฟล์ core ที่ project แก้เองหลัง merge template ครั้งล่าสุด (${touched.length} ไฟล์):`);
  for (const file of touched) console.log(`  - ${file}`);
  console.log("\nถ้าเป็นการแก้ของ project เอง ให้ย้ายไปใช้จุดต่อขยาย (docs/EXTENDING.md หัวข้อ 2)");
  console.log("ถ้าเป็นบั๊กหรือความสามารถที่ทุกระบบควรได้ ให้ส่งกลับไปที่ repo template");
}
