import type { Prisma, PrismaClient } from "@prisma/client";
import { normalizeOrderStatus, type OrderStatusCode } from "@/lib/orders/status";

type Db = Prisma.TransactionClient | PrismaClient;

const AWARD_STATUSES = new Set<OrderStatusCode>(["COMPLETED", "DELIVERED"]);
const REVOKE_STATUSES = new Set<OrderStatusCode>(["RETURNED", "CANCELLED"]);

export interface OrderPointsSnapshot {
  id: string;
  status: string;
  customerId: string | null;
  pointsEarned: number | null;
  pointsAwarded: boolean;
}

/**
 * Apply loyalty for a status change and save the new status.
 * Completion awards the points stored on the order once.
 * A full return or cancellation takes those same points back once.
 */
export async function applyOrderStatusLoyalty(
  tx: Db,
  order: OrderPointsSnapshot,
  newStatus: OrderStatusCode,
) {
  const points = order.pointsEarned ?? 0;
  const canMovePoints = Boolean(order.customerId) && points > 0;
  const previous = normalizeOrderStatus(order.status);
  const enteringAwardState =
    AWARD_STATUSES.has(newStatus) &&
    previous !== "COMPLETED" &&
    previous !== "DELIVERED";

  if (canMovePoints && enteringAwardState && !order.pointsAwarded) {
    await tx.customer.update({
      where: { id: order.customerId! },
      data: { pointsBalance: { increment: points } },
    });
    await tx.pointsTransaction.create({
      data: {
        customerId: order.customerId!,
        points,
        type: "EARN",
        description: `Order ${order.id}`,
      },
    });
    return tx.order.update({
      where: { id: order.id },
      data: { status: newStatus, pointsAwarded: true },
    });
  }

  if (canMovePoints && REVOKE_STATUSES.has(newStatus) && order.pointsAwarded) {
    const settledReturn = await tx.returnRequest.findFirst({
      where: { orderId: order.id, pointsDeducted: true },
      select: { id: true },
    });
    if (settledReturn) {
      return tx.order.update({
        where: { id: order.id },
        data: { status: newStatus },
      });
    }

    const customer = await tx.customer.findUnique({
      where: { id: order.customerId! },
      select: { pointsBalance: true },
    });
    const balance = customer?.pointsBalance ?? 0;
    const deducted = Math.min(balance, points);
    if (deducted > 0) {
      await tx.customer.update({
        where: { id: order.customerId! },
        data: { pointsBalance: { decrement: deducted } },
      });
      await tx.pointsTransaction.create({
        data: {
          customerId: order.customerId!,
          points: -deducted,
          type: "EARN",
          description: `Order ${order.id} reversed`,
        },
      });
    }
    return tx.order.update({
      where: { id: order.id },
      data: { status: newStatus, pointsAwarded: false },
    });
  }

  return tx.order.update({
    where: { id: order.id },
    data: { status: newStatus },
  });
}
