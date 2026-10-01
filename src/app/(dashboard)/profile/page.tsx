import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProfileView } from "./_components/profile-view";
import type { ProfileData } from "./types";

export const metadata: Metadata = { title: "Profile" };

/** โปรไฟล์ของผู้ใช้ที่ login อยู่ — อ่านจากฐานข้อมูลตรง ๆ (ไม่ใช้ค่าใน session ที่อาจเก่า) */
export default async function ProfilePage() {
  const sessionUser = await requireUser().catch(() => null);
  if (!sessionUser) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      createdAt: true,
      password: true,
    },
  });
  if (!user) redirect("/login");

  const profile: ProfileData = {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    // ส่งแค่ว่ามีรหัสผ่านหรือไม่ — ห้ามส่ง hash ไป client
    hasPassword: !!user.password,
  };

  return <ProfileView profile={profile} />;
}
