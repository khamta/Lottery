"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { createAction } from "@/lib/action";
import { logAudit, logAuditMany } from "@/lib/audit";
import { requireDealerId } from "@/lottery/dealer";
import {
  createCustomerSchema,
  deleteCustomerSchema,
  deleteCustomersSchema,
  updateCustomerSchema,
  type CustomerInput,
} from "@/lib/validations/customer";

function toData(input: CustomerInput) {
  return {
    name: input.name,
    phone: input.phone || null,
    lakMultiplier: input.lakMultiplier,
    note: input.note || null,
  };
}

/** ชื่อลูกค้าแสดงในหน้าโพยและรายงานด้วย */
function revalidateCustomers() {
  for (const path of ["/customers", "/tickets", "/reports"]) revalidatePath(path);
}

export const createCustomer = createAction(
  createCustomerSchema,
  async (input) => {
    const user = await requireUser();
    const dealerId = await requireDealerId(user.id);

    const customer = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({ data: { ...toData(input), dealerId } });

      await logAudit(tx, {
        action: "CREATE",
        entity: "Customer",
        entityId: customer.id,
        summary: customer.name,
        after: customer,
        user,
      });

      return customer;
    });

    revalidateCustomers();
    return { id: customer.id };
  },
  { successMessage: "customers.created" },
);

export const updateCustomer = createAction(
  updateCustomerSchema,
  async ({ id, ...input }) => {
    const user = await requireUser();
    const dealerId = await requireDealerId(user.id);

    const customer = await prisma.$transaction(async (tx) => {
      const before = await tx.customer.findFirst({ where: { id, dealerId } });
      if (!before) throw new Error("customers.notFound");

      const customer = await tx.customer.update({ where: { id }, data: toData(input) });

      await logAudit(tx, {
        action: "UPDATE",
        entity: "Customer",
        entityId: customer.id,
        summary: customer.name,
        before,
        after: customer,
        user,
      });

      return customer;
    });

    revalidateCustomers();
    return { id: customer.id };
  },
  { successMessage: "customers.updated" },
);

/** ลบลูกค้าแล้วโพยเดิมยังอยู่ (กลายเป็นโพยไม่ระบุลูกค้า) ยอดของงวดจึงไม่เปลี่ยน */
export const deleteCustomer = createAction(
  deleteCustomerSchema,
  async ({ id }) => {
    const user = await requireUser();
    const dealerId = await requireDealerId(user.id);

    await prisma.$transaction(async (tx) => {
      const owned = await tx.customer.findFirst({ where: { id, dealerId }, select: { id: true } });
      if (!owned) throw new Error("customers.notFound");

      const before = await tx.customer.delete({ where: { id } });

      await logAudit(tx, {
        action: "DELETE",
        entity: "Customer",
        entityId: before.id,
        summary: before.name,
        before,
        user,
      });
    });

    revalidateCustomers();
    return { id };
  },
  { successMessage: "customers.deleted" },
);

/** ลบรายการที่เลือกจากตาราง (checkbox) ในคำสั่งเดียว — audit หนึ่งแถวต่อลูกค้าหนึ่งคน */
export const deleteCustomers = createAction(
  deleteCustomersSchema,
  async ({ ids }) => {
    const user = await requireUser();
    const dealerId = await requireDealerId(user.id);

    const count = await prisma.$transaction(async (tx) => {
      // ลบเฉพาะลูกค้าของแม่หวยที่เลือกอยู่ — id ของแม่หวยอื่นที่ปนมาถูกข้าม
      const customers = await tx.customer.findMany({ where: { id: { in: ids }, dealerId } });
      if (customers.length === 0) return 0;

      await tx.customer.deleteMany({ where: { id: { in: customers.map((customer) => customer.id) } } });

      await logAuditMany(
        tx,
        customers.map((customer) => ({
          action: "DELETE" as const,
          entity: "Customer",
          entityId: customer.id,
          summary: customer.name,
          before: customer,
          user,
        })),
      );

      return customers.length;
    });

    revalidateCustomers();
    return { count };
  },
  { successMessage: "customers.deletedMany" },
);
