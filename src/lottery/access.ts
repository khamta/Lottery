import { prisma } from "@/lib/prisma";

/**
 * สิทธิ์การเห็นข้อมูลของบัญชี — อ่านจากฐานข้อมูลทุกครั้ง ไม่เชื่อ role ใน JWT
 * (JWT อยู่ได้ 30 วัน: ถ้าผู้ดูแลลดสิทธิ์หรือปิดบัญชี ต้องมีผลทันที ไม่ต้องรอผู้ใช้ login ใหม่)
 *
 *  - USER  เห็น/แก้เฉพาะข้อมูลของตัวเอง (แม่หวยและบัญชี WhatsApp ที่ ownerId = ตัวเอง)
 *  - ADMIN เห็น/แก้ข้อมูลของทุกบัญชี
 *  - บัญชีที่ถูกปิดใช้งาน (isActive = false) ใช้อะไรไม่ได้เลย
 */
export type Access = { userId: string; isAdmin: boolean };

export const ACCOUNT_DISABLED_PATH = "/account-disabled";

/** null = ไม่พบบัญชีหรือถูกปิดใช้งาน */
export async function findAccess(userId: string): Promise<Access | null> {
  const account = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, isActive: true } });
  if (!account?.isActive) return null;
  return { userId, isAdmin: account.role === "ADMIN" };
}

/** ใช้ใน server action — บัญชีถูกปิด = UNAUTHORIZED */
export async function requireAccess(userId: string): Promise<Access> {
  const access = await findAccess(userId);
  if (!access) throw new Error("UNAUTHORIZED");
  return access;
}

/** ใช้ใน server action ของผู้ดูแลระบบ — เช็คซ้ำจากฐานข้อมูลหลัง requireRole(["ADMIN"]) */
export async function requireAdminAccess(userId: string): Promise<Access> {
  const access = await requireAccess(userId);
  if (!access.isAdmin) throw new Error("FORBIDDEN");
  return access;
}

/** เงื่อนไข where ของข้อมูลที่มี ownerId — ผู้ดูแลระบบไม่จำกัด */
export function ownerScope(access: Access): { ownerId?: string } {
  return access.isAdmin ? {} : { ownerId: access.userId };
}
