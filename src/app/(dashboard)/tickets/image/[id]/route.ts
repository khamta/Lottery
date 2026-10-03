import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findAccess, ownerScope } from "@/lottery/access";
import { readTicketImage } from "@/lottery/image-store";

/** รูปแบบรูปที่เปิดในเบราว์เซอร์ได้อย่างปลอดภัย — SVG/HTML ห้ามเสิร์ฟเป็นรูป (มีสคริปต์ได้) */
const SAFE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/**
 * เสิร์ฟรูปโพยให้คนตรวจเทียบกับข้อความ — id = รหัสโพย · ไฟล์อยู่ใน uploads (path ใน ticket_images)
 * ไม่วางรูปไว้ใน public/ เพราะต้องตรวจสิทธิ์ก่อนทุกครั้ง
 * เห็นได้เฉพาะโพยของแม่หวยที่ตัวเองเป็นเจ้าของ (ผู้ดูแลระบบเห็นทุกแม่หวย) เหมือนหน้าโพย
 * รูปของโพยไม่เปลี่ยนหลังเก็บแล้ว จึง cache ได้ยาว
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response(null, { status: 401 });
  const access = await findAccess(session.user.id);
  if (!access) return new Response(null, { status: 403 });

  const { id } = await params;
  const image = await prisma.ticketImage.findFirst({
    where: { ticketId: id, ticket: { draw: { dealer: ownerScope(access) } } },
    select: { path: true, mimeType: true },
  });
  const data = image?.path ? await readTicketImage(image.path) : null;
  if (!image || !data) return new Response(null, { status: 404 });

  return new Response(data, {
    headers: {
      "Content-Type": SAFE_TYPES.has(image.mimeType) ? image.mimeType : "application/octet-stream",
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
