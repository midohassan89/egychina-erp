import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  CachedCategory,
  CachedCustomer,
  CachedProduct,
  CashierShift,
  LocalSale,
  SyncMetadata,
} from "@/types/woocommerce";

const DB_NAME = "supermarket-pos";
const DB_VERSION = 3;

interface POSDatabase extends DBSchema {
  products: {
    key: number;
    value: CachedProduct;
    indexes: { "by-name": string; "by-sku": string };
  };
  categories: {
    key: number;
    value: CachedCategory;
  };
  customers: {
    key: number;
    value: CachedCustomer;
  };
  sales: {
    key: string;
    value: LocalSale;
    indexes: {
      "by-createdAt": string;
      "by-syncStatus": string;
      "by-shiftId": string;
    };
  };
  shifts: {
    key: string;
    value: CashierShift;
    indexes: { "by-status": string };
  };
  metadata: {
    key: "sync" | "activeShiftId";
    value: SyncMetadata | string | null;
  };
}

let dbPromise: Promise<IDBPDatabase<POSDatabase>> | null = null;

function emptyMetadata(): SyncMetadata {
  return {
    lastSyncedAt: null,
    productCount: 0,
    categoryCount: 0,
    customerCount: 0,
  };
}

function getDB(): Promise<IDBPDatabase<POSDatabase>> {
  if (!dbPromise) {
    dbPromise = openDB<POSDatabase>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        if (!db.objectStoreNames.contains("products")) {
          const productStore = db.createObjectStore("products", {
            keyPath: "id",
          });
          productStore.createIndex("by-name", "name", { unique: false });
          productStore.createIndex("by-sku", "sku", { unique: false });
        }
        if (!db.objectStoreNames.contains("categories")) {
          db.createObjectStore("categories", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("metadata")) {
          db.createObjectStore("metadata");
        }
        if (!db.objectStoreNames.contains("customers")) {
          db.createObjectStore("customers", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("sales")) {
          const sales = db.createObjectStore("sales", { keyPath: "id" });
          sales.createIndex("by-createdAt", "createdAt", { unique: false });
          sales.createIndex("by-syncStatus", "syncStatus", { unique: false });
          sales.createIndex("by-shiftId", "shiftId", { unique: false });
        } else if (oldVersion < 3) {
          const sales = transaction.objectStore("sales");
          if (!sales.indexNames.contains("by-shiftId")) {
            sales.createIndex("by-shiftId", "shiftId", { unique: false });
          }
        }
        if (!db.objectStoreNames.contains("shifts")) {
          const shifts = db.createObjectStore("shifts", { keyPath: "id" });
          shifts.createIndex("by-status", "status", { unique: false });
        }
      },
    });
  }
  return dbPromise;
}

export async function getCachedProducts(): Promise<CachedProduct[]> {
  const db = await getDB();
  return db.getAll("products");
}

export async function getCachedProductById(
  id: number,
): Promise<CachedProduct | undefined> {
  const db = await getDB();
  return db.get("products", id);
}

export async function getCachedProductBySku(
  sku: string,
): Promise<CachedProduct | undefined> {
  const db = await getDB();
  const matches = await db.getAllFromIndex("products", "by-sku", sku);
  return matches[0];
}

export async function searchCachedProducts(
  query: string,
): Promise<CachedProduct[]> {
  const db = await getDB();
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return db.getAll("products");
  }

  const all = await db.getAll("products");
  return all.filter(
    (p) =>
      p.name.toLowerCase().includes(normalized) ||
      p.sku.toLowerCase().includes(normalized),
  );
}

export async function getCachedCategories(): Promise<CachedCategory[]> {
  const db = await getDB();
  return db.getAll("categories");
}

export async function getCachedCustomers(): Promise<CachedCustomer[]> {
  const db = await getDB();
  return db.getAll("customers");
}

export async function searchCachedCustomers(
  query: string,
): Promise<CachedCustomer[]> {
  const db = await getDB();
  const all = await db.getAll("customers");
  const normalized = query.trim().toLowerCase();
  if (!normalized) return all;

  return all.filter((c) => {
    const name = `${c.first_name} ${c.last_name}`.toLowerCase();
    return (
      name.includes(normalized) ||
      c.email.toLowerCase().includes(normalized) ||
      (c.billing.phone ?? "").includes(normalized)
    );
  });
}

export async function getSyncMetadata(): Promise<SyncMetadata> {
  const db = await getDB();
  const meta = (await db.get("metadata", "sync")) as SyncMetadata | undefined;
  return {
    ...emptyMetadata(),
    ...meta,
    customerCount: meta?.customerCount ?? 0,
  };
}

export async function saveCatalogToCache(
  products: CachedProduct[],
  categories: CachedCategory[],
  customers: CachedCustomer[] = [],
): Promise<SyncMetadata> {
  const db = await getDB();
  const tx = db.transaction(
    ["products", "categories", "customers", "metadata"],
    "readwrite",
  );

  await tx.objectStore("products").clear();
  await tx.objectStore("categories").clear();
  await tx.objectStore("customers").clear();

  for (const product of products) {
    await tx.objectStore("products").put(product);
  }
  for (const category of categories) {
    await tx.objectStore("categories").put(category);
  }
  for (const customer of customers) {
    await tx.objectStore("customers").put(customer);
  }

  const metadata: SyncMetadata = {
    lastSyncedAt: new Date().toISOString(),
    productCount: products.length,
    categoryCount: categories.length,
    customerCount: customers.length,
  };

  await tx.objectStore("metadata").put(metadata, "sync");
  await tx.done;

  return metadata;
}

export async function saveSale(sale: LocalSale): Promise<void> {
  const db = await getDB();
  await db.put("sales", sale);
}

export async function getSales(): Promise<LocalSale[]> {
  const db = await getDB();
  const sales = await db.getAll("sales");
  return sales.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getPendingSales(): Promise<LocalSale[]> {
  const db = await getDB();
  const pending = await db.getAllFromIndex("sales", "by-syncStatus", "pending");
  const failed = await db.getAllFromIndex("sales", "by-syncStatus", "failed");
  return [...pending, ...failed];
}

export async function getSalesByShiftId(shiftId: string): Promise<LocalSale[]> {
  const db = await getDB();
  const sales = await db.getAllFromIndex("sales", "by-shiftId", shiftId);
  return sales.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function saveShift(shift: CashierShift): Promise<void> {
  const db = await getDB();
  await db.put("shifts", shift);
}

export async function getShiftById(
  id: string,
): Promise<CashierShift | undefined> {
  const db = await getDB();
  return db.get("shifts", id);
}

export async function getActiveShift(): Promise<CashierShift | null> {
  const db = await getDB();
  const activeId = (await db.get("metadata", "activeShiftId")) as
    | string
    | null
    | undefined;

  if (activeId) {
    const shift = await db.get("shifts", activeId);
    if (shift && shift.status === "open") return shift;
  }

  // Fallback: any open shift
  const open = await db.getAllFromIndex("shifts", "by-status", "open");
  return open[0] ?? null;
}

export async function setActiveShiftId(shiftId: string | null): Promise<void> {
  const db = await getDB();
  if (shiftId == null) {
    await db.delete("metadata", "activeShiftId");
  } else {
    await db.put("metadata", shiftId, "activeShiftId");
  }
}

export async function clearCatalogCache(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(
    ["products", "categories", "customers", "metadata"],
    "readwrite",
  );
  await tx.objectStore("products").clear();
  await tx.objectStore("categories").clear();
  await tx.objectStore("customers").clear();
  await tx.objectStore("metadata").delete("sync");
  await tx.done;
}
