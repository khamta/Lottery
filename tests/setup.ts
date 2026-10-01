import { GlobalRegistrator } from "@happy-dom/global-registrator";

// ให้ bun test มี document/window สำหรับเทสต์ React component
if (typeof window === "undefined") {
  GlobalRegistrator.register({ url: "http://localhost:3000" });
}

process.env.TZ = "Asia/Bangkok";
