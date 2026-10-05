"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

import { rememberedQuery } from "../groups";
import { ticketFiltersCookie } from "../types";

/** จำไว้ 1 ปี */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * จำตัวกรองของหน้าโพย (งวด / กลุ่ม / สถานะ / คำค้น / จำนวนต่อหน้า / การเรียง) ไว้ใน cookie ทุกครั้งที่ URL เปลี่ยน
 * ไปหน้าอื่นแล้วกดเมนูโพยกลับมา (/tickets เปล่า ๆ) page.tsx อ่าน cookie นี้แล้ว redirect กลับไปที่ตัวกรองเดิม
 * ใช้ cookie ไม่ใช่ localStorage เพื่อให้ server พาไปถูกที่ตั้งแต่แรก ไม่มีจังหวะเห็นหน้าที่ไม่ได้กรองก่อน
 */
export function RememberTicketFilters({ dealerId }: { dealerId: string }) {
  const searchParams = useSearchParams();
  const query = rememberedQuery(searchParams);

  React.useEffect(() => {
    document.cookie = `${ticketFiltersCookie(dealerId)}=${encodeURIComponent(query)}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax`;
  }, [dealerId, query]);

  return null;
}
