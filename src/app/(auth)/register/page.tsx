import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { siteConfig } from "@/config/site";
import { RegisterForm } from "../_components/register-form";

export const metadata: Metadata = { title: "Sign up" };

export default function RegisterPage() {
  if (!siteConfig.enableRegister) notFound();
  return <RegisterForm />;
}
