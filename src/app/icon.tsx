import { renderAppIcon } from "@/lib/pwa-icon";

// favicon ของเว็บ — Next ใส่ <link rel="icon"> ให้เอง
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return renderAppIcon(size.width);
}
