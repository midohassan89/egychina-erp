import { orderStatusLabel, type OrderStatusCode } from "@/lib/orders/status";

const EN: Record<OrderStatusCode, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PREPARING: "Being prepared",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  COMPLETED: "Completed",
  PARTIALLY_RETURNED: "Partially returned",
  RETURNED: "Returned",
  CANCELLED: "Cancelled",
};

const ZH: Record<OrderStatusCode, string> = {
  PENDING: "待处理",
  CONFIRMED: "已确认",
  PREPARING: "正在备货",
  SHIPPED: "已发货",
  DELIVERED: "已送达",
  COMPLETED: "已完成",
  PARTIALLY_RETURNED: "部分退货",
  RETURNED: "已退货",
  CANCELLED: "已取消",
};

export function orderStatusNotification(
  status: string,
  orderNumber: string,
) {
  const code = (status in EN ? status : "PENDING") as OrderStatusCode;
  const number = orderNumber || "";
  return {
    titleAr: "تحديث حالة الطلب",
    titleEn: "Order update",
    titleZh: "订单状态更新",
    bodyAr: `طلبك رقم ${number} أصبح الآن: ${orderStatusLabel(code)}`,
    bodyEn: `Your order ${number} is now: ${EN[code]}`,
    bodyZh: `您的订单 ${number} 现在是：${ZH[code]}`,
  };
}
