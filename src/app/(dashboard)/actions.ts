"use server";

import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { createAction } from "@/lib/action";

/**
 * heartbeat บอกระบบว่าผู้ใช้คนนี้ยังเปิดใช้งานอยู่ — เรียกจาก `<PresenceHeartbeat />` เท่านั้น
 *
 * ข้อยกเว้นจากกฎ audit log (AGENTS.md ข้อ 2.3): นี่คือสถานะการเชื่อมต่อ ไม่ใช่การแก้ข้อมูลธุรกิจ
 * ถ้าบันทึก audit ทุกนาทีจะท่วมตาราง audit_logs จนอ่านไม่ได้
 *
 * @audit-exempt — ป้ายนี้บอกเทสต์ tests/conventions ว่าไฟล์นี้ยกเว้นกฎ audit โดยตั้งใจ (ต้องเขียนเหตุผลกำกับเสมอ)
 */
export const heartbeat = createAction(z.object({}), async () => {
  const user = await requireUser();
  await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
  return null;
});
