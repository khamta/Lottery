import { PageSkeleton } from "@/components/shared/loading";

/** ใช้กับทุกหน้าใน dashboard ที่ไม่ได้ทำ loading.tsx ของตัวเอง */
export default function Loading() {
  return <PageSkeleton />;
}
