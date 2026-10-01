"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type UserAvatarProps = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  className?: string;
  fallbackClassName?: string;
};

export function getInitials(name?: string | null, email?: string | null) {
  const source = (name ?? "").trim();
  if (source) {
    const parts = source.split(/\s+/);
    const initials = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : source.slice(0, 2);
    return initials.toUpperCase();
  }
  return (email ?? "U").slice(0, 2).toUpperCase();
}

/** รูปโปรไฟล์กลางของระบบ — มีรูปแสดงรูป ไม่มีรูปแสดงอักษรย่อ */
export function UserAvatar({ name, email, image, className, fallbackClassName }: UserAvatarProps) {
  return (
    <Avatar className={className}>
      {image ? <AvatarImage src={image} alt={name ?? ""} className="object-cover" /> : null}
      <AvatarFallback className={cn("bg-primary/12 font-semibold text-primary", fallbackClassName)}>
        {getInitials(name, email)}
      </AvatarFallback>
    </Avatar>
  );
}
