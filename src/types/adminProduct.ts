export interface AdminProductRow {
  id: string;
  wcId: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  price: number;
  salePrice: number | null;
  stockQuantity: number;
  stockStatus: string;
  imageUrl: string | null;
  isDeleted: boolean;
  isFavorite: boolean;
  updatedAt: string;
}
