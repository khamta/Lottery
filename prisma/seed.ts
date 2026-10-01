import { PrismaClient, ProductStatus, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash("Admin@123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      email: "admin@example.com",
      name: "Admin",
      password,
      role: Role.ADMIN,
    },
  });

  const category = await prisma.category.upsert({
    where: { slug: "general" },
    update: {},
    create: { name: "General", slug: "general" },
  });

  const samples = [
    { name: "Starter Plan", sku: "SKU-0001", price: 990, stock: 25, status: ProductStatus.ACTIVE },
    { name: "Pro Plan", sku: "SKU-0002", price: 2990, stock: 12, status: ProductStatus.ACTIVE },
    { name: "Enterprise Plan", sku: "SKU-0003", price: 9990, stock: 0, status: ProductStatus.DRAFT },
  ];

  for (const s of samples) {
    await prisma.product.upsert({
      where: { sku: s.sku },
      update: {},
      create: { ...s, categoryId: category.id, createdById: admin.id },
    });
  }

  console.log("Seed completed. Login: admin@example.com / Admin@123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
