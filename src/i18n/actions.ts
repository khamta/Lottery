"use server";

import { cookies } from "next/headers";

import { isLocale, LOCALE_COOKIE, type Locale } from "./config";

/** บันทึกภาษาที่เลือกลง cookie (อายุ 1 ปี) */
export async function setLocaleCookie(locale: Locale) {
  if (!isLocale(locale)) return;

  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
