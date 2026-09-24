import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  permanentlyDeleteProduct,
  ProductServiceError,
  restoreProduct,
  setProductFavorite,
  softDeleteProduct,
  updateProductAndSync,
  type PermanentDeleteScope,
  type StockStatus,
} from "@/lib/products/productService";
import { WooCommerceError } from "@/lib/woocommerce/client";
import { logAuditAction } from "@/lib/audit/logAuditAction";

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

function errorResponse(error: unknown) {
  if (error instanceof ProductServiceError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode },
    );
  }
  if (error instanceof WooCommerceError) {
    return NextResponse.json(
      { error: error.message, endpoint: error.endpoint },
      { status: error.statusCode ?? 502 },
    );
  }
  console.error("[api/products/[id]]", error);
  return NextResponse.json({ error: "Request failed" }, { status: 500 });
}

/**
 * PATCH — update product fields locally + PUT to WooCommerce.
 * `isFavorite` updates Prisma only. Soft-delete via isDeleted.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;

  try {
    const body = (await request.json()) as {
      name?: string;
      sku?: string | null;
      barcode?: string | null;
      price?: number;
      salePrice?: number | null;
      stockStatus?: StockStatus;
      stockQuantity?: number;
      linkedProductId?: string | null;
      bundleMultiplier?: number | null;
      isDeleted?: boolean;
      isFavorite?: boolean;
    };

    if (body.isDeleted === true) {
      const product = await softDeleteProduct(id);
      await logAuditAction(session.user.id, "DELETE", "PRODUCT", id, {
        soft: true,
        name: product.name,
      });
      return NextResponse.json({ ok: true, product });
    }

    if (body.isDeleted === false) {
      const product = await restoreProduct(id);
      await logAuditAction(session.user.id, "UPDATE", "PRODUCT", id, {
        restored: true,
        name: product.name,
      });
      return NextResponse.json({ ok: true, product });
    }

    if (typeof body.isFavorite === "boolean") {
      const product = await setProductFavorite(id, body.isFavorite);
      await logAuditAction(session.user.id, "UPDATE", "PRODUCT", id, {
        isFavorite: body.isFavorite,
        name: product.name,
      });
      return NextResponse.json({ ok: true, product });
    }

    if (body.stockQuantity !== undefined) {
      return NextResponse.json(
        {
          error:
            "Stock quantity is read-only. Use Opening Balances or Purchase Invoices.",
        },
        { status: 400 },
      );
    }

    const product = await updateProductAndSync(id, {
      name: body.name,
      sku: body.sku,
      barcode: body.barcode,
      price: body.price,
      salePrice: body.salePrice,
      stockStatus: body.stockStatus,
      linkedProductId: body.linkedProductId,
      bundleMultiplier: body.bundleMultiplier,
    });

    await logAuditAction(session.user.id, "UPDATE", "PRODUCT", id, {
      name: product.name,
      changes: {
        name: body.name,
        sku: body.sku,
        barcode: body.barcode,
        price: body.price,
        salePrice: body.salePrice,
        stockStatus: body.stockStatus,
        linkedProductId: body.linkedProductId,
        bundleMultiplier: body.bundleMultiplier,
      },
    });

    return NextResponse.json({ ok: true, product });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * DELETE — permanent delete.
 * Query `scope=erp` (Prisma only) or `scope=both` (Prisma + WC force=true).
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const scopeParam = searchParams.get("scope") ?? "erp";
  const scope: PermanentDeleteScope =
    scopeParam === "both" ? "both" : "erp";

  try {
    const result = await permanentlyDeleteProduct(id, scope);
    await logAuditAction(session.user.id, "DELETE", "PRODUCT", id, {
      permanent: true,
      scope,
    });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
