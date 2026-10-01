import { locales, type Locale } from "../config";
import { moduleMessages } from "../modules";
import type { DeepString } from "../modules/define";
import { th, type CoreDictionary } from "./th";
import { lo } from "./lo";
import { en } from "./en";
import { zh } from "./zh";

const core: Record<Locale, CoreDictionary> = { th, lo, en, zh };

type UnionToIntersection<U> = (U extends unknown ? (arg: U) => void : never) extends (
  arg: infer I,
) => void
  ? I
  : never;

type ModuleDictionary = DeepString<UnionToIntersection<(typeof moduleMessages)[number]["th"]>>;

/** ข้อความกลางของ template + ข้อความของทุก module ที่ลงทะเบียนใน src/i18n/modules */
export type Dictionary = CoreDictionary & ModuleDictionary;
export type { CoreDictionary };

type Tree = { [key: string]: string | Tree };

/** รวมแบบลึก — คีย์ของ module ทับคีย์กลางได้ (ใช้เปลี่ยนถ้อยคำของ template โดยไม่ต้องแก้ไฟล์กลาง) */
export function mergeMessages(base: Tree, extra: Tree): Tree {
  const result: Tree = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    const current = result[key];
    result[key] =
      typeof value === "object" && typeof current === "object" ? mergeMessages(current, value) : value;
  }
  return result;
}

export const dictionaries = Object.fromEntries(
  locales.map((locale) => [
    locale,
    moduleMessages.reduce<Tree>(
      (acc, messages) => mergeMessages(acc, messages[locale] as Tree),
      core[locale] as unknown as Tree,
    ),
  ]),
) as unknown as Record<Locale, Dictionary>;

export { core as coreDictionaries };
