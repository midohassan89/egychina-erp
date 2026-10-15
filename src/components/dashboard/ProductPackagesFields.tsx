"use client";

import { Plus, Trash2 } from "lucide-react";

export const PACKAGE_TYPES = [
  { ar: "كرتونة", en: "Carton", zh: "箱" },
  { ar: "شرينك", en: "Shrink", zh: "收缩装" },
  { ar: "علبة", en: "Box", zh: "盒" },
  { ar: "كيس", en: "Bag", zh: "袋" },
  { ar: "باكت", en: "Pack", zh: "包" },
] as const;

export type PackageType = (typeof PACKAGE_TYPES)[number]["ar"];

export interface PackageDraft {
  key: string;
  barcode: string;
  packageType: PackageType | "";
  packSize: string;
  price: string;
  /** Kept when the saved name is not one of the generated labels. */
  name: string;
  nameEn: string;
  nameZh: string;
}

export interface PackagePayload {
  barcode: string;
  name: string;
  nameEn: string | null;
  nameZh: string | null;
  packSize: number;
  price: number | null;
}

export interface PackageNameSource {
  name: string;
  nameEn?: string;
  nameZh?: string;
}

export function emptyPackageDraft(): PackageDraft {
  return {
    key:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
    barcode: "",
    packageType: "",
    packSize: "",
    price: "",
    name: "",
    nameEn: "",
    nameZh: "",
  };
}

export function packageTypeMeta(type: string) {
  return PACKAGE_TYPES.find((row) => row.ar === type) ?? null;
}

/** Saved label: "بيبسي كانز - شرينك 6". */
export function buildPackageName(
  productName: string,
  packageType: string,
  packSize: string | number,
): string {
  const base = productName.trim();
  const type = packageType.trim();
  const size = Math.floor(Number(packSize));
  if (!base || !type || !Number.isFinite(size) || size < 1) return "";
  return `${base} - ${type} ${size}`;
}

export function packageDraftsFromRows(
  rows: {
    id?: string;
    barcode: string;
    name: string;
    nameEn?: string | null;
    nameZh?: string | null;
    packSize: number;
    price: number | null;
  }[],
  productName = "",
): PackageDraft[] {
  return rows.map((row) => {
    const matched = PACKAGE_TYPES.find(
      (type) =>
        row.name === buildPackageName(productName, type.ar, row.packSize),
    );
    return {
      key: row.id ?? emptyPackageDraft().key,
      barcode: row.barcode,
      packageType: matched?.ar ?? "",
      packSize: String(row.packSize),
      price: row.price == null ? "" : String(row.price),
      name: row.name,
      nameEn: row.nameEn ?? "",
      nameZh: row.nameZh ?? "",
    };
  });
}

export function packageNamesForDraft(
  row: PackageDraft,
  product: PackageNameSource,
): { name: string; nameEn: string; nameZh: string } {
  const meta = packageTypeMeta(row.packageType);
  const size = Math.floor(Number(row.packSize));
  if (meta && Number.isFinite(size) && size >= 1) {
    return {
      name: buildPackageName(product.name, meta.ar, size),
      nameEn: product.nameEn?.trim()
        ? buildPackageName(product.nameEn, meta.en, size)
        : "",
      nameZh: product.nameZh?.trim()
        ? buildPackageName(product.nameZh, meta.zh, size)
        : "",
    };
  }
  return {
    name: row.name.trim(),
    nameEn: row.nameEn.trim(),
    nameZh: row.nameZh.trim(),
  };
}

