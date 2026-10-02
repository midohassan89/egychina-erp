import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isDriverCategory, requireDriver } from "@/lib/driver/auth";
import { saveCompressedDriverImage } from "@/lib/driver/images";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const IMAGE_FIELDS = [
  "odometerImage",
  "pumpImage",
  "receiptImage",
  "tollImage",
] as const;

type ImageField = (typeof IMAGE_FIELDS)[number];

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
    ok: true,
    expenses: expenses.map(serializeExpense),
  });
}

/**
 * POST /api/driver/expenses
 * Accepts multipart/form-data (preferred) or JSON.
 * Fields: category, amount
 * Files: odometerImage?, pumpImage?, receiptImage?, tollImage?
 */
export async function POST(request: Request) {
  const driver = await requireDriver(request);
  if (!driver) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const contentType = request.headers.get("content-type") ?? "";
    const isMultipart = contentType.toLowerCase().includes("multipart/form-data");

    let category = "";
    let amount = 0;
    const imageBuffers: Partial<Record<ImageField, Buffer>> = {};

    if (isMultipart) {
      const formData = await request.formData();

      category = String(
        formData.get("category") ?? formData.get("Category") ?? "",
      )
        .trim()
        .toUpperCase();
      amount = Number(
        formData.get("amount") ?? formData.get("Amount") ?? NaN,
      );

      for (const field of IMAGE_FIELDS) {
        const file = await extractFormFile(formData, field);
        if (file) imageBuffers[field] = file;
      }
    } else {
      // Fallback: JSON with optional base64 images
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return NextResponse.json(
          {
            error:
              "Expected multipart/form-data (or JSON). Check Content-Type header.",
          },
          { status: 400 },
        );
      }
      category = String(body.category ?? "").trim().toUpperCase();
      amount = Number(body.amount);
      for (const field of IMAGE_FIELDS) {
        const raw = body[field];
        if (typeof raw === "string" && raw.trim()) {
          const b64 = raw.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
          imageBuffers[field] = Buffer.from(b64, "base64");
        }
      }
    }

    if (!isDriverCategory(category)) {
      return NextResponse.json(
        {
          error: "category must be FUEL, TOLL, OIL, or MAINTENANCE",
          received: category || null,
        },
        { status: 400 },
      );
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "amount must be greater than 0", received: amount },
        { status: 400 },
      );
    }

    const urls: Record<ImageField, string | null> = {
      odometerImage: null,
      pumpImage: null,
      receiptImage: null,
      tollImage: null,
    };

    for (const field of IMAGE_FIELDS) {
      const buf = imageBuffers[field];
      if (!buf?.length) continue;
      try {
        urls[field] = await saveCompressedDriverImage(
          buf,
          `${driver.id}-${field}`,
        );
      } catch (err) {
        console.error(`[api/driver/expenses] sharp failed for ${field}`, err);
        return NextResponse.json(
          {
            error: `Failed to process image: ${field}`,
            detail: err instanceof Error ? err.message : "sharp error",
          },
          { status: 400 },
        );
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
      {
        ok: true,
        message: "Expense submitted successfully",
        expense: serializeExpense(expense),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[api/driver/expenses POST]", error);
    return NextResponse.json(
      {
        error: "Could not submit expense",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 },
    );
  }
}

/** Read a File/Blob from formData (supports common alternate keys). */
async function extractFormFile(
  formData: FormData,
  field: ImageField,
): Promise<Buffer | null> {
  const aliases = [
    field,
    field.replace("Image", ""),
    field.toLowerCase(),
    // e.g. odometer_image
    field.replace(/Image$/, "_image").toLowerCase(),
  ];

  for (const key of aliases) {
    const value = formData.get(key);
    const buf = await fileToBuffer(value);
    if (buf) return buf;
  }

  // Some clients append multiple parts with getAll
  for (const key of aliases) {
    for (const value of formData.getAll(key)) {
      const buf = await fileToBuffer(value);
      if (buf) return buf;
    }
  }

  return null;
}

async function fileToBuffer(value: FormDataEntryValue | null): Promise<Buffer | null> {
  if (!value || typeof value === "string") return null;
  // File / Blob in the App Router FormData implementation
  if (typeof (value as Blob).arrayBuffer !== "function") return null;
  const blob = value as Blob;
  const size = typeof blob.size === "number" ? blob.size : 0;
  if (size <= 0) return null;
  const ab = await blob.arrayBuffer();
  if (!ab.byteLength) return null;
  return Buffer.from(ab);
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
