import { describe, expect, test } from "bun:test";

import { loginSchema, registerSchema } from "@/lib/validations/auth";
import { productSchema, updateProductSchema } from "@/lib/validations/product";
import {
  AVATAR_MAX_LENGTH,
  changePasswordSchema,
  updateAvatarSchema,
  updateProfileSchema,
} from "@/lib/validations/profile";

describe("loginSchema", () => {
  test("ผ่านเมื่อใช้อีเมล", () => {
    expect(loginSchema.safeParse({ identifier: "a@b.com", password: "123456" }).success).toBe(true);
  });

  test("ผ่านเมื่อใช้ชื่อผู้ใช้ — ตัดช่องว่างและแปลงเป็นตัวเล็ก", () => {
    const result = loginSchema.safeParse({ identifier: "  Admin ", password: "x" });
    expect(result.success && result.data.identifier).toBe("admin");
  });

  test("ไม่ผ่านเมื่อไม่กรอกชื่อผู้ใช้/อีเมล", () => {
    const result = loginSchema.safeParse({ identifier: "  ", password: "x" });
    expect(result.success).toBe(false);
  });
});

describe("registerSchema", () => {
  const base = {
    name: "สมชาย",
    email: "somchai@example.com",
    password: "abc12345",
    confirmPassword: "abc12345",
  };

  test("ผ่านเมื่อข้อมูลครบและรหัสผ่านตรงกัน", () => {
    expect(registerSchema.safeParse(base).success).toBe(true);
  });

  test("ไม่ผ่านเมื่อรหัสผ่านไม่ตรงกัน — error เป็นคีย์ i18n อยู่ที่ confirmPassword", () => {
    const result = registerSchema.safeParse({ ...base, confirmPassword: "different1" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.confirmPassword?.[0]).toBe("validation.passwordMismatch");
    }
  });

  test("ไม่ผ่านเมื่อรหัสผ่านไม่มีตัวเลข", () => {
    const result = registerSchema.safeParse({
      ...base,
      password: "abcdefgh",
      confirmPassword: "abcdefgh",
    });
    expect(result.success).toBe(false);
  });
});

describe("productSchema", () => {
  const base = { name: "สินค้า A", sku: "SKU-0001", price: 100, stock: 5, status: "ACTIVE" };

  test("ผ่านเมื่อข้อมูลถูกต้อง", () => {
    expect(productSchema.safeParse(base).success).toBe(true);
  });

  test("แปลง string เป็น number ให้อัตโนมัติ (ค่าจาก input type=number)", () => {
    const result = productSchema.safeParse({ ...base, price: "1990.50", stock: "3" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.price).toBe(1990.5);
      expect(result.data.stock).toBe(3);
    }
  });

  test("ไม่ผ่านเมื่อราคาติดลบ", () => {
    expect(productSchema.safeParse({ ...base, price: -1 }).success).toBe(false);
  });

  test("ไม่ผ่านเมื่อ SKU มีอักขระต้องห้าม", () => {
    expect(productSchema.safeParse({ ...base, sku: "SKU 001!" }).success).toBe(false);
  });

  test("ไม่ผ่านเมื่อจำนวนคงเหลือไม่ใช่จำนวนเต็ม", () => {
    expect(productSchema.safeParse({ ...base, stock: 1.5 }).success).toBe(false);
  });

  test("status ค่าเริ่มต้นเป็น DRAFT", () => {
    const { status, ...withoutStatus } = base;
    const result = productSchema.safeParse(withoutStatus);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe("DRAFT");
  });

  test("updateProductSchema ต้องมี id", () => {
    expect(updateProductSchema.safeParse(base).success).toBe(false);
    expect(updateProductSchema.safeParse({ ...base, id: "abc" }).success).toBe(true);
  });
});

describe("profile schemas", () => {
  const png = "data:image/png;base64,iVBORw0KGgo=";

  test("updateProfileSchema ตัดช่องว่างหัวท้ายชื่อ และบังคับอย่างน้อย 2 ตัวอักษร", () => {
    const result = updateProfileSchema.safeParse({ name: "  สมชาย  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("สมชาย");
    expect(updateProfileSchema.safeParse({ name: " a " }).success).toBe(false);
  });

  test("updateAvatarSchema รับเฉพาะ data URL ของ png / jpeg / webp", () => {
    expect(updateAvatarSchema.safeParse({ image: png }).success).toBe(true);
    expect(updateAvatarSchema.safeParse({ image: "data:image/svg+xml;base64,PHN2Zz4=" }).success).toBe(false);
    expect(updateAvatarSchema.safeParse({ image: "https://example.com/a.png" }).success).toBe(false);
  });

  test("updateAvatarSchema ปฏิเสธไฟล์ใหญ่เกินกำหนด", () => {
    const huge = `data:image/png;base64,${"A".repeat(AVATAR_MAX_LENGTH)}`;
    const result = updateAvatarSchema.safeParse({ image: huge });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.image?.[0]).toBe("validation.imageTooLarge");
    }
  });

  test("changePasswordSchema ใช้กฎรหัสผ่านเดียวกับตอนสมัคร และต้องยืนยันให้ตรงกัน", () => {
    const base = { currentPassword: "old", newPassword: "abc12345", confirmPassword: "abc12345" };
    expect(changePasswordSchema.safeParse(base).success).toBe(true);
    expect(changePasswordSchema.safeParse({ ...base, newPassword: "abcdefgh", confirmPassword: "abcdefgh" }).success).toBe(false);

    const mismatch = changePasswordSchema.safeParse({ ...base, confirmPassword: "abc99999" });
    expect(mismatch.success).toBe(false);
    if (!mismatch.success) {
      expect(mismatch.error.flatten().fieldErrors.confirmPassword?.[0]).toBe("validation.passwordMismatch");
    }
  });
});
