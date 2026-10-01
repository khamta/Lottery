/** ข้อมูลโปรไฟล์ที่ส่งจาก server → client (Date แปลงเป็น ISO string แล้ว) */
export type ProfileData = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: "ADMIN" | "USER";
  createdAt: string;
  hasPassword: boolean;
};
