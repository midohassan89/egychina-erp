import { normalizeLoyaltyPhone } from "@/lib/pos/loyaltyScan";
import { prisma } from "@/lib/prisma";

type CustomerRow = {
  id: string;
  name: string | null;
  phone: string;
  pointsBalance: number;
  createdAt: Date;
  ordersCount: number;
};

export function phoneGroupKey(phone: string): string {
  const normalized = normalizeLoyaltyPhone(phone);
  if (normalized.startsWith("01") && normalized.length === 11) return normalized;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : phone.trim();
}

function pickCanonical(rows: CustomerRow[]): CustomerRow {
  const key = phoneGroupKey(rows[0]?.phone ?? "");
  return (
    [...rows].sort((a, b) => {
      const aExact = a.phone === key ? 0 : 1;
      const bExact = b.phone === key ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      if (b.ordersCount !== a.ordersCount) return b.ordersCount - a.ordersCount;
      return a.createdAt.getTime() - b.createdAt.getTime();
    })[0]
  );
}

export function groupCustomers(rows: CustomerRow[]) {
  const groups = new Map<string, CustomerRow[]>();
  for (const row of rows) {
    const key = phoneGroupKey(row.phone);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([phone, members]) => {
    const canonical = pickCanonical(members);
    return {
      id: canonical.id,
      name: members.find((row) => row.name?.trim())?.name ?? canonical.name,
      phone,
      pointsBalance: members.reduce((sum, row) => sum + row.pointsBalance, 0),
      ordersCount: members.reduce((sum, row) => sum + row.ordersCount, 0),
      createdAt: canonical.createdAt.toISOString(),
      duplicateIds: members
        .filter((row) => row.id !== canonical.id)
        .map((row) => row.id),
    };
  });
}

/** Move orders, points, and addresses from duplicate Egyptian numbers onto one customer. */
export async function mergeDuplicateCustomers(ids?: string[]) {
  const customers = await prisma.customer.findMany({
    where: { deletedAt: null, ...(ids?.length ? { id: { in: ids } } : {}) },
    select: {
      id: true,
      name: true,
      phone: true,
      pointsBalance: true,
      createdAt: true,
      _count: { select: { orders: true } },
    },
  });
  const rows: CustomerRow[] = customers.map((customer) => ({
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    pointsBalance: customer.pointsBalance,
    createdAt: customer.createdAt,
    ordersCount: customer._count.orders,
  }));
  const groups = groupCustomers(rows).filter((group) => group.duplicateIds.length > 0);
  let mergedGroups = 0;

  for (const group of groups) {
    const members = rows.filter(
      (row) => row.id === group.id || group.duplicateIds.includes(row.id),
    );
    const canonical = members.find((row) => row.id === group.id);
    if (!canonical) continue;
    const duplicates = members.filter((row) => row.id !== canonical.id);
    const phones = members.map((row) => row.phone);
    const points = members.reduce((sum, row) => sum + row.pointsBalance, 0);

    await prisma.$transaction(async (tx) => {
      for (const duplicate of duplicates) {
        const wishes = await tx.wishlistItem.findMany({
          where: { customerId: duplicate.id },
          select: { id: true, productId: true },
        });
        for (const wish of wishes) {
          const existing = await tx.wishlistItem.findUnique({
            where: {
              customerId_productId: {
                customerId: canonical.id,
                productId: wish.productId,
              },
            },
            select: { id: true },
          });
          if (existing) {
            await tx.wishlistItem.delete({ where: { id: wish.id } });
          } else {
            await tx.wishlistItem.update({
              where: { id: wish.id },
              data: { customerId: canonical.id },
            });
          }
        }

        await tx.order.updateMany({
          where: { customerId: duplicate.id },
          data: { customerId: canonical.id },
        });
        await tx.pointsTransaction.updateMany({
          where: { customerId: duplicate.id },
          data: { customerId: canonical.id },
        });
        await tx.returnRequest.updateMany({
          where: { customerId: duplicate.id },
          data: { customerId: canonical.id },
        });
        await tx.customerNotification.updateMany({
          where: { customerId: duplicate.id },
          data: { customerId: canonical.id },
        });
        await tx.chatMessage.updateMany({
          where: { customerId: duplicate.id },
          data: { customerId: canonical.id },
        });
        await tx.address.updateMany({
          where: { customerId: duplicate.id },
          data: { customerId: canonical.id },
        });
        await tx.customerAddress.updateMany({
          where: { customerId: duplicate.id },
          data: { customerId: canonical.id },
        });
        await tx.customer.update({
          where: { id: duplicate.id },
          data: {
            deletedAt: new Date(),
            phone: `merged-${duplicate.id}`,
            pointsBalance: 0,
          },
        });
      }

      await tx.order.updateMany({
        where: { customerId: null, phone: { in: phones } },
        data: { customerId: canonical.id },
      });
      await tx.customer.update({
        where: { id: canonical.id },
        data: {
          phone: group.phone,
          pointsBalance: points,
          ...(group.name ? { name: group.name } : {}),
        },
      });
      await tx.pointsTransaction.create({
        data: {
          customerId: canonical.id,
          points: 0,
          type: "ADJUST",
          description: `دمج أرقام مكررة (${phones.join("، ")}) في ${group.phone}`,
        },
      });
    });
    mergedGroups += 1;
  }

  return { mergedGroups };
}
