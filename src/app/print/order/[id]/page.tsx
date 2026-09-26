import { prisma } from "@/lib/prisma";
import { formatEGP } from "@/lib/pos/money";

export default async function PrintOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: {
        include: { product: true },
      },
    },
  });

  if (!order) {
    return (
      <p className="p-6 text-center text-sm text-black">404 — Order not found</p>
    );
  }

  const printedAt = order.createdAt.toLocaleString("ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="min-h-screen bg-white text-black">
      <style>{`
        @media print {
          @page { size: 80mm auto; margin: 0; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
        }
      `}</style>
      <div
        dir="rtl"
        className="mx-auto max-w-[80mm] bg-white p-4 text-sm text-black print:w-full print:max-w-none print:p-2 print:shadow-none"
      >
        <header className="border-b border-dashed border-black pb-3 text-center">
          <h1 className="text-base font-bold leading-snug">
            سوق العبور العين السخنة - ايجي شاينا جروب
          </h1>
        </header>

        <section className="space-y-1 py-3 text-xs">
          <p>
            <span className="font-semibold">العميل: </span>
            {order.customerName}
          </p>
          <p>
            <span className="font-semibold">الهاتف: </span>
            <span dir="ltr">{order.phone}</span>
          </p>
          <p>
            <span className="font-semibold">العنوان: </span>
            {order.address}
          </p>
          <p>
            <span className="font-semibold">التاريخ: </span>
            {printedAt}
          </p>
          <p className="break-all">
            <span className="font-semibold">رقم الطلب: </span>
            {order.id}
          </p>
        </section>

        <div className="grid grid-cols-[1fr_auto_auto] gap-x-2 border-b border-black pb-1 text-xs font-bold">
          <span>الصنف</span>
          <span>الكمية</span>
          <span>السعر</span>
        </div>
        <div className="divide-y divide-dotted divide-black/30">
          {order.items.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[1fr_auto_auto] gap-x-2 py-1.5 text-xs"
            >
              <span>{item.product.name}</span>
              <span className="text-center">{item.quantity}</span>
              <span>{formatEGP(item.price * item.quantity)}</span>
            </div>
          ))}
        </div>

        <div className="mt-3 border-t border-dashed border-black pt-2 text-sm font-bold">
          <div className="flex items-center justify-between">
            <span>الإجمالي</span>
            <span>{formatEGP(order.totalAmount)}</span>
          </div>
        </div>

        <footer className="mt-4 space-y-1 text-center text-xs">
          <p dir="ltr" className="font-semibold">
            01009972972
          </p>
          <p>شكراً لطلبكم - Thank you for your order</p>
        </footer>
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: "window.onload = function() { window.print(); }",
        }}
      />
    </div>
  );
}