export function validatePackageDrafts(
  rows: PackageDraft[],
  productBarcode?: string,
  productName?: string,
): string | null {
  const seen = new Set<string>();
  const ownBarcode = productBarcode?.trim() ?? "";
  for (const row of rows) {
    const barcode = row.barcode.trim();
    const packSize = Math.floor(Number(row.packSize));
    const names = packageNamesForDraft(row, { name: productName ?? "" });
    if (!barcode || !row.packSize.trim() || (!row.packageType && !names.name)) {
      return "باركود العبوة ونوع التعبئة وعدد القطع مطلوبة";
    }
    if (row.packageType && !productName?.trim()) {
      return "اسم المنتج مطلوب لتسمية العبوة";
    }
    if (!names.name) {
      return "اسم العبوة مطلوب";
    }
    if (!Number.isFinite(packSize) || packSize < 1) {
      return "عدد القطع يجب أن يكون رقماً صحيحاً أكبر من صفر";
    }
    if (row.price.trim()) {
      const price = Number(row.price);
      if (!Number.isFinite(price) || price < 0) {
        return "سعر العبوة غير صالح";
      }
    }
    if (ownBarcode && barcode === ownBarcode) {
      return "باركود العبوة يجب أن يختلف عن باركود المنتج";
    }
    if (seen.has(barcode)) return "باركود العبوة مكرر";
    seen.add(barcode);
  }
  return null;
}

export function packageDraftsToPayload(
  rows: PackageDraft[],
  product: PackageNameSource,
): PackagePayload[] {
  return rows.map((row) => {
    const names = packageNamesForDraft(row, product);
    return {
      barcode: row.barcode.trim(),
      name: names.name,
      nameEn: names.nameEn || null,
      nameZh: names.nameZh || null,
      packSize: Math.floor(Number(row.packSize)),
      price: row.price.trim() === "" ? null : Number(row.price),
    };
  });
}

export function ProductPackagesFields({
  packages,
  productName,
  productNameEn = "",
  productNameZh = "",
  onChange,
}: {
  packages: PackageDraft[];
  productName: string;
  productNameEn?: string;
  productNameZh?: string;
  onChange: (packages: PackageDraft[]) => void;
}) {
  function update(key: string, patch: Partial<PackageDraft>) {
    onChange(
      packages.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">
          العبوات الإضافية (كرتونة / شرينك)
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">
          باركود مختلف يبيع عدداً من وحدات المنتج الأساسية. الاسم يُبنى بالعربية
          والإنجليزية والصينية من اسم المنتج.
        </p>
      </div>

      {packages.map((row, index) => {
        const names = packageNamesForDraft(row, {
          name: productName,
          nameEn: productNameEn,
          nameZh: productNameZh,
        });
        return (
          <div
            key={row.key}
            className="space-y-3 rounded-lg border border-slate-200 bg-white p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500">
                عبوة {index + 1}
              </span>
              <button
                type="button"
                onClick={() =>
                  onChange(packages.filter((item) => item.key !== row.key))
                }
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                حذف
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-slate-700">
                  باركود العبوة
                </span>
                <input
                  required
                  value={row.barcode}
                  onChange={(e) => update(row.key, { barcode: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-slate-700">
                  نوع التعبئة
                </span>
                <select
                  required={row.name.trim() === ""}
                  value={row.packageType}
                  onChange={(e) =>
                    update(row.key, {
                      packageType: e.target.value as PackageType | "",
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                >
                  <option value="">اختر نوع التعبئة</option>
                  {PACKAGE_TYPES.map((type) => (
                    <option key={type.ar} value={type.ar}>
                      {type.ar}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-slate-700">
                  عدد القطع
                </span>
                <input
                  required
                  type="number"
                  min={1}
                  step={1}
                  value={row.packSize}
                  onChange={(e) => update(row.key, { packSize: e.target.value })}
                  placeholder="12"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-slate-700">
                  سعر العبوة
                </span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={row.price}
                  onChange={(e) => update(row.key, { price: e.target.value })}
                  placeholder="يترك فارغاً لحساب السعر تلقائياً"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </label>
            </div>
            {names.name && (
              <div className="space-y-1 text-xs text-slate-500">
                <p>
                  الاسم:{" "}
                  <span className="font-medium text-slate-800">{names.name}</span>
                </p>
                <p>
                  English:{" "}
                  <span className="font-medium text-slate-800">
                    {names.nameEn || "—"}
                  </span>
                </p>
                <p>
                  中文:{" "}
                  <span className="font-medium text-slate-800">
                    {names.nameZh || "—"}
                  </span>
                </p>
              </div>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => onChange([...packages, emptyPackageDraft()])}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <Plus className="h-4 w-4" />
        إضافة عبوة
      </button>
    </section>
  );
}
