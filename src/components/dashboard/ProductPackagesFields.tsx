"use client";

import { useEffect, useRef } from "react";
import { Box, Boxes, Layers, Package2, PackagePlus, ShoppingBag, Star, Trash2, type LucideIcon } from "lucide-react";
import { clsx } from "clsx";

export const PACKAGE_TYPES = [
  { ar: "كرتونة", en: "Carton", zh: "箱" },
  { ar: "شرينك", en: "Shrink", zh: "收缩装" },
  { ar: "علبة", en: "Box", zh: "盒" },
  { ar: "كيس", en: "Bag", zh: "袋" },
  { ar: "باكت", en: "Pack", zh: "包" },
] as const;

export type PackageType = (typeof PACKAGE_TYPES)[number]["ar"];

const COMMON_PACK_SIZES = [3, 4, 6, 8, 10, 12, 16, 18, 20, 24, 27, 30, 48] as const;

function sameMoney(a: number, b: number): boolean {
  return (
    Number.isFinite(a) &&
    Number.isFinite(b) &&
    Math.round(a * 100) === Math.round(b * 100)
  );
}

function formatPackagePrice(amount: number): string {
  return String(Math.round(amount * 100) / 100);
}

/** Empty, zero, or still equal to the last automatic total. */
function priceFollowsCalculation(
  currentPrice: string,
  previousCalculated: number | null,
): boolean {
  const trimmed = currentPrice.trim();
  if (!trimmed) return true;
  const current = Number(trimmed);
  if (!Number.isFinite(current) || current === 0) return true;
  return (
    previousCalculated != null && sameMoney(current, previousCalculated)
  );
}

const PACKAGE_TYPE_ICONS: Record<PackageType, LucideIcon> = {
  كرتونة: Boxes,
  شرينك: Layers,
  علبة: Box,
  كيس: ShoppingBag,
  باكت: Package2,
};

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
  isFavorite: boolean;
}

export interface PackagePayload {
  barcode: string;
  name: string;
  nameEn: string | null;
  nameZh: string | null;
  packSize: number;
  price: number | null;
  isFavorite: boolean;
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
    isFavorite: false,
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
    isFavorite?: boolean;
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
      isFavorite: Boolean(row.isFavorite),
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
      isFavorite: row.isFavorite,
    };
  });
}

