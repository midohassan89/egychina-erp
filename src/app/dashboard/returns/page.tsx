import { prisma } from "@/lib/prisma";
import {
  ReturnsTable,
  type ReturnRow,
} from "@/components/dashboard/ReturnsTable";

export default async function ReturnsPage() {
  const returns = await prisma.returnRequest.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { name: true } },
      order: { select: { customerName: true } },
      items: {
        include: {
          orderItem: {
            include: { product: { select: { name: true } } },
          },
        },
      },
    },
  });

  const rows: ReturnRow[] = returns.map((request) => ({
    id: request.id,
    orderId: request.orderId,
    customerName:
      request.customer.name?.trim() ||
      request.order.customerName ||
      "عميل",
    status: request.status,
    createdAt: request.createdAt.toISOString(),
    items: request.items.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      productName: item.orderItem.product.name,
    })),
  }));

  return (
    <div className="flex-1 space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-gray-100">المرتجعات</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">
          طلبات الإرجاع من المتجر، الأحدث أولاً
        </p>
      </div>
      <ReturnsTable returns={rows} />
    </div>
  );
}
