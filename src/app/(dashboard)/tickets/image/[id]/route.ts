import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findAccess, ownerScope } from "@/lottery/access";

/** รูปแบบรูปที่เปิดในเบราว์เซอร์ได้อย่างปลอดภัย — SVG/HTML ห้ามเสิร์ฟเป็นรูป (มีสคริปต์ได้) */
const SAFE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/**
 * เสิร์ฟรูปโพย (ticket_images) ให้คนตรวจเทียบกับข้อความ — id = รหัสโพย
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
    select: { data: true, mimeType: true },
  });
  if (!image) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(image.data), {
    headers: {
      "Content-Type": SAFE_TYPES.has(image.mimeType) ? image.mimeType : "application/octet-stream",
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