export function ProductPackagesFields({
  packages,
  productName,
  productNameEn = "",
  productNameZh = "",
  unitPrice = 0,
  onChange,
}: {
  packages: PackageDraft[];
  productName: string;
  productNameEn?: string;
  productNameZh?: string;
  /** Discounted unit price when it is above zero, otherwise the base price. */
  unitPrice?: number;
  onChange: (packages: PackageDraft[]) => void;
}) {
  const packagesRef = useRef(packages);
  const onChangeRef = useRef(onChange);
  const unitPriceRef = useRef(unitPrice);
  packagesRef.current = packages;
  onChangeRef.current = onChange;

  useEffect(() => {
    const previousUnit = unitPriceRef.current;
    unitPriceRef.current = unitPrice;
    if (sameMoney(previousUnit, unitPrice) || (!(previousUnit > 0) && !(unitPrice > 0))) {
      return;
    }
    if (!(unitPrice > 0)) return;

    let changed = false;
    const next = packagesRef.current.map((row) => {
      const count = Math.floor(Number(row.packSize));
      if (count < 1) return row;
      const previousCalculated = previousUnit > 0 ? previousUnit * count : null;
      if (!priceFollowsCalculation(row.price, previousCalculated)) return row;
      const price = formatPackagePrice(unitPrice * count);
      if (row.price === price) return row;
      changed = true;
      return { ...row, price };
    });
    if (changed) onChangeRef.current(next);
  }, [unitPrice]);

  function update(key: string, patch: Partial<PackageDraft>) {
    onChange(
      packages.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function applyPackSize(key: string, packSize: string) {
    onChange(
      packages.map((row) => {
        if (row.key !== key) return row;
        const previousCount = Math.floor(Number(row.packSize));
        const nextCount = Math.floor(Number(packSize));
        const previousCalculated =
          unitPrice > 0 && previousCount >= 1 ? unitPrice * previousCount : null;
        const price =
          unitPrice > 0 &&
          nextCount >= 1 &&
          priceFollowsCalculation(row.price, previousCalculated)
            ? formatPackagePrice(unitPrice * nextCount)
            : row.price;
        return { ...row, packSize, price };
      }),
    );
  }

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Boxes className="h-5 w-5 shrink-0 text-emerald-600" />
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
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  title="إضافة العبوة لمفضلة نقطة البيع (POS)"
                  aria-label="إضافة العبوة لمفضلة نقطة البيع (POS)"
                  aria-pressed={row.isFavorite}
                  onClick={() =>
                    update(row.key, { isFavorite: !row.isFavorite })
                  }
                  className="inline-flex items-center justify-center rounded-lg p-1.5"
                >
                  <Star
                    className={clsx(
                      "h-4 w-4 transition-colors",
                      row.isFavorite
                        ? "fill-yellow-400 text-yellow-500 hover:text-yellow-600"
                        : "text-gray-400 hover:fill-yellow-50 hover:text-yellow-400",
                    )}
                  />
                </button>
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
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-slate-700">
                  باركود العبوة
                </span>
                <input
                  required
                  dir="ltr"
                  value={row.barcode}
                  onChange={(e) => update(row.key, { barcode: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-left font-mono text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </label>
              <div className="space-y-1 sm:col-span-2">
                <span className="text-xs font-medium text-slate-700">
                  نوع التعبئة
                </span>
                <div
                  className="grid grid-cols-3 gap-3 sm:grid-cols-5"
                  role="group"
                  aria-label="نوع التعبئة"
                >
                  {PACKAGE_TYPES.map((type) => {
                    const selected = row.packageType === type.ar;
                    const Icon = PACKAGE_TYPE_ICONS[type.ar];
                    return (
                      <button
                        key={type.ar}
                        type="button"
                        aria-pressed={selected}
                        onClick={() =>
                          update(row.key, { packageType: type.ar })
                        }
                        className={clsx(
                          "flex flex-col items-center justify-center gap-2 rounded-xl p-3 text-xs transition-all duration-200",
                          selected
                            ? "border-2 border-emerald-500 bg-emerald-50 font-bold text-emerald-700"
                            : "border border-gray-200 bg-white text-gray-500 hover:border-emerald-300 hover:bg-gray-50",
                        )}
                      >
                        <Icon className="h-5 w-5" aria-hidden />
                        {type.ar}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-1">
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
                    onChange={(e) => applyPackSize(row.key, e.target.value)}
                    placeholder="12"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  />
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {COMMON_PACK_SIZES.map((quantity) => {
                    const active = Number(row.packSize) === quantity;
                    return (
                      <button
                        key={quantity}
                        type="button"
                        aria-pressed={active}
                        onClick={() => applyPackSize(row.key, String(quantity))}
                        className={clsx(
                          "rounded-full border px-3 py-1 text-sm font-medium transition-colors duration-200",
                          active
                            ? "border-emerald-500 bg-emerald-100 text-emerald-800"
                            : "border-gray-200 bg-white text-gray-600 hover:border-emerald-300 hover:bg-gray-50",
                        )}
                      >
                        {quantity}
                      </button>
                    );
                  })}
                </div>
              </div>
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
                  onBlur={(e) => {
                    if (e.target.value.trim() !== "") return;
                    const count = Math.floor(Number(row.packSize));
                    if (!(unitPrice > 0) || count < 1) return;
                    update(row.key, {
                      price: formatPackagePrice(unitPrice * count),
                    });
                  }}
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
                  الإنجليزية:{" "}
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
        className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-white/70 px-4 py-5 text-sm font-medium text-slate-600 transition hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-800"
      >
        <PackagePlus size={24} className="text-emerald-600" />
        اضغط هنا لإضافة كرتونة أو شرينك
      </button>
    </section>
  );
}
