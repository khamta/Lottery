import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";
import { manifestIcons } from "@/lib/pwa-icon";

/** Web App Manifest — เสิร์ฟที่ /manifest.webmanifest และ Next ใส่ <link rel="manifest"> ให้เอง */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: siteConfig.name,
    short_name: siteConfig.pwa.shortName,
    description: siteConfig.description,
    start_url: siteConfig.pwa.startUrl,
    scope: "/",
    display: "standalone",
    orientation: "any",
    theme_color: siteConfig.pwa.brandColor,
    background_color: siteConfig.pwa.backgroundColor,
    icons: Object.entries(manifestIcons).map(([name, icon]) => ({
      src: `/icons/${name}`,
      sizes: `${icon.size}x${icon.size}`,
      type: "image/png",
      purpose: icon.maskable ? "maskable" : "any",
    })),
  };
}
