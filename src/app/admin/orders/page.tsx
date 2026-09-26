import { prisma } from "@/lib/prisma";
import { OrdersTable, type OrderRow } from "@/components/dashboard/OrdersTable";

export default async function OrdersPage() {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      items: {
        include: {
          product: { select: { name: true } },
        },
      },
    },
  });

  const rows: OrderRow[] = orders.map((order) => ({
    id: order.id,
    customerName: order.customerName,
    phone: order.phone,
    address: order.address,
    notes: order.notes,
    totalAmount: order.totalAmount,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    items: order.items.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      productName: item.product.name,
    })),
  }));

  return (
    <div className="flex-1 space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">الطلبات</h1>
        <p className="mt-1 text-sm text-slate-500">
          Storefront orders, newest first
        </p>
      </div>
      <OrdersTable orders={rows} />
    </div>
  );
}
