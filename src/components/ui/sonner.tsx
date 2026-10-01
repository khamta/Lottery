"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/** Toast กลางของระบบ — สไตล์ผูกกับ design token อัตโนมัติ */
function Toaster(props: ToasterProps) {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="top-right"
      richColors
      closeButton
      duration={3500}
      toastOptions={{
        classNames: {
          toast: "rounded-lg border shadow-lg",
        },
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          // sonner ตั้ง font-family ของตัวเองไว้นอก @layer (ชนะ utility อย่าง font-sans)
          // จึงต้องใส่ inline ให้ใช้ชุดฟอนต์ของระบบ (src/app/fonts.ts)
          fontFamily: "var(--font-app-sans), ui-sans-serif, system-ui, sans-serif",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
