"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import type { ActionResult } from "@/lib/action";
import { handleResult } from "@/lib/notify";
import { beginMutation } from "@/components/shared/mutation-overlay";

/**
 * ============================================================================
 * มาตรฐานการ "แสดงผลก่อน แล้วค่อยยืนยันกับฐานข้อมูล" (optimistic update)
 * ============================================================================
 * ใช้กับทุก module: เพิ่ม / แก้ไข / ลบ  →  UI เปลี่ยนทันทีที่กด
 *  - สำเร็จ  : router.refresh() ดึงข้อมูลจริงจาก server มาทับ
 *  - ล้มเหลว : React ย้อนสถานะกลับให้เองเมื่อ transition จบ + ขึ้น toast error
 *
 * เงื่อนไขสำคัญ: ทุกอย่างต้องอยู่ใน startTransition เดียวกัน
 * (ถ้าเรียก action นอก transition ค่า optimistic จะเด้งกลับก่อนที่ action จะเสร็จ)
 */

export type OptimisticMark = "create" | "update" | "delete";

/** แถวที่กำลังรอผลจากฐานข้อมูล จะถูกติดธงไว้ให้ตารางหรี่แสงรอ */
export type WithOptimistic<T> = T & { __optimistic?: OptimisticMark };

export type OptimisticPatch<T extends { id: string }> =
  | { type: "create"; item: T }
  | { type: "update"; item: T }
  | { type: "delete"; id: string }
  | { type: "delete-many"; ids: string[] };

/** reducer ของ optimistic state — export ไว้ให้เทสต์ได้โดยไม่ต้อง render */
export function applyOptimisticPatch<T extends { id: string }>(
  state: WithOptimistic<T>[],
  patch: OptimisticPatch<T>,
): WithOptimistic<T>[] {
  switch (patch.type) {
    case "create":
      return [{ ...patch.item, __optimistic: "create" }, ...state];
    case "update":
      return state.map((row) =>
        row.id === patch.item.id ? { ...patch.item, __optimistic: "update" } : row,
      );
    case "delete":
      return state.filter((row) => row.id !== patch.id);
    case "delete-many": {
      const ids = new Set(patch.ids);
      return state.filter((row) => !ids.has(row.id));
    }
  }
}

export type MutateArgs<T extends { id: string }, TData> = {
  /** สิ่งที่อยากให้เห็นทันทีบนหน้าจอ */
  patch: OptimisticPatch<T>;
  /** server action ที่จะยิงจริง */
  action: () => Promise<ActionResult<TData>>;
  successMessage?: string;
  onSuccess?: (data: TData) => void;
  onError?: () => void;
};

export function useOptimisticList<T extends { id: string }>(rows: T[]) {
  const router = useRouter();
  const [optimisticRows, applyPatch] = React.useOptimistic<
    WithOptimistic<T>[],
    OptimisticPatch<T>
  >(rows, applyOptimisticPatch);
  const [isPending, startTransition] = React.useTransition();

  // ม่านโหลดเต็มจอ (ดู <MutationOverlay />) — เปิดตอนเริ่ม mutate และปิดเมื่อ transition จบจริง
  // (หลัง router.refresh() เอาข้อมูลจริงมาทับแล้ว) ทุก module จึงได้ม่านโหลดโดยไม่ต้องต่อสายเอง
  const endOverlay = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    if (!isPending && endOverlay.current) {
      endOverlay.current();
      endOverlay.current = null;
    }
  }, [isPending]);

  // ออกจากหน้าไปกลางคัน → อย่าทิ้งม่านค้าง
  React.useEffect(
    () => () => {
      endOverlay.current?.();
      endOverlay.current = null;
    },
    [],
  );

  const mutate = React.useCallback(
    <TData,>({ patch, action, successMessage, onSuccess, onError }: MutateArgs<T, TData>) => {
      if (!endOverlay.current) {
        endOverlay.current = beginMutation(
          patch.type === "delete" || patch.type === "delete-many"
            ? "common.deleting"
            : "common.saving",
        );
      }

      startTransition(async () => {
        applyPatch(patch); // 1) เปลี่ยนหน้าจอทันที
        const result = await action(); // 2) ยิงจริง

        if (handleResult(result, successMessage)) {
          onSuccess?.(result.data);
          router.refresh(); // 3) ดึงข้อมูลจริงมาทับ (ยังอยู่ใน transition เดียวกัน)
          return;
        }

        onError?.(); // 4) ไม่สำเร็จ — state ย้อนกลับเองเมื่อ transition จบ
      });
    },
    [applyPatch, router],
  );

  /** id ชั่วคราวของแถวที่ยังไม่ได้บันทึกจริง */
  const tempId = React.useCallback(() => `optimistic-${Date.now()}`, []);

  return { rows: optimisticRows, isPending, mutate, tempId };
}
