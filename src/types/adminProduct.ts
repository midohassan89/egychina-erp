export interface AdminProductRow {
  id: string;
  wcId: number;
  name: string;
  nameEn: string | null;
  nameZh: string | null;
  sku: string | null;
  barcode: string | null;
  price: number;
  salePrice: number | null;
  buyingCost: number;
  /** Latest purchase-invoice piece cost, otherwise buyingCost. */
  lastPurchasePrice: number;
  stockQuantity: number;
  stockStatus: string;
  imageUrl: string | null;
  isDeleted: boolean;
  isFavorite: boolean;
  isWeighed: boolean;
  linkedProductId: string | null;
  bundleMultiplier: number | null;
  categoryId: string | null;
  brandId: string | null;
  categoryName: string | null;
  brandName: string | null;
  updatedAt: string;
}
