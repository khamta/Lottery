import { renderSplash, splashScreens } from "@/lib/pwa-icon";

// ภาพตอนเปิดแอปบน iOS (apple-touch-startup-image) — สร้างครั้งเดียวตอน build แล้วเสิร์ฟเป็นไฟล์นิ่ง
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(splashScreens).map((name) => ({ name }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const spec = splashScreens[name];
  if (!spec) return new Response(null, { status: 404 });

  return renderSplash(spec);
}
