import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isDriverCategory, requireDriver } from "@/lib/driver/auth";
import { saveCompressedDriverImage } from "@/lib/driver/images";

export const dynamic = "force-dynamic";

/**
 * GET /api/driver/expenses — list current driver's expense history.
 */
export async function GET(request: Request) {
  const driver = await requireDriver(request);
  if (!driver) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const expenses = await prisma.driverExpense.findMany({
    where: { driverId: driver.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    expenses: expenses.map(serializeExpense),
  });
}

/**
 * POST /api/driver/expenses — submit a new expense (multipart or JSON).
 * Multipart fields: category, amount, odometerImage?, pumpImage?, receiptImage?, tollImage?
 */
export async function POST(request: Request) {
  const driver = await requireDriver(request);
  if (!driver) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const contentType = request.headers.get("content-type") ?? "";
    let category = "";
    let amount = 0;
    const imageBuffers: Record<string, Buffer | null> = {
      odometerImage: null,
      pumpImage: null,
      receiptImage: null,
      tollImage: null,
    };

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      category = String(form.get("category") ?? "").trim().toUpperCase();
      amount = Number(form.get("amount"));
      for (const key of Object.keys(imageBuffers)) {
        const file = form.get(key);
        if (file && typeof file === "object" && "arrayBuffer" in file) {
          const blob = file as File;
          if (blob.size > 0) {
            imageBuffers[key] = Buffer.from(await blob.arrayBuffer());
          }
        }
      }
    } else {
      const body = (await request.json()) as {
        category?: unknown;
        amount?: unknown;
        odometerImage?: unknown;
        pumpImage?: unknown;
        receiptImage?: unknown;
        tollImage?: unknown;
      };
      category = String(body.category ?? "").trim().toUpperCase();
      amount = Number(body.amount);
      // Optional base64 data URLs
      const imageKeys = [
        "odometerImage",
        "pumpImage",
        "receiptImage",
        "tollImage",
      ] as const;
      for (const key of imageKeys) {
        const raw = body[key];
        if (typeof raw === "string" && raw.trim()) {
          const b64 = raw.replace(/^data:image\/\w+;base64,/, "");
          imageBuffers[key] = Buffer.from(b64, "base64");
        }
      }
    }

    if (!isDriverCategory(category)) {
      return NextResponse.json(
        { error: "category must be FUEL, TOLL, OIL, or MAINTENANCE" },
        { status: 400 },
      );
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "amount must be greater than 0" },
        { status: 400 },
      );
    }

    const urls: Record<string, string | null> = {
      odometerImage: null,
      pumpImage: null,
      receiptImage: null,
      tollImage: null,
    };
    for (const [key, buf] of Object.entries(imageBuffers)) {
      if (buf) {
        urls[key] = await saveCompressedDriverImage(buf, `${driver.id}-${key}`);
      }
    }

    const expense = await prisma.driverExpense.create({
      data: {
        driverId: driver.id,
        category,
        amount,
        status: "PENDING",
        odometerImage: urls.odometerImage,
        pumpImage: urls.pumpImage,
        receiptImage: urls.receiptImage,
        tollImage: urls.tollImage,
      },
    });

    return NextResponse.json(
      { ok: true, expense: serializeExpense(expense) },
      { status: 201 },
    );
  } catch (error) {
    console.error("[api/driver/expenses POST]", error);
    return NextResponse.json(
      { error: "Could not submit expense" },
      { status: 500 },
    );
  }
}

function serializeExpense(expense: {
  id: string;
  driverId: string;
  category: string;
  amount: number;
  approvedAmount: number | null;
  status: string;
  adminNotes: string | null;
  odometerImage: string | null;
  pumpImage: string | null;
  receiptImage: string | null;
  tollImage: string | null;
  linkedExpenseId: number | null;
  createdAt: Date;
  reviewedAt: Date | null;
}) {
  return {
    id: expense.id,
    driverId: expense.driverId,
    category: expense.category,
    amount: expense.amount,
    approvedAmount: expense.approvedAmount,
    status: expense.status,
    adminNotes: expense.adminNotes,
    odometerImage: expense.odometerImage,
    pumpImage: expense.pumpImage,
    receiptImage: expense.receiptImage,
    tollImage: expense.tollImage,
    linkedExpenseId: expense.linkedExpenseId,
    createdAt: expense.createdAt.toISOString(),
    reviewedAt: expense.reviewedAt?.toISOString() ?? null,
  };
}
