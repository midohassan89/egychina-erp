import { prisma } from "@/lib/prisma";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "PIN_OVERRIDE"
  | "WITHDRAW"
  | "PASSWORD_CHANGE";

export type AuditEntity =
  | "PRODUCT"
  | "INVOICE"
  | "POS"
  | "USER"
  | "TREASURY"
  | "INVENTORY"
  | string;

/**
 * Insert an AuditLog row. Never throws to the caller — logging must not
 * break the primary business action.
 */
export async function logAuditAction(
  userId: string,
  action: AuditAction | string,
  entity: AuditEntity,
  entityId?: string | number | null,
  details?: Record<string, unknown> | string | null,
): Promise<void> {
  try {
    if (!userId) return;

    const detailsStr =
      details == null
        ? null
        : typeof details === "string"
          ? details
          : JSON.stringify(details);

    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId:
          entityId == null || entityId === ""
            ? null
            : String(entityId),
        details: detailsStr,
      },
    });
  } catch (error) {
    console.error("[audit] failed to write log", error);
  }
}
