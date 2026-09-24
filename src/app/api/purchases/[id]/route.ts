import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth/roles";
import { logAuditAction } from "@/lib/audit/logAuditAction";
import { PurchaseServiceError } from "@/lib/purchases/createPurchase";
import { updatePurchaseInvoice } from "@/lib/purchases/updatePurchase";

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

/** GET /api/purchases/[id] — invoice detail with line items */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid invoice id" }, { status: 400 });
  }

  const invoice = await prisma.purchaseInvoice.findUnique({
    where: { id },
    include: {
      supplier: { select: { id: true, name: true, phone: true } },
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              barcode: true,
              wcId: true,
              price: true,
              salePrice: true,
              purchasePackSize: true,
            },
          },
        },
      },
    },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  return NextResponse.json({
    invoice: {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.date.toISOString(),
      supplierId: invoice.supplierId,
      supplierName: invoice.supplier.name,
      supplierPhone: invoice.supplier.phone,
      totalAmount: invoice.totalAmount,
      paidAmount: invoice.paidAmount,
      status: invoice.status,
      dueAmount:
        Math.round((invoice.totalAmount - invoice.paidAmount) * 100) / 100,
      items: invoice.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        sku: item.product.sku,
        barcode: item.product.barcode,
        wcId: item.product.wcId,
        quantity: item.quantity,
        unitCost: item.unitCost,
        lineTotal: item.lineTotal,
        price: item.product.price,
        salePrice: item.product.salePrice,
        purchasePackSize: item.product.purchasePackSize,
      })),
    },
  });
}

/**
 * PATCH /api/purchases/[id] — Admin-only edit with stock deltas.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session.user.role)) {
    return NextResponse.json(
      { error: "Only Administrators can edit purchase invoices" },
      { status: 403 },
    );
  }

  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid invoice id" }, { status: 400 });
  }

  let body: {
    supplierId?: number;
    invoiceNumber?: string | null;
    date?: string | null;
    paidAmount?: number;
    items?: {
      productId?: string;
      quantity?: number;
      unitCost?: number;
    }[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const result = await updatePurchaseInvoice(id, {
      supplierId: Number(body.supplierId),
      invoiceNumber: body.invoiceNumber,
      date: body.date,
      paidAmount: body.paidAmount,
      items: (body.items ?? []).map((item) => ({
        productId: String(item.productId ?? ""),
        quantity: Number(item.quantity),
        unitCost: Number(item.unitCost),
      })),
    });

    await logAuditAction(session.user.id, "UPDATE", "INVOICE", id, {
      type: "purchase",
      adminName: session.user.name,
      invoiceNumber: result.invoice.invoiceNumber,
      totalAmount: result.invoice.totalAmount,
      stockDeltas: result.stockDeltas,
      message: `Admin ${session.user.name ?? "unknown"} edited Purchase Order #${id}`,
    });

    return NextResponse.json({
      ok: true,
      ...result,
      message: result.wooError
        ? `Invoice updated; WooCommerce sync warning: ${result.wooError}`
        : `Invoice #${id} updated · ${result.stockUpdated} products stock adjusted`,
    });
  } catch (error) {
    if (error instanceof PurchaseServiceError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    console.error("[api/purchases/[id] PATCH]", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
