import { prisma } from "@/lib/prisma";
import { OrdersTable, type OrderRow } from "@/components/dashboard/OrdersTable";

export default async function OrdersPage() {
  const [orders, drivers] = await Promise.all([
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        assignedDriver: { select: { id: true, username: true } },
        items: {
          include: {
            product: {
              select: {
                name: true,
                imageUrl: true,
                isWeighed: true,
                purchasePackSize: true,
              },
            },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { role: "DRIVER", status: "ACTIVE" },
      select: { id: true, username: true },
      orderBy: { username: "asc" },
    }),
  ]);

  const rows: OrderRow[] = orders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    phone: order.phone,
    address: order.address,
    notes: order.notes,
    deliveryTime: order.deliveryTime?.toISOString() ?? null,
    totalAmount: order.totalAmount,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    couponCode: order.couponCode,
    couponDiscount: order.couponDiscount,
    pointsRedeemed: order.pointsRedeemed,
    pointsDiscount: order.pointsDiscount,
    shippingFee: order.shippingFee,
    assignedDriverId: order.assignedDriverId,
    assignedDriverName: order.assignedDriver?.username ?? null,
    items: order.items.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      price: item.price,
      productName: item.product.name,
      imageUrl: item.product.imageUrl,
      isWeighed: item.product.isWeighed,
      packSize: item.product.purchasePackSize,
    })),
  }));

  return (
    <div className="flex-1 space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-gray-100">الطلبات</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">
          طلبات المتجر والتطبيق، الأحدث أولاً
        </p>
      </div>
      <OrdersTable orders={rows} drivers={drivers} />
    </div>
  );
}
