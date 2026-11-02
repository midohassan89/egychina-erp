import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, role: true, status: true },
    orderBy: { username: "asc" },
  });
  console.log("users:", JSON.stringify(users, null, 2));

  const test = users.find(
    (u) => String(u.username).toLowerCase() === "test",
  );
  if (!test) {
    console.log("No user named 'test' found.");
    return;
  }

  const updated = await prisma.user.update({
    where: { id: test.id },
    data: { role: "ADMIN", status: "ACTIVE" },
    select: { id: true, username: true, role: true, status: true },
  });
  console.log("promoted:", JSON.stringify(updated, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
