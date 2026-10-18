import { prisma } from "@/lib/prisma";
import { normalizeLoyaltyPhone } from "@/lib/pos/loyaltyScan";

const orderInclude = {
  items: {
    include: {
      product: {
        select: {
          id: true,
          name: true,
          nameEn: true,
          nameZh: true,
          imageUrl: true,
          isWeighed: true,
        },
      },
    },
  },
  deliveryZone: {
    select: {
      id: true,
      nameAr: true,
      nameEn: true,
      nameZh: true,
      deliveryFee: true,
      estimatedTime: true,
    },
  },
  returnRequests: {
    orderBy: { createdAt: "desc" as const },
    include: {
      items: {
        select: { id: true, orderItemId: true, quantity: true },
      },
    },
  },
};

type LoadedOrder = Awaited<ReturnType<typeof loadOrders>>[number];

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

export function serializeCustomerOrder(order: LoadedOrder) {
  const items = order.items.map((item) => ({
    id: item.id,
    orderItemId: item.id,
    productId: item.productId,
    name: item.product.name,
    nameEn: item.product.nameEn,
    nameZh: item.product.nameZh,
    imageUrl: item.product.imageUrl,
    isWeighed: item.product.isWeighed === true,
    quantity: item.quantity,
    price: item.price,
    lineTotal: money(item.price * item.quantity),
  }));
  const subtotal = money(
    items.reduce((sum, item) => sum + item.price * item.quantity, 0),
  );

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    address: order.address,
    deliveryTime: order.deliveryTime ? order.deliveryTime.toISOString() : null,
    deliveryZone: order.deliveryZone
      ? {
          id: order.deliveryZone.id,
          name: order.deliveryZone.nameAr,
          nameEn: order.deliveryZone.nameEn,
          nameZh: order.deliveryZone.nameZh,
          fee: order.deliveryZone.deliveryFee,
          estimatedTime: order.deliveryZone.estimatedTime,
        }
      : null,
    shippingFee: order.shippingFee,
    couponCode: order.couponCode,
    couponDiscount: order.couponDiscount,
    pointsDiscount: order.pointsDiscount,
    pointsRedeemed: order.pointsRedeemed ?? 0,
    subtotal,
    totalAmount: order.totalAmount,
    customerId: order.customerId,
    items,
    returns: order.returnRequests.map((request) => ({
      id: request.id,
      orderId: order.id,
      status: request.status,
      createdAt: request.createdAt.toISOString(),
      items: request.items.map((item) => {
        const line = items.find((row) => row.id === item.orderItemId);
        return {
          id: item.id,
          orderItemId: item.orderItemId,
          productId: line?.productId ?? null,
          name: line?.name ?? "",
          nameEn: line?.nameEn ?? null,
          nameZh: line?.nameZh ?? null,
          quantity: item.quantity,
        };
      }),
    })),
  };
}

function ownershipFilter(customerId: string, phoneRaw: string) {
  const phone = phoneRaw ? normalizeLoyaltyPhone(phoneRaw) || phoneRaw : "";
  return {
    OR: [
      ...(customerId ? [{ customerId }] : []),
      ...(phone
        ? [
            { phone },
            { phone: phoneRaw },
            ...(phone.length >= 10
              ? [{ phone: { contains: phone.slice(-10) } }]
              : []),
          ]
        : []),
    ],
  };
}

async function loadOrders(customerId: string, phoneRaw: string) {
  if (!customerId && !phoneRaw.trim()) return [];
  return prisma.order.findMany({
    where: ownershipFilter(customerId, phoneRaw),
    orderBy: { createdAt: "desc" },
    include: orderInclude,
  });
}

export async function listCustomerOrders(customerId: string, phoneRaw: string) {
  const orders = await loadOrders(customerId, phoneRaw);
  return orders.map(serializeCustomerOrder);
}

export async function getCustomerOrder(
  orderId: string,
  customerId: string,
  phoneRaw: string,
) {
  if (!customerId && !phoneRaw.trim()) return null;
  const order = await prisma.order.findFirst({
    where: { id: orderId, ...ownershipFilter(customerId, phoneRaw) },
    include: orderInclude,
  });
  return order ? serializeCustomerOrder(order) : null;
}
