import type { Prisma, PrismaClient } from "@prisma/client";
import { hashPin, isFourDigitPin, verifyPin } from "@/lib/customers/pin";

type Db = Prisma.TransactionClient | PrismaClient;

const addressInclude = {
  deliveryZone: {
    select: {
      id: true,
      nameAr: true,
      nameEn: true,
      nameZh: true,
      deliveryFee: true,
      minOrder: true,
      estimatedTime: true,
    },
  },
} as const;

export function serializeCustomerAddress(address: {
  id: string;
  customerId: string;
  title: string;
  recipientName: string | null;
  fullAddress: string;
  details: string | null;
  phone: string | null;
  deliveryZoneId: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  deliveryZone?: {
    id: string;
    nameAr: string;
    nameEn: string;
    nameZh: string;
    deliveryFee: number;
    minOrder: number;
    estimatedTime: string | null;
  } | null;
}) {
  const details = address.details || address.fullAddress;
  const zone = address.deliveryZone;
  return {
    id: address.id,
    customerId: address.customerId,
    label: address.title,
    title: address.title,
    recipientName: address.recipientName,
    details,
    street: details,
    fullAddress: address.fullAddress,
    phone: address.phone,
    deliveryZoneId: address.deliveryZoneId,
    deliveryZone: zone
      ? {
          id: zone.id,
          name: zone.nameAr,
          nameEn: zone.nameEn,
          nameZh: zone.nameZh,
          fee: zone.deliveryFee,
          minOrder: zone.minOrder,
          estimatedTime: zone.estimatedTime,
        }
      : null,
    isDefault: address.isDefault,
    createdAt: address.createdAt.toISOString(),
    updatedAt: address.updatedAt.toISOString(),
  };
}

export async function serializeCustomerProfile(db: Db, customerId: string) {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    include: {
      customerAddresses: {
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
        include: addressInclude,
      },
      wishlistItems: { select: { productId: true } },
    },
  });
  if (!customer || customer.deletedAt) return null;
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    points: customer.pointsBalance,
    pointsBalance: customer.pointsBalance,
    hasPin: Boolean(customer.pinHash),
    addresses: customer.customerAddresses.map(serializeCustomerAddress),
    wishlistIds: customer.wishlistItems.map((row) => row.productId),
  };
}

export function pinUpdateError(pin: string): string | null {
  if (!isFourDigitPin(pin)) return "PIN must be 4 digits";
  return null;
}

export async function applyCustomerPin(
  db: Db,
  customerId: string,
  pin: string,
  currentHash: string | null,
  mode: "set" | "verify-or-set",
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const invalid = pinUpdateError(pin);
  if (invalid) return { ok: false, error: invalid, status: 400 };
  if (mode === "verify-or-set" && currentHash) {
    if (!verifyPin(pin, currentHash)) {
      return { ok: false, error: "Incorrect PIN", status: 401 };
    }
    return { ok: true };
  }
  await db.customer.update({
    where: { id: customerId },
    data: { pinHash: hashPin(pin) },
  });
  return { ok: true };
}
