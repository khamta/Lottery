import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  { ignores: [".next/**", "node_modules/**", "src/generated/**", "scaffold/**"] },
  // กฎของ template (AGENTS.md) ที่เห็นได้ตั้งแต่ตอนพิมพ์ — ตรวจซ้ำใน tests/conventions/
  {
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [{ name: "sonner", message: "ใช้ notify / handleResult จาก @/lib/notify (AGENTS.md ข้อ 8)" }] },
      ],
    },
  },
  {
    files: ["src/lib/notify.ts", "src/components/ui/sonner.tsx"],
    rules: { "no-restricted-imports": "off" },
  },
];

export default eslintConfig;
