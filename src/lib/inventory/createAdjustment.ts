import { prisma } from "@/lib/prisma";
import { roundMoney } from "@/lib/pos/money";
import {
  isAdjustmentType,
  type AdjustmentTypeId,
} from "@/lib/inventory/adjustmentTypes";
import { resolveProductUnitCost } from "@/lib/inventory/resolveUnitCost";
export interface AdjustLineInput {
  productId: string;
  quantityChange: number;
  /** Optional override; otherwise resolved from last purchase / price. */
  unitCost?: number;
}

export interface CreateAdjustmentInput {
  type: string;
  notes?: string | null;
  date?: string | null;
  userId: string;
  items: AdjustLineInput[];
}

/**
 * Record inventory adjustment, apply stock deltas locally, sync WC batch.
 */
export async function createInventoryAdjustment(input: CreateAdjustmentInput) {
  if (!isAdjustmentType(input.type)) {
    throw new Error("Invalid adjustment type");
  }
  const type = input.type as AdjustmentTypeId;

  if (!input.items?.length) {
    throw new Error("Add at least one product line");
  }

  const adjustmentDate = input.date ? new Date(input.date) : new Date();
  if (Number.isNaN(adjustmentDate.getTime())) {
    throw new Error("Invalid date");
  }

  const notes =
    input.notes != null && String(input.notes).trim()
      ? String(input.notes).trim()
      : null;

  // Aggregate duplicate product lines
  const merged = new Map<string, { quantityChange: number; unitCost?: number }>();
  for (const raw of input.items) {
    const productId = String(raw.productId ?? "").trim();
    const quantityChange = Math.trunc(Number(raw.quantityChange));
    if (!productId) throw new Error("Invalid product on a line");
    if (!Number.isFinite(quantityChange) || quantityChange === 0) {
      throw new Error("Quantity change cannot be zero");
    }
    const prev = merged.get(productId);
    if (prev) {
      prev.quantityChange += quantityChange;
      if (raw.unitCost != null && Number.isFinite(Number(raw.unitCost))) {
        prev.unitCost = Number(raw.unitCost);
      }
    } else {
      merged.set(productId, {
        quantityChange,
        unitCost:
          raw.unitCost != null && Number.isFinite(Number(raw.unitCost))
            ? Number(raw.unitCost)
            : undefined,
      });
    }
  }

  for (const [id, row] of merged) {
    if (row.quantityChange === 0) {
      throw new Error(`Net quantity change for product ${id} is zero`);
    }
  }

  const stockAfter = new Map<
    string,
    { wcId: number; stockQuantity: number; name: string }
  >();

  const created = await prisma.$transaction(async (tx) => {
    const lineData: {
      productId: string;
      quantityChange: number;
      unitCost: number;
    }[] = [];

    for (const [productId, row] of merged) {
      const product = await tx.product.findFirst({
        where: { id: productId, isDeleted: false },
      });
      if (!product) {
        throw new Error(`Product not found: ${productId}`);
      }

      const unitCost =
        row.unitCost != null && row.unitCost >= 0
          ? roundMoney(row.unitCost)
          : await resolveProductUnitCost(tx, productId);

      const nextStock = product.stockQuantity + row.quantityChange;
      if (nextStock < 0) {
        throw new Error(
          `Insufficient stock for "${product.name}" (have ${product.stockQuantity}, change ${row.quantityChange})`,
        );
      }

      const updated = await tx.product.update({
        where: { id: productId },
        data: {
          stockQuantity: nextStock,
          stockStatus: nextStock > 0 ? "instock" : "outofstock",
        },
      });

      stockAfter.set(productId, {
        wcId: updated.wcId,
        stockQuantity: updated.stockQuantity,
        name: updated.name,
      });

      lineData.push({
        productId,
        quantityChange: row.quantityChange,
        unitCost,
      });
    }

    const adjustment = await tx.inventoryAdjustment.create({
      data: {
        type,
        notes,
        date: adjustmentDate,
        userId: input.userId,
        items: {
          create: lineData,
        },
      },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, sku: true, barcode: true, wcId: true },
            },
          },
        },
        user: { select: { id: true, username: true } },
      },
    });

    return adjustment;
  });

  const financialImpact = roundMoney(
    created.items.reduce(
      (sum, item) => sum + item.quantityChange * item.unitCost,
      0,
    ),
  );

  const wooSynced = 0;
  const wooError: string | null = null;

  return {
    adjustment: {
      id: created.id,
      date: created.date.toISOString(),
      type: created.type,
      notes: created.notes,
      userId: created.userId,
      userName: created.user.username,
      financialImpact,
      itemCount: created.items.length,
      items: created.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        quantityChange: item.quantityChange,
        unitCost: item.unitCost,
        lineImpact: roundMoney(item.quantityChange * item.unitCost),
      })),
    },
    stockUpdated: stockAfter.size,
    wooSynced,
    wooError,
  };
}
