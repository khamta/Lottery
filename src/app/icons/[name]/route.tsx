import { manifestIcons, renderAppIcon, type ManifestIconName } from "@/lib/pwa-icon";

// สร้างครั้งเดียวตอน build แล้วเสิร์ฟเป็นไฟล์นิ่ง
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(manifestIcons).map((name) => ({ name }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const icon = manifestIcons[name as ManifestIconName];
  if (!icon) return new Response(null, { status: 404 });

  return renderAppIcon(icon.size, { maskable: icon.maskable });
}
