import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEFAULT_EXPENSE_CATEGORIES = [
  "Salaries",
  "Electricity",
  "Packaging",
  "Rent",
  "Transport",
];

const DEFAULT_BANK_ACCOUNTS = [
  { code: "visa", name: "CIB Visa" },
  { code: "wallet", name: "Vodafone Cash" },
  { code: "instapay", name: "InstaPay" },
  { code: "wechat", name: "WeChat" },
] as const;

async function main() {
  const password = await bcrypt.hash("admin123", 12);

  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {
      password,
      role: "ADMIN",
      pinCode: "1234",
      status: "ACTIVE",
    },
    create: {
      username: "admin",
      password,
      role: "ADMIN",
      pinCode: "1234",
      status: "ACTIVE",
    },
  });

  const treasury = await prisma.treasury.upsert({
    where: { id: 1 },
    create: { id: 1, balance: 0 },
    update: {},
  });

  for (const name of DEFAULT_EXPENSE_CATEGORIES) {
    await prisma.expenseCategory.upsert({
      where: { name },
      create: { name },
      update: {},
    });
  }

  for (const def of DEFAULT_BANK_ACCOUNTS) {
    await prisma.bankAccount.upsert({
      where: { code: def.code },
      create: { code: def.code, name: def.name, balance: 0 },
      update: { name: def.name },
    });
  }

  const banks = await prisma.bankAccount.findMany({ orderBy: { id: "asc" } });

  console.log("Seeded admin account:");
  console.log(`  username: ${admin.username}`);
  console.log("  password: admin123");
  console.log(`  pinCode:  1234`);
  console.log(`  role:     ${admin.role}`);
  console.log(`Treasury id=${treasury.id} balance=${treasury.balance}`);
  console.log(`Expense categories: ${DEFAULT_EXPENSE_CATEGORIES.join(", ")}`);
  console.log(
    `Bank accounts: ${banks.map((b) => `${b.name} (${b.code})`).join(", ")}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
