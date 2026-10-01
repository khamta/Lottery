import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * เสิร์ฟรูปโปรไฟล์ที่อัปโหลด (users.avatar) — เฉพาะผู้ที่ login แล้ว
 * URL มี ?v=<เวลาอัปโหลด> ติดมาเสมอ จึง cache ได้ยาวแบบ immutable
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response(null, { status: 401 });

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { avatar: true, avatarType: true },
  });
  if (!user?.avatar) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(user.avatar), {
    headers: {
      "Content-Type": user.avatarType ?? "image/webp",
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
